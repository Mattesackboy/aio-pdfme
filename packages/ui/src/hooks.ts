import { RefObject, useRef, useState, useCallback, useEffect } from 'react';
import {
  cloneDeep,
  ZOOM,
  Template,
  Size,
  BasePdf,
  getB64BasePdf,
  b64toUint8Array,
  SchemaForUI,
  ChangeSchemas,
  isBlankPdf,
} from '@pdfme/common';
import { pdf2img, pdf2size } from '@pdfme/converter';

import {
  schemasList2template,
  uuid,
  getUniqueSchemaName,
  moveCommandToChangeSchemasArg,
  arrayBufferToBase64,
  initShortCuts,
  destroyShortCuts,
} from './helper.js';
import { RULER_HEIGHT } from './constants.js';

export const usePrevious = <T>(value: T) => {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    ref.current = value;
  });

  return ref.current;
};

const getScale = (n: number, paper: number) =>
  Math.floor((n / paper > 1 ? 1 : n / paper) * 100) / 100;

type UIPreProcessorProps = { template: Template; size: Size; zoomLevel: number; maxZoom: number };

type BasePdfRaster = { pageSizes: Size[]; backgrounds: string[] };

export const useUIPreProcessor = ({ template, size, zoomLevel, maxZoom }: UIPreProcessorProps) => {
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [pageSizes, setPageSizes] = useState<Size[]>([]);
  const [scale, setScale] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // A real basePdf is rasterized at scale = maxZoom (A4 at 800%: 4762x6735 px), which is slow,
  // so the raster is made once and reused while the basePdf stays the same: a resize or the
  // class re-sending the edited template then only recomputes the scale. Keyed by the basePdf
  // itself (=== compares a string, data URI or URL, by its text and binary data by reference)
  // and maxZoom.
  // Blank-basePdf pages are never cached: they follow the current (dynamic) template's schemas.
  // Data URLs, not blob: URLs: the same bitmap, with no blob URL lifecycle to manage (nothing to
  // revoke).
  const rasterCache = useRef<{
    basePdf: BasePdf;
    maxZoom: number;
    promise: Promise<BasePdfRaster>;
  } | null>(null);
  const requestId = useRef(0);
  const isMounted = useRef(true);

  const getRaster = (basePdf: string | ArrayBuffer | Uint8Array, maxZoom: number) => {
    const cached = rasterCache.current;
    if (cached && cached.basePdf === basePdf && cached.maxZoom === maxZoom) {
      return cached.promise;
    }

    const promise = (async (): Promise<BasePdfRaster> => {
      const _basePdf = await getB64BasePdf(basePdf);

      const uint8Array = b64toUint8Array(_basePdf);
      // Create a new ArrayBuffer copy to avoid detachment issues
      const pdfArrayBuffer = new ArrayBuffer(uint8Array.byteLength);
      new Uint8Array(pdfArrayBuffer).set(uint8Array);

      const [_pages, imgBuffers] = await Promise.all([
        pdf2size(pdfArrayBuffer),
        pdf2img(pdfArrayBuffer.slice(), { scale: maxZoom }),
      ]);
      return { pageSizes: _pages, backgrounds: imgBuffers.map(arrayBufferToBase64) };
    })();

    const entry: NonNullable<typeof rasterCache.current> = { basePdf, maxZoom, promise };
    rasterCache.current = entry;
    promise.catch(() => {
      // never keep a failed raster
      if (rasterCache.current === entry) rasterCache.current = null;
    });
    return promise;
  };

  const init = async (prop: { template: Template; size: Size }) => {
    const {
      template: { basePdf, schemas },
      size,
    } = prop;

    let paperWidth: number;
    let paperHeight: number;
    let _backgrounds: string[];
    let _pageSizes: { width: number; height: number }[];

    if (isBlankPdf(basePdf)) {
      const { width, height } = basePdf;
      paperWidth = width * ZOOM;
      paperHeight = height * ZOOM;
      _backgrounds = schemas.map(
        () =>
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj+P///38ACfsD/QVDRcoAAAAASUVORK5CYII=',
      );
      _pageSizes = schemas.map(() => ({ width, height }));
    } else {
      const raster = await getRaster(basePdf, maxZoom);
      _pageSizes = raster.pageSizes;
      paperWidth = _pageSizes[0].width * ZOOM;
      paperHeight = _pageSizes[0].height * ZOOM;
      _backgrounds = raster.backgrounds;
    }

    const _scale = Math.min(
      getScale(size.width, paperWidth),
      getScale(size.height - RULER_HEIGHT, paperHeight),
    );

    return {
      backgrounds: _backgrounds,
      pageSizes: _pageSizes,
      scale: _scale,
    };
  };

  // Only the latest init may set the state (or the error): an older one that finishes later,
  // e.g. the raster of a basePdf that was replaced meanwhile, is dropped.
  const runInit = async (prop: { template: Template; size: Size }) => {
    const id = ++requestId.current;
    const isLatest = () => isMounted.current && id === requestId.current;
    try {
      const { pageSizes, scale, backgrounds } = await init(prop);
      if (!isLatest()) return;
      setPageSizes(pageSizes);
      setScale(scale);
      setBackgrounds(backgrounds);
    } catch (err) {
      if (isLatest()) throw err;
    }
  };

  useEffect(() => {
    runInit({ template, size }).catch((err: Error) => {
      setError(err);
      console.error('[@pdfme/ui]', err);
    });
  }, [template, size]);

  useEffect(
    () => () => {
      isMounted.current = false;
      rasterCache.current = null;
    },
    [],
  );

  return {
    backgrounds,
    pageSizes,
    scale: scale * zoomLevel,
    error,
    refresh: (template: Template) => runInit({ template, size }),
  };
};

type ScrollPageCursorProps = {
  ref: RefObject<HTMLDivElement>;
  pageSizes: Size[];
  scale: number;
  pageCursor: number;
  onChangePageCursor: (page: number) => void;
};

export const useScrollPageCursor = ({
  ref,
  pageSizes,
  scale,
  pageCursor,
  onChangePageCursor,
}: ScrollPageCursorProps) => {
  const onScroll = useCallback(() => {
    if (!pageSizes[0] || !ref.current) {
      return;
    }

    const scroll = ref.current.scrollTop;
    const { top } = ref.current.getBoundingClientRect();
    const pageHeights = pageSizes.reduce((acc, cur, i) => {
      let value = (cur.height * ZOOM + RULER_HEIGHT) * scale;
      if (i === 0) {
        value += top - value / 2;
      } else {
        value += acc[i - 1];
      }

      return acc.concat(value);
    }, [] as number[]);
    let _pageCursor = 0;
    pageHeights.forEach((ph, i) => {
      if (scroll > ph) {
        _pageCursor = i + 1 >= pageHeights.length ? pageHeights.length - 1 : i + 1;
      }
    });
    if (_pageCursor !== pageCursor) {
      onChangePageCursor(_pageCursor);
    }
  }, [onChangePageCursor, pageCursor, pageSizes, ref, scale]);

  useEffect(() => {
    ref.current?.addEventListener('scroll', onScroll);

    return () => {
      ref.current?.removeEventListener('scroll', onScroll);
    };
  }, [ref, onScroll]);
};

export const useMountStatus = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setIsMounted(true), 500);
    return () => clearTimeout(timeout);
  }, []);

  return isMounted;
};

interface UseInitEventsParams {
  pageCursor: number;
  pageSizes: Size[];
  activeElements: HTMLElement[];
  template: Template;
  schemasList: SchemaForUI[][];
  changeSchemas: ChangeSchemas;
  commitSchemas: (newSchemas: SchemaForUI[]) => void;
  removeSchemas: (ids: string[]) => void;
  onSaveTemplate: (t: Template) => void;
  past: React.MutableRefObject<SchemaForUI[][]>;
  future: React.MutableRefObject<SchemaForUI[][]>;
  setSchemasList: React.Dispatch<React.SetStateAction<SchemaForUI[][]>>;
  onEdit: (targets: HTMLElement[]) => void;
  onEditEnd: () => void;
}

export const useInitEvents = ({
  pageCursor,
  pageSizes,
  activeElements,
  template,
  schemasList,
  changeSchemas,
  commitSchemas,
  removeSchemas,
  onSaveTemplate,
  past,
  future,
  setSchemasList,
  onEdit,
  onEditEnd,
}: UseInitEventsParams) => {
  const copiedSchemas = useRef<SchemaForUI[] | null>(null);

  const initEvents = useCallback(() => {
    const getActiveSchemas = () => {
      const ids = activeElements.map((ae) => ae.id);

      return schemasList[pageCursor].filter((s) => ids.includes(s.id));
    };
    const timeTravel = (mode: 'undo' | 'redo') => {
      const isUndo = mode === 'undo';
      const stack = isUndo ? past : future;
      if (stack.current.length <= 0) return;
      (isUndo ? future : past).current.push(cloneDeep(schemasList[pageCursor]));
      const s = cloneDeep(schemasList);
      s[pageCursor] = stack.current.pop()!;
      setSchemasList(s);
    };
    initShortCuts({
      move: (command, isShift) => {
        const pageSize = pageSizes[pageCursor];
        const activeSchemas = getActiveSchemas();
        const arg = moveCommandToChangeSchemasArg({ command, activeSchemas, pageSize, isShift });
        changeSchemas(arg);
      },

      copy: () => {
        const activeSchemas = getActiveSchemas();
        if (activeSchemas.length === 0) return;
        copiedSchemas.current = activeSchemas;
      },
      paste: () => {
        if (!copiedSchemas.current || copiedSchemas.current.length === 0) return;
        const schema = schemasList[pageCursor];
        const stackUniqueSchemaNames: string[] = [];
        const pasteSchemas = copiedSchemas.current.map((cs) => {
          const id = uuid();
          const name = getUniqueSchemaName({
            copiedSchemaName: cs.name,
            schema,
            stackUniqueSchemaNames,
          });
          const { height, width, position: p } = cs;
          const ps = pageSizes[pageCursor];
          const position = {
            x: p.x + 10 > ps.width - width ? ps.width - width : p.x + 10,
            y: p.y + 10 > ps.height - height ? ps.height - height : p.y + 10,
          };

          return Object.assign(cloneDeep(cs), { id, name, position });
        });
        commitSchemas(schemasList[pageCursor].concat(pasteSchemas));
        onEdit(pasteSchemas.map((s) => document.getElementById(s.id)!));
        copiedSchemas.current = pasteSchemas;
      },
      redo: () => timeTravel('redo'),
      undo: () => timeTravel('undo'),
      save: () =>
        onSaveTemplate && onSaveTemplate(schemasList2template(schemasList, template.basePdf)),
      remove: () => removeSchemas(getActiveSchemas().map((s) => s.id)),
      esc: onEditEnd,
      selectAll: () => onEdit(schemasList[pageCursor].map((s) => document.getElementById(s.id)!)),
    });
  }, [
    template,
    activeElements,
    pageCursor,
    pageSizes,
    changeSchemas,
    commitSchemas,
    schemasList,
    onSaveTemplate,
    removeSchemas,
    past,
    future,
    setSchemasList,
    copiedSchemas,
    onEdit,
    onEditEnd,
  ]);

  const destroyEvents = useCallback(() => {
    destroyShortCuts();
  }, []);

  useEffect(() => {
    initEvents();

    return destroyEvents;
  }, [initEvents, destroyEvents]);
};

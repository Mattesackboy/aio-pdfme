# aio-pdfme — Project Context

The owner's fork of [pdfme](https://github.com/pdfme/pdfme), public on GitHub as `Mattesackboy/aio-pdfme`. The only part the owner uses is the **playground webapp**, a Vite + React SPA on Firebase Hosting (https://aio-pdfme.web.app). He uses it to design and adjust **invoice templates** in the pdfme Designer. The invoices are generated downstream by **aio-promo-monitor** (NestJS). That repo installs npm `@pdfme/common`, `generator` and `schemas` **5.3.15**, consumes the template JSON designed here and never imports this repo's code. Keep changes local and incremental.

---

# MODELLO OPERATIVO (VINCOLANTE — mandato owner)

> Questo modello ha priorità su tutto il resto del file e su ogni comportamento di default. Vale per **tutte** le sessioni su questo repo. È il modello di aio-promo-monitor, portato qui (2026-10-17) senza le parti specifiche di quel BE/FE.

## Ruoli
- **Main chat = ORCHESTRATORE + REVIEWER FINALE, e basta.** Il modello lo sceglie l'owner a inizio sessione (default: **Opus** — le sessioni lunghe/intermittenti ripagano l'intero contesto a ogni ripresa fredda della cache, e Fable costa 2× Opus a parità di token). Non scrive MAI inline codice, test o doc sostanziali: TUTTO il lavoro autoriale è fatto da SUBAGENT, lanciati in background e **SERIALI di default** (parallelo solo su mio OK esplicito — sono token-conscious).
- **Con ULTRACODE attivo il default si ribalta: Workflow + PARALLELISMO** — gli step indipendenti partono insieme. **Ma PRIMA di lanciare, SEMPRE la roadmap in chat:** quanti agent, quali in parallelo e quali in serie, con che modello (mandato owner 2026-09-28, verbatim: *«prima SEMPRE dirmi la roadmap di quanti agents si vuole lanciare, cosi non ne partono 15 in parallelo di fable per dire»*).
- **Modello subagent — Opus per TUTTO il lavoro autoriale:** codice, test, ops, studi, mockup/artifact/prototipi, iterazioni di design, bozze di spec/doc. **Fable SOLO per (a) la review avversariale di un diff di codice e (b) la scrittura di plan/spec quando resta davvero un'ambiguità di design da giudicare** (mandato owner 2026-09-09, verbatim: *«dai prossimi run usa solo opus basta fable, fable lo teniamo per le review del codice e dove veramente serve forse per scrivere plan/spec»* — supersede i mandati 2026-09-06/07 che volevano Fable per studi, review e artifact). Nel tool Workflow passare `model: 'opus'` ESPLICITO (con la main chat su Fable il modello non si eredita).
- **Main chat SOTTILE: ogni blocco di lavoro lo dirige un ORCHESTRATORE lanciato dalla main chat** (mandato owner 2026-10-09, verbatim: *«per non far compattare il contesto della chat, bisogna SEMPRE lavorare che la main chat lancia un orchestratore (fable se possibile) che gestisce tutto il workflow e tutte le ondate/fasi (che sono studio critica scrittura revisione fix tipo)»*). Un blocco (una spec, una fase di build, uno studio) = UN Workflow che concatena studio → scrittura (Opus) → critica (Fable) → fix (Opus) → ri-verifica (Fable) fino a pulito; dentro il workflow un agent **Fable** fa da direttore/reviewer e legge il risultato riga per riga. Alla main chat torna SOLO un report corto (esito, file, numeri di verifica, gap, punti da decidere): non rilegge i diff/doc interi, verifica a campione ancoraggi e claim del report, tiene il filo con l'owner e registra le decisioni. La roadmap in chat PRIMA di lanciare resta obbligatoria.
- **Pipeline a misura del lavoro** (mandato owner 2026-10-15, verbatim: *«non devi usare sempre per ogni micro task sempre opus+fable+opus+fable [...] cerca di valutare la grandezza delle cose che devi fare se sono puttanate penso basti meno»*). Il loop Opus→Fable→Opus→Fable è per spec, feature multi-file e lavori critici. Un micro-fix (un file, ≲30 righe, causa chiara) = UN agent Opus + verifica, e la main chat rilegge lei il diff piccolo. Fable solo se il cambio tocca soldi, dati prod o sicurezza — qui anche il contratto con aio-promo-monitor (formato template, nomi font, tipi di schema) e ciò che va in deploy.
- Ogni subagent riceve nel prompt: contesto completo, fonti da leggere PRIMA, scope esatto (SOLO quello), regole, formato del report; e il permesso di usare liberamente ogni MCP/tool per informazioni di prima mano.

## Economia dei token (vincolante)
- **MAI resume di un subagent con transcript grosso per un delta piccolo:** ogni resume ripaga tutto il transcript accumulato (lezione 2026-07: 2 fix cosmetici a un mockup via resume sono costati più del mockup intero). Per modifiche mirate → agent FRESCO con brief chirurgico (file esatto, righe, cosa cambiare); far rileggere un file costa sempre meno che ripagare un transcript da centinaia di k.
- **Mandati di lettura a lista chiusa:** elencare i file esatti (con righe quando possibile) e vietare l'esplorazione oltre la lista. Mai "esplora / risali la catena" se l'orchestratore può fornire l'anchor già verificato.
- **Review riga-per-riga solo su ciò che shippa** (codice, spec, doc di decisione). Artefatti throwaway a rischio zero (mockup HTML, bozze intermedie) → spot-check mirato dei punti che contano.
- **Micro-append inline (eccezione stretta al «main chat non scrive MAI ... doc» di §Ruoli):** un `[DECISO]` già scolpito in chat da registrare, o un fix di doc/commento STANTIO — poche righe, zero ragionamento/design nuovo — li scrive l'orchestratore INLINE, subito: persistenza immediata (a prova di crash-chat) e più economica di spinnare un subagent per 3 righe. Resta subagent + review tutto ciò che è autoriale vero: prosa di decisione nuova, razionali, spec, codice, test.

## Review (il cuore del metodo)
- **Ogni diff destinato a shippare si rilegge riga per riga** prima di dichiararlo buono — lo fa il Fable del workflow (mandato 2026-10-09), la main chat solo per i micro-fix (mandato 2026-10-15) — verificando di prima mano gli ancoraggi (`file:line`) e i claim direzionali NEL CODICE REALE: mai fidarsi della narrativa del report. (Artefatti throwaway: spot-check — vedi «Economia dei token».)
- **Livello opzionale (lavori grossi/critici):** un SECONDO subagent fa la review avversariale del diff del primo; la main chat fa la **review-della-review** (verifica a campione i finding + i claim di entrambi).
- Le risposte alle domande di review dell'owner sono SEMPRE grounded su `file:line` letti freschi, mai a memoria.

## Fix e autorizzazioni
- **Ogni fix di comportamento:** finding → proposta potabile (problema in parole semplici + fix proposto + file toccati + piano di verifica) → **WAIT dell'OK dell'owner** → dispatch → review → report.
- **Eccezione permanente:** commenti/doc STANTII si fixano SEMPRE senza chiedere.
- **Git = SOLO owner.** Nessun commit/push/stash/checkout senza richiesta esplicita (l'owner committa lui, file-per-file dopo la sua review). **Read-only git (status/diff/log/show) sempre OK.**

## File-first (le decisioni riposano in git, non in chat)
- Ogni decisione + razionale va in file committabili del repo (docs/, spec, commenti tersi nel codice) — MAI solo in chat o memoria agent (che è solo un ausilio secondario di recall). Gli studi vanno in `docs/research/YYYY-MM-DD-<topic>.md`.
- **Ogni [DECISO] va diffato VERBATIM col documento primario** prima di implementarlo; una contraddizione Goal-vs-sketch dentro un dossier = STOP. (Lezione pagata cara: uno sketch che contraddiceva il Goal ha invertito una decisione ed è passato in codice.)
- I gap noti si scolpiscono ANCHE nel codice con marker greppabili (`TODO(<token>)`) nel punto dove un dev li incrocerà.
- **Ogni sessione chiude con un handoff datato** in `docs/superpowers/HANDOFF-YYYY-MM-DD-<topic>.md`: sommario COMPLETO a zero perdita di informazione (decisioni + razionali, finding, thread aperti, waiting-on, trappole operative).
- **Il prompt di avvio della sessione successiva NON va nell'handoff: si consegna SEMPRE e SOLO in chat**, come ultimo messaggio, pronto da incollare (mandato owner 2026-09-06, verbatim: *«devi smetterla di scriverlo solo nell'handoff e darmelo sempre e solo in chat il prompt di avvio»*). L'handoff è il documento che resta in git; il prompt è roba che lui copia al volo dalla chat, e infilarlo nel doc lo obbliga ad andarselo a pescare.

## Feature multi-step (pipeline standard)
1. **Studio** (Opus): stato dell'arte con ancore verificate, opzioni con trade-off, domande per l'owner → presentato all'owner, si aspettano le SUE decisioni.
2. **Spec eseguibile** (Opus a decisioni chiuse; Fable solo se restano vere ambiguità di design da giudicare): firme esatte, file toccati con `file:line` verificati di prima mano, JSON/output attesi VERBATIM (= asserzioni dei test), test plan con le mutation obbligatorie, fasi con gate, sezione "cosa NON si fa", gap onesti.
3. **Review della spec** (orchestratore): ancoraggi ri-verificati nel codice.
4. **Esecuzione a fasi** (Opus, seriali): ogni fase ha il suo gate e la sua review riga-per-riga prima della successiva.
5. **Chiusura:** gate finale completo + smoke/collaudo empirico dove esiste un ambiente sicuro + aggiornamento doc + handoff.

## Report all'owner (sempre "potabili")
In linguaggio semplice, SEMPRE con: chi ha scritto cosa (mai la main chat), lista file esatta, numeri di verifica (test passed/failed/total, build, lint), e i **gap onesti** — ciò che NON è coperto/verificato si dichiara, non si nasconde. Esito primo, dettagli dopo.

**BREVITÀ (mandato owner 2026-07-26, vincolante):** in chat risposte **CORTE** — esito in una riga, dettagli SOLO se li chiede. Mai sezioni/tabelle/elenchi per cose che stanno in tre righe. I resoconti lunghi vanno nei **doc committabili** (handoff, tracker), non in chat. Se chiede «cosa toglieresti», rispondere con la cosa, non col ragionamento che ci porta. E **dire sempre esplicitamente quando si dispatcha un subagent** («dispatchato X, foreground») — senza quella riga l'owner crede che la main chat stia scrivendo codice inline, ed è una violazione del mandato. Verbatim owner: *«che bello quando parli dicendo pochissimo e non scrivi poemi»*.

## Igiene operativa
- Todo list della pipeline sempre aggiornata (visibile all'owner).
- Subagent morto/muto (0 tool_uses) → verificare su disco cosa ha davvero scritto, poi resume con recap o rilancio con mandato consolidato — mai assumere che abbia lavorato.
- "Fatto" si dice SOLO dopo verifica di prima mano su disco/sistema, mai sul report del subagent.

---

## Overview

- `packages/*` hold pdfme's TypeScript libraries (npm workspaces). They are upstream code; the only local changes are the 2026-10-18 fixes in `packages/ui`: the crash fix (`DetailView/index.tsx`, `Renderer.tsx`, commit `bc442b2`) and the resize fix (`hooks.ts`, `Designer/index.tsx`, commit `2f1bd43`). `playground/` is the webapp, where all of the owner's other changes live.
- Routes (`playground/src/App.tsx`): `/` and `/designer` open the Designer (the owner's tool), `/form-viewer` opens Form/Viewer, and `/templates` is the upstream sample gallery.
- Designer toolbar (`playground/src/routes/Designer.tsx`):
  - Load Template (JSON file).
  - Change BasePDF: embeds the PDF into `basePdf` as a base64 data URI.
  - Save Local: localStorage key `template`, restored on the next load.
  - Reset.
  - DL Template: downloads the JSON.
  - Generate PDF: in-browser `generate()` with the same fonts and plugins.
  - Edit static schema: blank basePdf only.
- The downloaded JSON is what goes into aio-promo-monitor (see Downstream contract).

## Repo layout

| Path | What |
|---|---|
| `packages/common` | types, zod validation, helpers (`checkFont`, `checkPlugins`, `cloneDeep`) |
| `packages/schemas` | schema plugins (text, image, barcodes, table, shapes, ...) |
| `packages/generator` | `generate()`, on the pdf-lib fork `@pdfme/pdf-lib` |
| `packages/ui` | React Designer / Form / Viewer |
| `packages/converter` | `pdf2img` / `pdf2size` (pdfjs-dist 3.11.174; the Node entry needs node-canvas) |
| `packages/manipulator` | merge/split utilities |
| `playground/` | the webapp (Vite 4.5, React 18, Tailwind) |
| `website/` | upstream Docusaurus docs (unused) |
| `.github/` | upstream CI and npm-publish workflows (0 runs on the fork) |
| `.clinerules`, `memory_bank/` | legacy upstream Cline files. **This CLAUDE.md is the source of truth**; don't maintain them |

Inside `playground/`:
- `src/helper.ts`: `getFontsData()` (:18-116, the font map; every font is an absolute URL built by `fontUrl()`), `generatePDF()` and the template I/O helpers.
- `src/routes/Designer.tsx`: builds the Designer and sets its options (`maxZoom: 800` at :66).
- `src/plugins/index.ts`: the 18 schema types the Designer offers.
- `public/fonts/`: 25 files (8.8 MB). `getFontsData()` loads 18 of them. The other 7 (`helvetica-font*`, `arial-mt*`, `courier*`) are unused, but stay.
- `public/template-assets/`: upstream sample templates. `index.json` and the `thumbnail.png` files are generated (gitignored). `scripts/` holds the two generators.
- `dist/`: the **deploy artifact** (gitignored). Hosting config is in `firebase.json` and `.firebaserc`.
- `node_modules/@pdfme/*` are symlinks into `packages/*/dist` (the `file:../packages/*/dist` dependencies). The webapp runs the **built** packages: Vite serves `packages/*/dist/esm/...` and `packages/ui/dist/index.es.js`. A change in `packages/*/src` does nothing until you rebuild.

## Fork status

- Fork point: **upstream `d1db660`** (2025-04-08, "Update dependencies to latest versions"). That is tag `5.3.15` + 15 commits, 4 commits before `5.3.16`: the same release line as aio-promo-monitor's npm 5.3.15. Upstream is now at 6.2.6 (2026-10-16).
- `origin` is github.com/Mattesackboy/aio-pdfme, a public GitHub fork of pdfme/pdfme. There is no `upstream` remote and there are no tags, so `PDFME_VERSION` and the `pdfmeVersion` of saved templates are `"x.x.x"`.
- `website/`, `scripts/` and the root `package.json` are identical to `d1db660`, and so is `packages/` except the crash and resize fixes in `packages/ui` (`bc442b2`, `2f1bd43`). The owner's commits:
  - **Fonts** (5607bd1, 4b04a16, 4c5ce35, 135f63e, 7aa1cc3, 0f9d910): `getFontsData()` became async. It lists 18 TTF/OTF files from `/fonts` on top of upstream Roboto, with `Helvetica` as the fallback font. Designer and Form/Viewer `await` it. Until `bc442b2` the files were fetched as `Uint8Array` (7.76 MB), which triggered the crash; now each font is an absolute URL.
  - **Zoom** (b77744f): `maxZoom` raised from 250 to 800.
  - **Hosting** (26e4847): Firebase Hosting replaces upstream's gh-pages deploy (`firebase.json`, `.firebaserc`, the `deploy` script, `.firebase` gitignored). It also added the `firebase` web SDK dependency, which nothing in `src` imports.
  - **Node pin** (0f9d910): `.nvmrc` = `22`.
  - **Crash fix** (bc442b2, 2026-10-18): fonts as absolute URLs, a replacer in DetailView's `JSON.stringify(options)` deps, the port of upstream #1576 in `Renderer.tsx`, and the React DevTools opt-out in `playground/index.html`.
  - **Deploy tooling** (33d5285, 2026-10-18): `firebase-tools` 15.30.2, pinned as a playground devDependency.
  - **Resize** (2f1bd43, 2026-10-18): the basePdf raster is cached per basePdf + maxZoom, so a resize only rescales. The editor skips the re-sync when the class echoes a template it already applied or emitted (a WeakSet), so selection and scroll survive a resize.
- Leftovers from upstream in the playground are harmless; don't remove them unless asked. They are: Sentry (`sentryVitePlugin` for upstream org `hand-dot`; `Sentry.init` reads `VITE_SENTRY_DSN`, which no `.env` in the repo sets), `copy-vercel-config`, the pdfme links and toasts in the Designer nav, and the upstream e2e tests.

## Commands

- **Node:** `.nvmrc` says `22`, but this machine defaults to Node 24.21 (nvm `lts/*`). The installed node-canvas 2.11.2 is compiled for Node 22 (ABI 127) and fails to load on Node 24 (ABI 137). So `npm run dev`, `npm run build` and `npm run deploy` in `playground/`, which all run `generate-template-assets`, need `nvm use` first. Vite itself runs fine on Node 24. (Verified 2026-10-17 by importing `@pdfme/converter`'s Node entry under both versions.)
- **Don't run `npm install` / `npm ci`** unless asked. It rewrites `node_modules` and the lockfiles, re-runs the root `postinstall` (`scripts/link-workspaces.sh`, which `npm link`s every package) and can rebuild native modules for the wrong Node.
- **Packages:** root `npm run build` runs `clean` first, deleting every `packages/*/dist`; the running webapp stays broken until the build finishes. It then builds common, converter and schemas in order, and generator, ui and manipulator in parallel. Per package: `npm run build`, or `npm run dev` for watch mode. Tests: root `npm run test` (Jest in every workspace). Lint: root `npm run lint`.
- **Webapp, safe:** `cd playground && npx vite`, then open http://localhost:5173. This only starts the dev server; the only thing it writes is Vite's cache in `node_modules/.vite`. `npm run dev` first runs `generate-template-assets`, which rewrites `public/template-assets/index.json`, the thumbnails and `scripts/thumbnail-hash-map.json` (all gitignored) and needs Node 22.
- **Production build to inspect:** `npx vite build --outDir <tmp-dir> --emptyOutDir` (about 10 s, one ~8.5 MB JS chunk). Never build into `playground/dist` except as part of a deploy. That folder is the deploy artifact: it was last built for the 2026-10-18 deploy, and its `assets/index-6ef2fd65.js` is what the live site serves.
- **Deploy (owner only):** `cd playground && nvm use && npm run deploy`. Its `predeploy` runs `npm run build` (template assets, `vite build`, copy `vercel.json`), then `firebase deploy --only hosting` deploys target `pdfme` to site `aio-pdfme` in Firebase project `aio-promo-monitor` (alias `prod`). The build needs Node 22. The `firebase` CLI comes from the playground's own `node_modules/.bin` (`firebase-tools` 15.30.2, a pinned devDependency since 2026-10-18), so no global install is needed. The global one exists only under nvm v24.16.0, which is why a plain `firebase` command is not found.
- **Deep links 404 on the live site:** `firebase.json` has no SPA rewrite. Opening `/` works, but loading or refreshing `/designer`, `/form-viewer` or `/templates` directly returns Firebase's 404. (Verified 2026-10-17.)

## Downstream contract (aio-promo-monitor)

The consumer is `aio-promo-monitor/src/shared/invoice-generator/`, using npm `@pdfme/common|generator|schemas` **5.3.15** with an override to `@pdfme/pdf-lib` 5.5.8. The contract is **template JSON + schema types + font names**.

- **Templates:** `assets/templates/<inline|multi_products|multi_line>/<vendor>[-ship|-no-ship].json`. There are 11 today, all 1 page with 16-35 fields. At load time the consumer **replaces** the JSON's `basePdf` with `assets/pdfs/<type>/<vendor>-base[...].pdf` (`utils/asset-loader.ts:115-124`). Design on the same page and size; field positions are in mm.
- **Schema types:** the consumer registers only `{ text, image, qrcode: barcodes.qrcode }` (`invoice-generator.service.ts:86`), while the Designer offers 18 types. Any other type makes `generate()` throw `... of template.schemas is not found in plugins`. Today the templates use only `text`, plus 2 `image` fields (foto_erhardt, thomann).
- **Fonts are matched by name.** `loadPdfFont` in `utils/asset-loader.ts` passes these font maps to `generate()`:

| Vendor | Font map |
|---|---|
| Euronics | `Arial` (fallback), `ArialBold` |
| Amazon | `Arial` (fallback) |
| Thomann | `OpenSansRegular` (fallback), `OpenSansMedium` (loads the **Bold** file), `OpenSansSemiBold`, `OpenSansBold` |
| Foto Erhardt | `SegoeUI` (fallback), `SegoeUIBoldItalic`, `Helvetica`, `HelveticaBold` |
| Unieuro, Mediaworld | none (`undefined`). Their `Helvetica` fields are drawn with pdf-lib's built-in standard Helvetica, with wrap/alignment metrics from the Roboto fallback (`@pdfme/schemas` 5.3.15 `text/pdfRender.js:55-56`) |

- Font names used by the templates today: Arial, ArialBold, Helvetica, HelveticaBold, OpenSansRegular, OpenSansMedium, OpenSansBold, SegoeUI, SegoeUIBoldItalic. When a font map is passed, a `fontName` missing from it makes `generate()` throw (`checkFont`: `... of template.schemas is not found in font`).
- **Font files:** the consumer keeps its own copies in `assets/fonts/`. Arial, ArialBold, OpenSans*, SegoeUI, SegoeUIBoldItalic and MyriadPro* are md5-identical to `playground/public/fonts/`. The consumer's `helvetica.ttf` and `helvetica-bold.ttf` are different files: they match this repo's **old** `helvetica-font.ttf` and `helvetica-font-bold.ttf` (not loaded here since 4c5ce35). So `Helvetica` and `HelveticaBold` in the Designer are not the faces the Foto Erhardt invoices embed. (Verified by md5, 2026-10-17.)
- **What can break invoices:** the keys of `getFontsData()` are part of the contract. Renaming or removing a font, adding a schema type the consumer doesn't register, or changing the template format can all break invoice generation in aio-promo-monitor. An upgrade of `packages/*` past 5.3.x could change the template format.

## Product constraints

- **`maxZoom: 800`** (`playground/src/routes/Designer.tsx:66`) is a hard owner requirement for fine detail work. Never lower it, or cap the effective zoom, as a "fix". (Owner, 2026-10-17, verbatim: *«mi serve quello zoom è comodissimo per fare piccoli dettagli»*.) Any fix must keep 800% usable **and** keep the PDF background sharp at high zoom.
- Typical load is a 1-page template with 16-35 text fields and a real PDF embedded as a base64 data-URI `basePdf` (20-470 KB), plus 18 custom fonts.

## Known issue

- **Designer tab crash ("Aw, Snap!" / "Uffa!", error code 5) and constant lag: root cause found, fix live.**
  - The cause was a V8 out-of-memory in the property panel's `JSON.stringify(options)` while the 18 fonts were passed as bytes: about 175 MiB per string, in 70/70 owner crash stacks. The React DevTools extension kept the strings alive.
  - The lag was the per-field font clone.
  - Study: `docs/research/2026-10-17-designer-crash-study.md`.
- Step 1 is committed as `bc442b2` and deployed (2026-10-18): fonts as absolute URLs, the DetailView replacer, the upstream #1576 port and the React DevTools opt-out.
- From step 2 only the resize part (F5 + F9) is applied, as `2f1bd43`. The rest (F4, F6–F8, F11, error reset, undo emit) is not wanted for now. The patches are in `docs/research/2026-10-18-step2-patches/`, and they no longer apply cleanly on top of `2f1bd43`. The measurements are in `docs/research/2026-10-18-step2-fixes-and-studies.md`.
- State and open decisions: `docs/superpowers/HANDOFF-2026-10-18-designer-crash-fix.md`.

## Allowed / Not allowed

**Allowed**
- Local, incremental changes in `playground/` (fonts, Designer options, UI), and targeted fixes in `packages/*`. Every behaviour fix goes through the finding → proposal → owner OK flow.
- Studies, handoffs, and fixes to stale comments or docs.
- Read-only git (status/diff/log/show).

**Not allowed**
- A wholesale upstream upgrade/merge/rebase of pdfme, or bumping `@pdfme/*` versions, without an explicit owner decision (aio-promo-monitor pins 5.3.15).
- Renaming or removing fonts: neither the keys in `getFontsData()` nor the files in `public/fonts/`.
- Lowering `maxZoom`.
- New dependencies without a strong justification.
- Global refactors, renames or architecture changes.
- Any git write, `npm run deploy` / `firebase deploy`, or overwriting `playground/dist`. These are the owner's alone.
- Committing secrets, credentials or real customer/invoice data. The repo and the site are both public.

**Conventions**
- Commit messages are always in English. New file and directory names are English kebab-case. Chat with the owner in Italian.
- Duplication inside a test file is fine. Never extract shared helpers just to dedupe, and never flag it in reviews (owner, 2026-09-26: *«non mi interessa un cazzo di duplicati DENTRO i test. non li leggero mai»*).

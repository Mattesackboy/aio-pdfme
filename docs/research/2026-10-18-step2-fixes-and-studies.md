# Step 2 fixes, integration and follow-up studies — 2026-10-18

Scratch patches and studies only: step 2 is not in the repository. Step 1 (F1–F3 of the
[crash study](2026-10-17-designer-crash-study.md)) is committed as `bc442b2`, together with the React DevTools opt-out of
§7, and has been live since 2026-10-18 ~17:27. A review of the combined patch led to changes: **the patch to apply is the
final one of §12** (`step2-finish/step2-combined.patch`). Every number below was measured first-hand, in the integration
run (§1–§11) or in the review-fix run (§12), unless it is marked *(reported)*: those come from the agent that built that
piece and were not re-run.

**Who did what.**

- The `step2-core` agent wrote F4 (pdf.js hygiene), F5 (background raster once per basePdf), F8 (undo cap) and F9 (no
  re-sync on the class's echo).
- The `step2-life` agent wrote F6 (playground lifecycle and `class.ts`), F7 (FontFace registry) and F11 (Firebase SPA
  rewrite, new: not in the study).
- Three studies ran in parallel: F10, a sharper 800% (`step2-zoom`); what kept 3+ GB alive in the owner's sessions
  (`step2-retain`); and the Designer preview against aio-promo-monitor's output (`step2-fidelity`).
- The integration agent (this file) merged the two patches on HEAD + step 1, rebuilt converter → ui → playground in
  scratch, ran the regression (step 1 against step 1 + step 2) and tested the React DevTools opt-out on the merged build.
- A review of the combined patch found one regression and two low points. The `step2-finish` agent fixed them and
  re-verified the final patch (§12), starting from the unfinished candidate of an earlier fix agent that had stopped
  without reporting.

**How it was measured.**

- Two production builds, made from scratch copies and never from the working tree:
  - `base` = HEAD + the step-1 spec. When it was built (03:30), its `helper.ts` and `Renderer.tsx` were byte-identical to
    the working tree's step 1 and `DetailView/index.tsx` differed only in formatting (for the 04:36 change see §10).
  - `int` = `base` + the combined step-2 patch.
  - The ESM tsc output of common, schemas, generator and converter is byte-identical to the repo's dists, and the base
    ui bundle is byte-identical to the step2-core agent's base build.
- Puppeteer 24.4, headless Chrome for Testing 134, 1512×900, DPR 2, the owner's `foto_erhardt` template (35 fields,
  1 page) unless noted. One browser at a time from this agent, but other agents' browsers ran in parallel and the Mac sat
  at ~47 of 48 GB swap, so milliseconds are inflated. Counts, hashes and ratios are robust.

## Verdict

- **The two step-2 patches merge cleanly and every threshold of both holds on the merged build.** They touch disjoint
  files. With the review fixes (§12) the final patch has 12 files and +449/−159 lines (most of `pdf2img.ts` is
  re-indentation). It applies with `patch -p1`, no fuzz and no offset, to a copy of the repository as it is now (HEAD
  `638c491`, step 1 included).
- **What step 2 adds on top of step 1** (§2):
  - A window resize, a Load Template of the same file, a language change or Ctrl+S no longer re-rasterizes the
    background: 0 freezes instead of one 280–400 ms freeze each time.
  - Designer ↔ Form/Viewer, 10 round trips: renderer +4 MB per trip instead of +74 MB, 19 FontFaces instead of 2,445,
    1 live pdfme instance instead of 21, 5.3 s of long tasks instead of 14.7 s.
  - The selection, the field ids and the scroll position survive a resize, a language change and Ctrl+S. Undo stops at
    100 steps. The Templates gallery and fast navigation leave no orphan instance, and the "instance is already destroyed"
    page errors are gone (15 → 0). Deep links stop returning 404 once deployed (F11).
  - 10-minute owner loop (zoom to 800%, scroll, select, drag, nudge, inline edit, Generate PDF, Load Template): no
    crash in either build; 0.5 s of long tasks instead of 4.4 s, 1 background raster instead of 10, 19 FontFaces instead
    of 79. A slow JS-heap growth remains in both (+0.18 MB per loop here, +0.27 on step 1), not identified (§10).
- **Review fixes (§12).** A gallery link (`?template=`) that does not load now opens the saved or a blank template
  instead of leaving the page without an editor: 41/41 probe cases right, against 6/41 as reviewed and 13/41 on step 1.
  The last 10 generated PDFs keep Download and reload; each costs about its own size (≈0.4 MB) in the browser process.
  The error-screen reset stays an optional patch.
- **Same output.** On all 11 templates the screenshots at 100% and 800%, the saved template JSONs, the field geometry and
  the generated PDFs match step 1, apart from two rendering states that also differ between two runs of step 1 itself
  (§3). aio-promo-monitor's own generator produces identical PDFs from the JSON saved by both builds (33/33). maxZoom 800
  and the scale-8 background are unchanged. Re-checked on the final patch: 55/55 screenshots, 33/33 JSONs, 11/11 PDFs
  (§12.4).
- **Static checks are clean** (re-run on the final patch, §12.4): tsc, Jest (ui 25/25 + 3 snapshots, converter 17/17),
  ESLint with 0 new problems, Prettier with no new deviation.
- **What step 2 does not fix:**
  - The React DevTools leak found by the retainer study (§7): +5.8 MB per field selection while the extension is active,
    without limit. The 3-line `index.html` opt-out that makes it flat (21–53 MB over 40 cycles) shipped with step 1
    (`bc442b2`).
  - Pre-existing upstream behaviour, kept as it is: after Ctrl+Z, Save Local, DL Template and Generate PDF still use the
    pre-undo template until the next edit (optional fix ready); about 0.6 MB of JS heap per Load Template; about 14 MB of
    renderer memory per Generate PDF over the first ~10.
- **F10** (sharper 800%) is worth doing as a separate project: about 1.8× sharper text at 800% with 0 long tasks, for
  +1.09 MB of bundle and +35–45 MB of memory while designing (§6).
- **Fidelity:** for 7 of the 11 templates what aio-promo-monitor prints differs from what the Designer shows. The causes are
  the consumer's font maps (Thomann maps Medium to the Bold file; MediaWorld and Unieuro pass no font map at all), not
  this repo. The fixes are owner decisions in aio-promo-monitor; nothing was changed there (§8).

## 1. The step-2 fixes in plain words

| # | What changes for the owner | Files |
|---|---|---|
| F4 | Every PDF that pdf.js opens for the background is closed after use (`destroy`), each page's parsed data and the 128 MB raster canvas are freed at once, and pdf.js no longer compiles code found inside a PDF (`isEvalSupported: false`, CVE-2024-4367). `document.fonts` stops growing by 5–7 pdf.js faces per raster. | `packages/converter/src/{index.browser,pdf2img,pdf2size}.ts` |
| F5 | The scale-8 background (4762×6735 for A4) is rendered once per basePdf content and reused for resizes, for the class re-sending the edited template and for a Load Template of the same file. It is shown through a `blob:` URL instead of base64 text, and an older init can no longer overwrite a newer one. Same bitmap bytes. | `packages/ui/src/hooks.ts` |
| F8 | Undo/redo keeps the last 100 steps per page (upstream's limit) instead of everything. | `packages/ui/src/constants.ts`, `hooks.ts`, `Designer/index.tsx` |
| F9 | After an edit, a window resize, a language change or Ctrl+S no longer rebuilds every field: the selection stays, field ids stay, the canvas does not jump to page 1 / the top, nothing is re-rasterized. | `packages/ui/src/components/Designer/index.tsx` |
| F6 | Exactly one pdfme instance per page: no orphans from the Form/Viewer mode switch, the Templates gallery or StrictMode. The font map is built once; `?template=` is read once, and a gallery link that does not load opens the saved or a blank template; the last 10 Generate-PDF URLs stay alive and older ones are released; `destroy()` cancels a pending resize render. | `playground/src/helper.ts`, `routes/Designer.tsx`, `routes/FormAndViewer.tsx`, `packages/ui/src/class.ts` |
| F7 | One FontFace per font for the whole page, shared by every instance; deleted 10 s after the last instance unmounts. | `packages/ui/src/components/Root.tsx` |
| F11 | Firebase serves `index.html` for every path, so a reload of `/designer`, `/form-viewer` or `/templates` works instead of returning 404. | `playground/firebase.json` |

maxZoom 800 and the scale-8 background are untouched. No dependency, lockfile, template-format or font-key change;
`packages/common`, `generator` and `schemas` are untouched.

## 2. Regression: step 1 against step 1 + step 2

### 2.1 Memory and lag

| Check | Step 1 | Step 1 + step 2 |
|---|---|---|
| Window resize ×10 | 10 background re-rasters; 2 long tasks per resize, 278–400 ms frozen (mean 314); renderer +2.0 MB per resize | 0 re-rasters, 0 long tasks; renderer −0.4 MB per resize |
| Background after resizes | 4762×6735 JPEG, sha256 `87ced98980f74810` (data URL) | the same bytes, through a blob URL |
| `document.fonts` over 10 resizes | 25 → 85 (pdf.js faces 5 → 55) | 19 → 19 (0 pdf.js faces) |
| Load Template of the same file ×10 | 10 re-rasters, 2 long tasks each (mean 326 ms); fonts 25 → 85; renderer +2.0 MB per load | 0 re-rasters, 0 long tasks; fonts 19; renderer +0.2 MB per load |
| JS heap after GC per Load Template | +0.63 MB | +0.63 MB (pre-existing, not addressed) |
| Load Template alternating foto_erhardt / thomann ×10 (new raster every time) | fonts 25 → 90 | fonts 19; JPEG blob URLs created 11, revoked 10, live 1; displayed-but-revoked 0 |
| Same, ×30, no in-page byte fetch: renderer footprint per switch | +2.62 MB | +2.73 MB |
| 300 arrow nudges: JS heap after commit 100 | +24.0 KiB per commit, undo goes on past 100 | +6.8 KiB per commit, undo stops at 100 |
| Designer → Form → Viewer → Form → Designer ×4 | renderer +90.7 MB/cycle (454 → 724 MB); fonts 993 (627 custom, 366 pdf.js); 9 live instances / 25 created; long tasks 5.95 s | fonts 19, 1 live instance / 17 created, long tasks 2.31 s; renderer +6.7 MB/cycle (330 → 350 MB) in a repeat run; the first run kept a one-time +131 MB after the second Designer mount, then +5–7 MB/cycle |
| Same ×10 | +74.2 MB/cycle (454 → 1125 MB); JS heap 22 → 45.8 MB; fonts 2,445; 21 live / 61 created; long tasks 14.7 s | +4.0 MB/cycle (327 → 366 MB); JS heap 20.5 → 24.0 MB; fonts 19; 1 live / 41 created; long tasks 5.3 s |
| Generate PDF ×10 | renderer +14.9 MB/gen; browser process +0.67 MB/gen; 10 live PDF URLs | renderer +14.2 MB/gen (unchanged, see §4); browser +0.19 MB/gen; 1 live PDF URL (the final patch keeps 10, §12.2) |
| Hover sweep / zoom 100 → 800 → 100 / select / 40 nudges, ×2 | 0 / 0 / 1 (61 ms) / ≤1 long task; JS heap 26.8–31.2 MB | 0 / 0 / 1 (60 ms) / 0; JS heap 22.5–28.4 MB |
| S8 owner loop, 10 minutes (zoom 400–800%, scroll, hover, select + drag, nudges, inline edit; Generate PDF every 3rd loop, Load Template every 5th) | no crash; 49 loops; JS heap after GC 28.2 → 41.0 MB (+0.27 MB/loop); renderer median 398 → 530 MB (peak 868); 10 rasters; fonts 25 → 79; long tasks 4.4 s (0.74% of the time) | no crash; 35 loops (each Load Template waited out the harness's 30 s raster timeout); JS heap 25.3 → 31.5 MB (+0.18 MB/loop); renderer median 369 → 423 MB (peak 615); 1 raster; fonts 19; long tasks 0.5 s (0.08%) |

The renderer slopes for resize and Load Template come from repeat runs without the harness's in-page fetch of the
background bytes; with the fetch the merged build reads 1.7–2.4 MB per step higher, because fetching a blob URL itself
costs renderer memory. The S8 renderer figures
are medians of the first and last 5 loops, because popups from Generate PDF make single readings jump.

### 2.2 Behaviour

| Check | Step 1 | Step 1 + step 2 |
|---|---|---|
| Select a field at 200%, scroll 300 px, nudge, resize (×5) | selection lost 5/5, all ids re-created, scroll → 0, 1 raster + 3 long tasks (369–476 ms) each | selection kept 5/5, ids unchanged 5/5, scroll stays 300, 0 rasters, ≤ 1 long task (0–77 ms) |
| Language change with a selected field (euronics, foto_erhardt) | Italian labels; selection lost, ids re-created; foto_erhardt re-rasters | Italian labels; selection, ids and nudge kept; 0 rasters |
| Ctrl+S, then resize | selection lost; foto_erhardt re-rasters | selection kept; 0 rasters |
| Static-schema editing on/off (euronics) | 0 → 16 fields, nudge kept | identical |
| Load Template restores the file's positions | yes (foto_erhardt re-rasters) | yes (0 rasters for the same content) |
| Blank basePdf (euronics): add page ×2, remove, resize, undo, resize, edit + resize | papers 2/3/2/2/2/2/2 = pages, 16 fields; page cursor reset to 1/2 by the resize | papers 2/3/2/2/2/2/2, 16 fields; cursor stays 2/2 |
| Change BasePDF ×3 + Load Template ×3 | backgrounds 4760×6736 `223aff42e6a10e37` / 4762×6735 `87ced98980f74810`, 35 fields; fonts 25 → 64 | the same dims and hashes every time, 35 fields; fonts 19; 1 live blob, 0 displayed-but-revoked |
| Form/Viewer: open, type, Viewer, Form, back to Designer | works; rasters 2/0/4/4/5; fonts 25 → 267; renderer 333 → 603 MB | works; rasters 1/0/1/1/1; fonts 19; renderer 317 → 396 MB; same Form background (1190×1683 `ccad5024340fe950`) |
| Form inputs: type, Save Inputs, Viewer, Form, Reset | saved, shown, shown, cleared; 3 live instances | the same; 1 live instance |
| Templates gallery → Go to Designer / Go to Form/Viewer, each followed by a resize | 2 instances per click; the orphans stay alive and re-render on resize (custom FontFaces 19 → 266 over the flow) | 1 instance per click, gallery template shown (18 fields), `?template` gone from the URL, 19 FontFaces |
| Resize, then navigate within the 100 ms resize debounce (×10) | 15 page errors `this instance is already destroyed` | 0 |
| Fallback-font flash after Designer ↔ Form/Viewer (euronics, foto_erhardt) | 0 frames | 0 frames (the same 19 faces are reused) |
| PDF tab kept open 65 s, then Download and reload | (no revocation in step 1) | download complete (423,096 and 423,062 B in two runs), reload 200 |
| Older PDF tabs after more Generate PDF | — | as reviewed, the previous URL was revoked, so every older tab lost Download (canceled at 0 B) and reload. The final patch keeps the last 10 (§12.2) |
| Save Local after nudge ×3 + undo ×2 | saved JSON is the pre-undo state, 3/3 | identical (pre-existing; §4) |

### 2.3 Static checks

- `tsc --noEmit`: ui, converter and playground clean on both trees.
- ESLint (ui `src`): the same 12 problems in both trees, 1 error and 11 warnings, 0 new. The error is the untyped F2
  replacer of the step-1 spec (`@typescript-eslint/no-unsafe-return`). The working tree's step 1 types it as
  `(k: string, v: unknown)` since 04:36; with that file the merged ui has 0 errors and the same 11 warnings. ESLint on the
  three playground files: clean.
- Jest under Node 22: ui 25/25 tests and 3/3 snapshots, converter 17/17, on both trees.
- Re-run on the final patch: §12.4.

## 3. Same output: all 11 templates and the consumer

**Designer, per template** (all 11 of aio-promo-monitor's templates; `base`, `int`, then `base` again to measure the
noise between two runs of the same build):

- 5 screenshots: 100%, 800% at two fixed scroll positions, 800% scrolled to the 5th field, the 5th field selected.
- The background image bytes, the 19 custom FontFaces' status and every field's position and size.
- A scripted edit: Shift+→ ×3 and ↓ ×2 on the 5th field, Ctrl+S (JSON 1), Ctrl+Z ×2, Ctrl+S (JSON 2), then the
  toolbar's Save Local (JSON 3, which is `getTemplate()`, the same object DL Template downloads).
- Generate PDF, compared as a 150 dpi `pdftoppm` raster, `pdffonts` (pdf-lib's random font-name suffix normalized) and
  `pdftotext`.

| Comparison | Screenshots identical | Saved JSONs identical | Field geometry | Generated PDF (raster, fonts, text) | Background bytes |
|---|---|---|---|---|---|
| step 1 vs step 1 + step 2 | 54 / 55 | 33 / 33 | 11 / 11 | 11 / 11 | 10 / 11 |
| step 1 vs step 1 (second run) | 53 / 55 | 33 / 33 | 11 / 11 | 11 / 11 | 10 / 11 |
| step 1 + step 2 vs step 1 (second run) | 54 / 55 | 33 / 33 | 11 / 11 | 11 / 11 | 11 / 11 |

- Every difference between the builds also appears between two runs of the same build:
  - `inline/unieuro-no-ship`'s background raster comes out in one of two states (1,303,337 or 1,303,568 JPEG bytes; at
    100% zoom 509 pixels differ by at most 4/255). The first `base` run got the 1,303,337-byte state; the `int` run, the
    second `base` run and 9 more fresh loads (3 each of step 1, step 1 + step 2, and step 1 + step 2 with pdf.js's
    `isEvalSupported` back at its default) all got the 1,303,568-byte one. So it is a rare pdf.js rendering state of this
    PDF, not step 2, and F4's `isEvalSupported: false` does not change these rasters.
  - `inline/unieuro-ship`'s "selected" screenshot also has two states (518 pixels, at most 2/255): the second `base` run
    differs from the first `base` run and from `int`, which match each other.
- All 10 real-basePdf templates show the same scale-8 bitmap: 4762×6735 or 4760×6736 px, rasterized once per open, now
  through a blob URL. Zoom reached 800% everywhere; 19/19 custom fonts loaded; 0 page errors.
- The JSON saved with Ctrl+S after the two undos is the post-undo state in all 11 templates, in both builds.

**Consumer.** The 33 saved JSONs of each build went through aio-promo-monitor's own code path, read-only: its npm
`@pdfme/generator`/`schemas`/`common` 5.3.15, `loadPdfFont` per vendor, the basePdf replaced by its
`assets/pdfs/<type>/<vendor>-base*.pdf`, plugins `{ text, image, qrcode }`, local files only. All 66 PDFs generated
without error, and step 1 against step 1 + step 2 is identical for **33 / 33** (150 dpi raster, `pdffonts`, `pdftotext`).
That is expected, since the saved JSONs are byte-identical: the contract (template format, font names, schema types)
does not change.

## 4. Behaviour changes and risks

- **The editor no longer resets itself (F9, visible).** After a resize, a language change or Ctrl+S the selection, the
  page cursor, the scroll position and the field ids stay. Step 1 dropped all of them.
- **Undo is not seen by `getTemplate()` (pre-existing, more visible with F9).** In pdfme 5.3.15 undo/redo never emit
  `onChangeTemplate`, so after Ctrl+Z the toolbar's Save Local, DL Template and Generate PDF use the pre-undo template
  until the next edit: 3/3 inconsistent in both builds (§2.2). DL Template is what goes to aio-promo-monitor. Ctrl+S is
  not affected (it hands the editor's own template over; the saved JSON after undo was correct in all 11 templates, §3).
  Before F9 a resize after Ctrl+Z happened to re-sync the editor to the pre-undo template, so the undo was visibly lost
  *(reported)*. The fix is ready as `step2-undo-emit-optional.patch` (step2-core; 3/3 consistent *(reported)*; it applies
  on top of the combined patch). It changes behaviour, so it needs the owner's OK. `TODO(undo-emit)` marks the spot
  (`Designer/index.tsx:85`).
- **Blob URLs instead of data URLs (F5).** Alternating two basePdfs 30 times (a new raster every time), the renderer grew
  +2.73 MB per switch here against +2.62 MB on step 1. The step2-core agent measured +2.90 against +1.63, and +1.23 for a
  data-URL variant *(reported)*, so the blob penalty is somewhere between 0.1 and 1.3 MB per new raster. Rasters now
  happen only on open, on new basePdf content, on Change BasePDF and on Designer ↔ Form/Viewer navigation. A measured
  data-URL alternative exists (`step2-core-dataurl-alt.patch`: same F4/F5/F8/F9, about 35 lines fewer, no revoke logic).
- **F5 cache key is `===`.** A basePdf given as a URL whose remote content changes keeps the old raster until the basePdf
  changes or the editor remounts. The owner's templates use data URIs. Each editor keeps one raster (about 1.1 MB of JPEG
  per page).
- **F5 request-id guard.** A failing init that a newer one has already replaced no longer shows the error screen.
- **F4 `isEvalSupported: false`.** pdf.js interprets PostScript functions instead of compiling them. The backgrounds of
  all 10 real basePdfs came out byte-identical (§3); PDFs heavy in Type 4 functions or Type 3 fonts could rasterize
  slower (not measured).
- **F7 keeps faces 10 s after the last instance unmounts.** Deleting them at once caused 88–152 ms of fallback-font text
  after every Designer ↔ Form/Viewer switch and reloaded all 19 faces each time *(reported)*. Measured here: 0 fallback
  frames, 19 faces throughout.
- **F6 keeps the last 10 PDFs.** The last 10 generated PDFs keep Download, Ctrl+S and reload; an older tab loses them
  (download canceled at 0 B, reload without response). Each live URL holds its PDF in the browser process: ≈0.4 MB here,
  at most ≈4 MB for the owner's templates (§12.2). Reloading or closing the Designer tab ends all of them, as before.
- **A gallery link that does not load** (unknown id, an HTML page instead of JSON, an invalid template, or one whose fonts
  or plugins this playground lacks) opens the saved template, which stays saved, or a blank one. Invalid saved Form
  inputs are dropped (§12.1).
- **F11 rewrite.** A missing static file now answers 200 with `index.html` instead of 404 *(reported, Firebase emulator)*.
  The app already fails on those paths the same way (a font or template JSON that does not load).
- **Not changed by step 2:** the renderer still grows about 14 MB per Generate PDF over the first 10 generates in both
  builds; the step2-life agent saw it flatten after about 10 (0.1 MB per generate over generates 21–30) *(reported)*.
  Re-measured on the final patch: 248 → 371 MB over the first 12 generates, then flat through 20, whatever happens to
  the PDF URLs (§12.2).
  The optional F6b patch flattens it at the price of a 115–234 ms freeze per Generate PDF and 7.9 MB of font bytes kept in
  memory *(reported)*; not recommended. The JS heap still grows about 0.6 MB per Load Template (both builds).
- **Divergence from upstream.** `packages/ui` and `packages/converter` were unmodified upstream until now; a future
  upgrade will conflict in `hooks.ts`, `Designer/index.tsx`, `Root.tsx`, `class.ts` and `pdf2img.ts`.
- **One-time memory step.** In one of three Designer ↔ Form/Viewer runs the renderer kept 131 MB more after a Designer
  mount (330 → 461 MB) and then grew by the usual 5–7 MB per cycle; the repeat run and the ×10 run had no such step. It
  looks like the allocator keeping the freed 128 MB raster canvas, not growth, but it was not investigated.

## 5. How to apply

Only after the owner has reviewed, committed and deployed step 1: done on 2026-10-18 (`bc442b2`, live since ~17:27).

1. Copy `step2-finish/step2-combined.patch` out of the scratch directory first (§11; scratch is temporary).
2. From the repo root: `patch -p1 --dry-run < step2-combined.patch`, then `patch -p1 < step2-combined.patch`. It changes
   12 files:
   - `packages/converter/src/index.browser.ts`, `pdf2img.ts`, `pdf2size.ts` (F4);
   - `packages/ui/src/hooks.ts` (F5, F8), `constants.ts` (F8), `components/Designer/index.tsx` (F8, F9),
     `components/Root.tsx` (F7), `class.ts` (F6);
   - `playground/src/helper.ts`, `src/routes/Designer.tsx`, `src/routes/FormAndViewer.tsx` (F6), `playground/firebase.json`
     (F11).

   It was checked on a copy of the repository taken at 17:54 (HEAD `638c491`, clean): no fuzz, no offset, and the 12
   files come out byte-equal to the verified tree. If any of them changes, repeat the dry run.
3. Rebuild per package, never with the root `npm run build` (it deletes every `dist` first), and without `npm install`:
   `packages/converter` → `npm run build`; `packages/ui` → `npm run build` (bundle + type declarations); then the playground
   with Node 22 (`nvm use`), which the owner's `npm run deploy` does.
4. Before deploying: ui and converter Jest under Node 22 (expect 25/25 + 3 snapshots and 17/17), then in a browser:
   select a field and resize the window (selection stays, no freeze), switch Designer ↔ Form/Viewer a few times, Generate
   PDF twice and download from the older tab, open a template from the Templates page, Load Template, Change BasePDF,
   zoom to 800%.
5. After deploying: open `https://aio-pdfme.web.app/designer` directly and reload it (F11), and keep checking the
   Crashpad folder for new `CALL_AND_RETRY_LAST` dumps as the study's §4 describes.

Optional add-ons, each with its own decision (§9); each applies on top of the final patch (dry run on the copy above, no
fuzz, no offset): `step2-core/step2-undo-emit-optional.patch`, `step2-finish/step2-error-reset-optional.patch` (§12.3),
`step2-finish/step2-life-optional-f6b-generator-font-bytes.patch` (F6b, regenerated for the final `helper.ts`, same
changes). The React DevTools opt-out is already in `bc442b2`. The data-URL alternative replaces the step2-core half
(`step2-core-dataurl-alt.patch`); it was not combined with the review fixes, built or measured.

## 6. F10 — sharper than today at 800% (prototype, kept separate)

*(reported by the step2-zoom agent; spot-checked against its sharpness table and bundle sizes, not re-run here)*

- **Verdict: worth doing**, as its own project after step 2. The prototype keeps today's scale-8 bitmap untouched and adds,
  above about 450%, a canvas that covers only the visible part of the page. pdf.js renders it at one device pixel per
  canvas pixel in a real worker, built from the already-installed pdfjs-dist 3.11.174 worker file (no dependency change).
  Fields stay on top and clickable.
- **Sharpness at 800%** (10–90% edge width in device px; base / prototype / poppler reference): table-header text
  2.80 / 1.56 / 1.43, footer small print 2.86 / 1.60 / 1.59, barcode 2.05 / 0.80 / 0.80. Identical in Chrome 134 and
  155; a headful Chrome 155 spot check agrees. The other 5 templates tested go from 3.0–3.3 px to 1.42–1.57 px.
- **Responsiveness:** 0 long tasks over 50 ms and 0 frames over 33 ms during zoom, pan, scroll and drags at 800%. The
  sharp layer appears 144–175 ms after the last scroll.
- **Costs:** bundle +1.09 MB (+0.29 MB gzipped); renderer +35–45 MB and GPU +25–31 MB while the Designer is open at high
  zoom; +459 lines in `packages/ui` and `packages/converter`. Chrome 155 needs `will-change: transform` on the
  Paper while the layer is active, otherwise it resamples the canvas (edge 2.15 px: still sharper than today). Text in the
  lower part of the page moves by up to about 2 CSS px when the sharp layer replaces the bitmap; the sharp layer is the
  correctly placed one (Chrome draws today's large background up to 4.4 device px low/right). Scanned PDFs refresh in
  0.12–0.78 s after a 5 s idle, inside the worker (no freeze).
- **With step 2:** `f10-prototype.patch` (9 files, +459 lines) applies on top of the combined step-2 patch (dry run,
  offsets only), although both touch `converter/src/index.browser.ts` and `Designer/index.tsx`. The two were not built or
  measured together. Productionizing is estimated at 2–3 days plus the owner's visual check on the Retina display.
- Not tested: Safari/Firefox, DPR 1 or 3, Cmd +/- browser zoom, inline text editing at 800%, multi-page basePdfs.

## 7. What kept 3+ GB alive in the owner's sessions (retainer study)

*(reported by the step2-retain agent; its two crash logs were spot-checked and contain
`V8 javascript OOM (CALL_AND_RETRY_LAST)`. The merged-build numbers at the end are first-hand.)*

This answers the study's open question (§7 there): why real 1× sessions reached 3.1–3.8 GB live within minutes while the
harness stayed under 0.74 GB.

- **Cause: the React DevTools extension.** With React DevTools 8.0.0 loaded (the version in the owner's Chrome Profile 4)
  and today's HEAD build, a plain work cycle (select a field → one property-panel action → click the paper) crashed the
  tab at 1×, 2 of 2 times. Live heap with nothing selected: 561 → 1096 → 1631 → 1990 → 2348 → 2883 → 3416 MiB, then
  `V8 javascript OOM (CALL_AND_RETRY_LAST)` at 48.7 s. The same on the Vite dev server at 48.4 s. The owner's dumps die at a
  median of ≈3415 MiB live, 113 s after start.
- **Mechanism.** The extension's backend keeps a map of DevTools fiber instances and never removes the property panel's.
  Through a stale React 16 `firstEffect` pointer each one keeps a whole DetailView generation alive, including 2–3 of
  the 175 MiB `JSON.stringify(options)` strings: one generation per field selection, without limit. The backend attaches
  on page load even when DevTools is closed. React DevTools was active in all 97 of the owner's renderer dumps; version
  6.0.1 leaks the same way. Without the extension the same sequence plateaus (≤ 1.62 GiB in Chrome for Testing 134,
  ≤ 1.09 GiB in Chrome 155).
- Smaller holders keep at most one generation each (rc-field-form's validator, Chrome Autofill in CfT 134, Headless UI's
  focus history, antd's 5 s Wave timer), plus one dev-server-only leak (react-aria, +1.9 MiB per cycle). After step 1 they
  hold a few MB each.
- **Step 1 removes the crash, not the leak.** The 175 MiB strings are gone (0 `JSON.stringify` results over 1 M
  characters; the only strings over 1 MB left in step-1 snapshots are the code and the background image, constant in
  number), but with React DevTools each selection still keeps about 7.3 MiB of fibers, DOM and closures: 36 → 256 MiB
  over 40 cycles. That reaches about 3 GB after roughly 400 selections, i.e. hours in one tab.
- **On the merged build (first-hand;** the study's `spread` sequence, 40 cycles, the unpacked React DevTools 8.0.0 from
  the review, Chrome for Testing 134, JS heap after GC with nothing selected):

  | Build | Start → after 40 cycles | Per cycle |
  |---|---|---|
  | Step 1 + React DevTools | 23.1 → 256.5 MB | +5.8 MB, unbounded |
  | Step 1 + step 2 + React DevTools | 21.7 → 252.2 MB | +5.8 MB, unbounded |
  | Step 1 + step 2 + opt-out + React DevTools | 21.1 → 43.7 MB (27.7–52.7 along the way) | flat |
  | Step 1 + step 2, no extension | 20.6 → 43.1 MB (27.2–52.2) | flat |

  Step 2 does not touch this leak; the opt-out makes the page behave exactly as without the extension (the hook reports
  0 attached renderers).
- **Fix options (owner; (a) shipped with step 1 in `bc442b2`):** (a) `step2-rdt-optout-optional.patch`: 3 lines in
  `playground/index.html` that set `__REACT_DEVTOOLS_GLOBAL_HOOK__.isDisabled = true` before the app loads, so React 16
  (pdfme UI) and React 18 (playground) skip DevTools; the cost is that React DevTools can no longer inspect the
  playground. (b) In Chrome, set React DevTools' site access to "On click", or exclude `aio-pdfme.web.app` and
  `localhost`.
- Not tested: Grammarly (also active in 97/97 dumps) and the 8 other extensions of the crashed renderers; copying them out
  of the owner's profile was blocked by the permission system.

## 8. Designer preview vs aio-promo-monitor output (fidelity study)

*(reported by the step2-fidelity agent; not re-run here. Anchors re-checked in aio-promo-monitor, read-only:
`utils/asset-loader.ts:46` maps `OpenSansMedium` to the Bold file and `:68` returns `undefined` for every other vendor;
npm `@pdfme/schemas` 5.3.15 `text/pdfRender.js:44` then falls back to `getDefaultFont()`, and `:55-56` looks the
drawing font up by name.)*

Method: the 11 templates rendered by the Designer and by aio-promo-monitor's own code path (its npm 5.3.15 generator,
its font maps, its erased base PDFs), compared field by field on line extents, baselines and rendered ink, plus 763
synthetic long product texts for line breaks.

| Templates | Consumer font map | What differs from the Designer | Severity |
|---|---|---|---|
| inline/euronics, multi_products/euronics, multi_line/amazon | Arial (+ ArialBold), same files as the Designer | Nothing font-related. The Designer kerns text and the PDF does not, so PDF lines are up to 0.43–0.49 mm wider; baselines within 0.16 mm. 0 line-break differences. | none |
| inline/foto_erhardt | SegoeUI, SegoeUIBoldItalic, Helvetica, HelveticaBold | The consumer's Helvetica files are an older Apple Helvetica (10.0d4e1), different bytes but the same advance widths and metrics: rendering identical through the generator. Engine gap ≤ 0.30 mm. | none |
| inline/thomann | `OpenSansMedium` → the **Bold** file | `banktransferInfo` prints Bold: 3.66 mm (4.8%) longer than in the Designer, 47% more ink, ending 0.27 mm before its box edge; 26 of 73 long texts break differently. | medium |
| MediaWorld: inline, multi_line, multi_products | none: layout measured with Roboto, text drawn with the non-embedded standard Helvetica | Every line 0.40 mm lower than the Designer's font would put it (+0.53 mm against the Designer's ink). Right-aligned prices end 0.11–0.17 mm right of the Designer, past their box edge. Long names break differently (44–63 of 51–72 lengths) and run up to 5.2–7.7 mm past the box. | high |
| Unieuro: inline ship, inline no-ship, multi_products no-ship | none (as MediaWorld) | 0.445 mm lower at 8 pt; amounts end 0.15–0.26 mm right, past the box; `€` amounts are 0.53 mm narrower; 29 of 59 long names break differently and run up to 6.4 mm past the box. | high |

- With the templates' own sample texts no line break changes anywhere; the differences show up with longer real values.
- The 6 MediaWorld/Unieuro templates are already tuned to today's consumer output: the printed text lands on the
  original invoice text (0.00–0.07 mm median) while the Designer shows it 0.16–0.53 mm higher. Fixing only the consumer's
  font map would therefore move the printed text by about 0.4 mm.
- The playground's own Generate PDF uses the Designer's fonts, so it never shows these differences.

**Recommendations (owner decisions; nothing was changed in aio-promo-monitor):**

1. Thomann: map `OpenSansMedium` to `fonts/OpenSans-Medium.ttf`, already in the consumer's assets and md5-identical to the
   Designer's file. The error against the original invoice line goes from +3.41 to −0.35 mm; the other 23 fields do not
   change. No template change.
2. MediaWorld and Unieuro: either accept the preview error, or return `{ Helvetica: { fallback: true, data:
   fonts/helvetica.ttf } }` **and in the same change** move every text field of the 6 templates down by
   0.0556 × fontSize mm (+0.40 mm at 7.2 pt, +0.445 mm at 8 pt) or re-align them in the Designer. Measured with that map:
   output equal to the Designer within 0.05 mm, no line-break differences, nothing past a box; each PDF grows by
   8.1–8.4 KB because the text becomes an embedded font subset.
3. Foto Erhardt: no change needed.
4. In aio-promo-monitor, add a regression render of all 11 templates whenever a template or a font map changes.
5. In this repo, keep `getFontsData` as it is: no Designer font file can reproduce the consumer's behaviour. Optional,
   owner's OK needed: a "Generate PDF as aio-promo-monitor" vendor option in the playground (same 5.3.15 text code with
   the per-vendor maps), and `font-kerning: none` on the Designer's text blocks, which cut the preview width error from
   0.49 mm to ≤ 0.15 mm in a headless test.

## 9. Decisions for the owner

1. **Step 2 itself:** apply the final patch (§5, §12); step 1 is deployed.
2. **Background display (F5):** blob URLs, as in the combined patch, or the data-URL alternative. Both give the same
   output; the blob variant may cost 0.1–1.3 MB more renderer memory per new raster (§4).
3. **Undo-emit fix:** recommended, because without it a DL Template right after Ctrl+Z exports the pre-undo JSON to
   aio-promo-monitor (pre-existing).
4. **React DevTools:** decided: the `index.html` opt-out shipped with step 1 (`bc442b2`; measured flat at 21–53 MB over
   40 cycles instead of +5.8 MB per cycle, §7).
5. **F6b** (generator gets the font bytes): not recommended.
6. **F10** (sharper 800%): a separate 2–3-day project after step 2 (§6).
7. **aio-promo-monitor fidelity** (§8): the Thomann one-line font-map fix; for MediaWorld/Unieuro, the font map together
   with re-aligning the 6 templates, or accepting the preview error; a regression render there; optionally the playground
   "Generate PDF as aio-promo-monitor" option and `font-kerning: none`.
8. **Error-screen reset** (`step2-error-reset-optional.patch`, §12.3): recommended. It changes pre-existing upstream
   behaviour, so it waits for your OK.

## 10. Gaps

- **Browser.** The regression ran headless in Chrome for Testing 134 only: not in Chrome 155, not headful on the Retina
  display, not in the owner's profile. Milliseconds are inflated by the other agents' browsers on the same Mac.
- **Coverage.** Memory and lag scenarios ran on foto_erhardt only (35 fields, 1 page). The 11-template run checks output
  and behaviour, not memory. No template has a multi-page real basePdf or a table, so the Form/Viewer table-overflow path
  was not exercised.
- **Not re-run on the merged build:** the Firebase emulator check of F11 *(reported)*; the undo-emit patch (measured by
  step2-core alone); the data-URL alternative. The Vite dev server (StrictMode) and 20 × Generate PDF were run on the
  final patch (§12).
- **Extensions.** React DevTools is the only extension tested. Grammarly and the 8 others active in the crashed renderers
  were not, and could hold more.
- **Noise.** Renderer footprint per new raster with blob vs data URLs differs between runs (§4).
- **S8** ran once per build, for 10 minutes. On the merged build the JS heap after GC still grows by about 0.5 MB per
  minute of that loop (+0.38 MB per loop between two Load Templates, partly released at each Load Template); the source was
  not identified. At that rate the 4 GB heap limit is days of continuous work away.
- **Step 1 as measured.** §1–§11 measured the step-1 spec of 03:30. §12 used the working tree's step 1 as copied at 16:42:
  its three files are byte-identical to the committed `bc442b2`, and the scratch ui bundle built from them is
  byte-identical to the repo's `packages/ui/dist/index.es.js`. The React DevTools opt-out in `playground/index.html` came
  later (17:02, committed at 17:26) and is not in the §12 builds; it only switches the DevTools hook off, and the test
  browsers have no extension. The final patch does not touch that file.
- **§12 browsers.** chrome-headless-shell 134 for the probes, the regression subset and the 11 templates; Chrome for
  Testing 134 (new headless) for the PDF tabs and the URL costs, which need Chrome's PDF viewer. Not Chrome 155, not
  headful, not the owner's profile. The shell has no GPU process, so its renderer footprints (S7: 363 → 707 MB in both
  builds) are not comparable with §2. Not re-run on the final patch: S8, the React DevTools runs and aio-promo-monitor's
  generator; the review fixes touch only the playground's page setup and Generate PDF, and the saved JSONs are
  byte-identical to step 1's (33/33). The PDF viewer's Ctrl+S and Print were not tested.
- **Fidelity numbers** come from the study agent's harness with the templates' sample inputs and 763 synthetic long
  texts, not from real aio-promo-monitor invoices; the crops contain the owner's invoice data and stay in scratch.

## 11. Files (scratch, temporary)

These paths live in the session's scratch directory and may disappear with it. Root:
`/private/tmp/claude-501/-Users-matteobrogin-Documents-developer-personal-projects-aio-pdfme/daabdcc4-7eac-4eca-8464-a2841af585f3/scratchpad/`.

- Patches:
  - `step2-finish/step2-combined.patch`: **the final patch** (F4–F9, F11 and the review fixes), relative to `638c491`
    (the previous HEAD + step 1), `patch -p1`. The reviewed version is `step2-int/step2-combined.patch`.
  - `step2-finish/step2-error-reset-optional.patch`, `step2-finish/step2-life-optional-f6b-generator-font-bytes.patch`,
    `step2-core/step2-undo-emit-optional.patch`, `step2-core/step2-core-dataurl-alt.patch`.
  - `step2-int/step2-rdt-optout-optional.patch`: the React DevTools opt-out, now in `bc442b2`.
  - `step2-zoom/f10-prototype.patch`: F10, not merged.
  - The halves as delivered: `step2-core/step2-core.patch`, `step2-life/step2-life.patch`.
- Integration: `step2-int/base` and `step2-int/int` (source trees), `step2-int/builds/{base,int}`, plus two experiment
  builds (`int-rdtsrc` = int + the opt-out, `int-evalon` = int with `isEvalSupported` at its default),
  `step2-int/runs/<label>/` (`steps.jsonl`, `log.txt`), `step2-int/logs/`.
- Harness: `step2-int/harness/`: `core.cjs` (step2-core's run2.cjs), `life.cjs` (step2-life's run2.cjs, blob-aware),
  `eq.cjs` + `eqcompare.cjs` (11-template equivalence), `consumer.cjs` + `consumercompare.cjs` (aio-promo-monitor's
  generator), `drive.cjs` (step2-retain's driver), `bgdump.cjs` (background bytes). Exact command lines:
  `step2-int/scripts/suiteA.sh` … `suiteF.sh`.
- Review-fix run: `step2-finish/{head,base,tree,tree-opt}` (HEAD, + step 1, + the final patch, + the error reset),
  `step2-finish/builds/{int,final,final-opt}`, `step2-finish/harness/` (`badquery.cjs`, `blobcost.cjs`, `pdftabs.cjs`,
  `errstuck.cjs`, and copies of `life.cjs`, `core.cjs`, `eq.cjs` for chrome-headless-shell), command lines in
  `step2-finish/scripts/run-suite1.sh` … `run-suite4.sh` and `prove-apply.sh`, results in `step2-finish/runs/` and
  `step2-finish/logs/`.
- Study evidence: `step2-zoom/runs/`, `step2-retain/runs/`, `step2-fidelity/out/`. The fidelity crops, the equivalence
  screenshots and the generated PDFs contain the owner's real invoice data: keep them private.

## 12. Review fixes and the final patch

A review of the combined patch (verdict: changes required) found one regression and two low points. The fixes were made
in a fresh scratch tree, `0f9d910` plus the working tree's step 1 (today's `638c491` without the `index.html` opt-out)
plus the reviewed patch, and verified on scratch builds: common, schemas, generator and converter with tsc (the first
three byte-identical to the repo's dists), ui as a library bundle (the step-1 one byte-identical to the repo's), the
playground with Vite. Browsers: §10.

| Finding | Outcome |
|---|---|
| MEDIUM, regression of F6: when the `?template=` lookup fails (unknown id, an HTML page instead of JSON, an invalid template), no Designer or Form/Viewer is built at all. Before step 2 a second, accidental build still made one. | Fixed (§12.1) |
| LOW: the previous PDF's URL is revoked at the next Generate PDF, so an older PDF tab, often still open, loses Download and reload | Fixed: the last 10 stay alive (§12.2) |
| LOW, pre-existing in 5.3.15: after one failed background raster the Designer stays on the error screen, even after a good Load Template or Change BasePDF | Optional patch (§12.3) |

### 12.1 A gallery link that does not load

- `Designer.tsx`, `FormAndViewer.tsx`: a failed lookup becomes `null`, then the page opens the gallery template, else the
  saved one, else a blank one: always exactly one instance. A gallery template that the playground cannot open (fonts or
  plugins missing, e.g. the gallery's `certificate-*`) falls back too, and the saved template stays saved. A saved template
  that does not parse or validate is removed, as before. F6's cancellation and destroy-before-create are unchanged.
- `FormAndViewer.tsx` also checks the saved inputs (`checkInputs`) before building: invalid ones are dropped and the
  template's own inputs are used. Unchecked, `new Form()` throws after it has started observing its container and leaves
  a zombie instance behind.
- The earlier agent's candidate had the same fallback, but invalid saved inputs deleted a good saved template (its own
  probe) and, from its code, could still leave the zombie.

Probe: 41 cases (6 kinds of `?template=` with and without a saved template and 4 kinds of saved template, on both routes;
9 kinds of broken saved inputs on Form/Viewer), each followed by two resizes. "As expected" = exactly one instance before
and after the resizes, the fallback template shown, the saved template kept unless it is itself broken, invalid inputs
dropped, `?template` gone from the URL, 0 page errors.

| Build | As expected | What goes wrong |
|---|---|---|
| Step 1 (`fix1/build-fixed`) | 13 / 41 | a failed gallery link shows the saved template but deletes it from localStorage (10); a good gallery link builds 2 instances (4); a broken saved template leaves the page empty (6); broken saved inputs leave it empty (2) or add a zombie instance that throws `Cannot read properties of undefined (reading '0')` on every render (6) |
| Step 2 as reviewed | 6 / 41 | every failed gallery link: no instance, and the saved template deleted (20); a broken saved template or broken saved inputs: no instance or a zombie (15) |
| Final | **41 / 41** | also 41/41 with a server that answers `index.html` for every path (Firebase with F11) and on the Vite dev server (StrictMode runs every effect twice) |

Templates page → Go to Designer / Go to Form/Viewer, then a resize: 1 new instance per click, the gallery template shown
(18 fields), `?template` removed, 1 live instance after the resize, 19 FontFaces, 0 page errors; the same as reviewed.

### 12.2 Generate-PDF URLs: the last 10 stay alive

`generatePDF` keeps the object URLs of the last 10 PDFs (`MAX_LIVE_PDF_URLS` in `helper.ts`) and revokes the oldest when
the 11th is generated. Cost: Chrome for Testing 134 with its PDF viewer, foto_erhardt (423 KB PDF), 20 × Generate PDF,
each PDF tab closed 1.5 s after it opened, footprint after GC:

| Design | Live URLs after 20 | Browser process | Renderer |
|---|---|---|---|
| Revoke the previous one (as reviewed) | 1 | 70 → 73 MB, flat | 247 → 371 MB |
| Never revoke (as step 1; the reviewed build with revoking switched off) | 20 | 70 → 81 MB: +0.43 MB per PDF, no bound | 251 → 378 MB |
| Keep the last 10 (final) | 10 | 70 → 76 MB at the 10th PDF, then 74–77 MB | 248 → 371 MB |

- A live URL holds about its PDF's size in the browser process (≈0.4 MB here; the 11 templates make 66–423 KB PDFs) and
  nothing in the renderer, which grows the same with every design (the pre-existing growth, flat after ~12 generates).
- An open PDF tab costs ≈66 MB of Chrome memory (1 → 5 tabs kept open: 650 → 920 MB in total), about 150 times its URL.
- Decision: keep the last 10. The cost stays bounded (≈4 MB at most for these templates, less than a tenth of one open
  PDF tab), and a PDF tab keeps Download and reload until 10 newer PDFs exist. Never revoking would cost ≈43 MB per 100
  PDFs, without a bound until the Designer tab is reloaded or closed. Tracking each tab's `closed` state (the earlier
  candidate, capped at 5) adds code to save at most these ≈4 MB.
- Behaviour (final, same browser): 5 PDFs with their tabs open, then 65 s: Download completed in all 5 tabs
  (423,045–423,062 B), reload 200 in all 5. After 12 PDFs: URLs 1–2 revoked, 3–12 alive; tab 1 can no longer Download
  (canceled at 0 B) or reload (no response), the accepted trade-off; tab 12 downloads (423,049 B) and reloads (200);
  0 page errors. Generate PDF ×5 in chrome-headless-shell: 5 URLs live, the previous one fetchable after every generate,
  1 instance, 0 page errors.

### 12.3 Error screen (optional)

`step2-error-reset-optional.patch` adds one `setError(null)` after a successful init in `runInit` (`hooks.ts`), as
upstream's current `runInit` does (`577db47a`, 2026-03-20).

| Step (foto_erhardt) | Step 1 and the final patch | Final + the optional patch |
|---|---|---|
| Load Template with a non-PDF basePdf | error screen | error screen |
| Load Template with the good file | still the error screen | Designer back: 35 fields, background |
| The broken file again, then Change BasePDF with a real PDF | still the error screen | Designer back: 35 fields, new background |

All three builds log the same 2 page errors (unhandled rejections from loading the broken file). The patch stays optional:
the behaviour is pre-existing, not a step-2 regression, and a behaviour change outside the approved fixes needs the
owner's OK. It is one statement; on the normal path it sets an already-null state again.

### 12.4 Re-verification of the final patch

| Check | Result |
|---|---|
| Patch | 12 files, +449/−159 lines (the reviewed one: +365/−120, same count); `patch -p1` on a copy of HEAD `638c491`: no fuzz, no offset, 12/12 files byte-equal to the verified tree |
| 11 templates against step 1 (`fix1/build-fixed`): screenshots at 100% and 800%, saved JSON after edit + undo, Generate PDF (150 dpi raster, `pdffonts`, `pdftotext`) | 55/55 screenshots, 33/33 JSONs, 11/11 PDFs, 11/11 backgrounds, 11/11 field geometry; 800% reached and 19/19 fonts loaded everywhere; 0 page errors |
| Designer ↔ Form/Viewer ×4 | as reviewed and final the same: 1 live instance at every step (17 created), 19 FontFaces, 0 page errors, JS heap after GC 20.1 → 21.6 MB |
| Select, nudge, resize ×5 (F9) | selection kept 5/5, ids unchanged 5/5, scroll stays at 300, 0 new rasters, ≤ 1 long task (51–76 ms) |
| Blank basePdf (euronics): add page ×2, remove, resize, undo, resize, edit + resize | papers 2/3/2/2/2/2/2 = pages, 16 fields, cursor stays 2/2 |
| Load Template ×5 (same file); alternating foto_erhardt / thomann ×4 | 0 re-rasters; 1 raster per switch, 1 live JPEG blob, 0 displayed-but-revoked |
| Form/Viewer typing (type, Save Inputs, Viewer, Form, Reset) | saved, shown, shown, cleared; 1 live instance |
| Static | tsc (ui, converter, playground) clean; ESLint: ui `src` 0 errors and 11 warnings (the same rules and count as step 1), converter and the 3 playground files clean; Prettier: the 8 package files and `helper.ts` pass, while `Designer.tsx`, `FormAndViewer.tsx` (upstream's double quotes) and `firebase.json` (no final newline) already fail at HEAD and the patch adds no other deviation; Jest under Node 22: ui 25/25 + 3/3 snapshots, converter 17/17 |

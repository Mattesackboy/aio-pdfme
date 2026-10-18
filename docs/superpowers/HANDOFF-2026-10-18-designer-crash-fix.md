# HANDOFF 2026-10-18 — Designer crash: root cause found, step 1 live, step 2 packed as patches (awaiting owner)

> **State as of 2026-10-18 19:05 Rome.** Written by the Opus `handoff` agent of the closing workflow
> `step2-finish-and-handoff`, which the main chat launched at 16:32. Sources: the crash study (Verdict, §1–§8); the
> step-2 doc, all of it, including §12 as the finisher updated it (uncommitted); the finisher's and the Fable delta
> reviewer's reports as the workflow relayed them; the owner's messages and answers in this session's main-chat
> transcript (read-only); `CLAUDE.md`; aio-promo-monitor's `HANDOFF-2026-10-18-o16-…` (format) and its BACKLOG
> (read-only).
> Re-checked first-hand by this writer: git state and reflog; the patch hashes and dry runs; the live site's
> `index.html` and bundle; the `playground/dist` and `.firebase` timestamps; the Crashpad folder (file dates, plus the
> whitelisted frame names of the 2 newest dumps); the step-1 verification logs in scratch; the `CLAUDE.md` anchors.
> No git write. Written in the repo: only this file and `docs/research/2026-10-18-step2-patches/`.
> **Step 1 is committed (`bc442b2`), pushed and live. Step 2 is not applied**: it lives as patches in
> `docs/research/2026-10-18-step2-patches/` (README there).

## 0. State at a glance

| Item | State |
|---|---|
| Root cause | **Found** (`docs/research/2026-10-17-designer-crash-study.md`). The tab dies of a V8 out-of-memory in the property panel's `JSON.stringify(options)`, which serialized ~7.9 MB of fonts given as bytes into ≈175 MiB strings; the React DevTools extension kept them alive. The lag: every field's Renderer cloned the font bytes on every render. |
| Step 1 (F1–F3 + React DevTools opt-out) | **Committed, pushed, deployed.** `bc442b2` (4 files, +43 −31) and `638c491` (CLAUDE.md, `.claude/settings.json`, the 2 study docs), both committed by the main chat at 17:26 on the owner's request. `origin/main` = `638c491`: the remote-tracking reflog shows the push at 17:26:35. `playground/dist` was built at 17:27 (`index-6ef2fd65.js`) and has been live since ~17:35 (Firebase `Last-Modified: 15:35:11 GMT`; hosting cache written 17:35:01). The step-2 doc's "live since ~17:27" is the build time. Owner after the deploy: «fix va da dio» (17:37). |
| Crashes since | 2 OOM dumps, at 17:30:58 and 17:32:40, both `stringify` ← `DetailView` in **`index-16a0f24c.js`, the old bundle**, from before the deploy (owner, 17:33: «ah si non è stato deployao mis a»). No newer dump at 19:02. |
| Step 2 (F4–F9, F11 + review fixes) | **Final patch ready, not applied**: `step2-combined.patch`, 12 files, +449 −159, sha256 `c76f1f7d4a58a881…`. Applies to today's tree with no fuzz and no offset. Re-verified (§3.3). Fable delta review: approve-with-nits (1 LOW, §4 Q7). |
| Optional patches | Error reset (recommended), undo emit (recommended), F6b (not recommended), data-URL variant (reference only). Each needs its own OK. |
| F10 (sharper 800%) | Prototype works. Worth doing as a separate 2–3-day project after step 2. |
| aio-promo-monitor | Code untouched. Preview and print differ for 7 of 11 templates because of the consumer's font maps. Owner: fine today, fix later there. Note in its `docs/superpowers/BACKLOG.md:263-268`, uncommitted. |
| firebase-tools as a devDependency | **Done (update 19:45):** `33d5285`, committed and pushed. `firebase-tools` 15.30.2 is pinned in playground devDependencies (507 added, 13 transitive bumps, none in the app bundle: the rebuilt dist is byte-identical to the deployed one). Deploy is now `nvm use && npm run deploy`; the PATH tricks below are obsolete. |
| CLAUDE.md | **Updated (19:45)** by the main chat: known issue, fork status, font map and deploy lines. |
| Step 2 scope (update 19:45) | The owner kept only the resize part: **F5 (raster once per basePdf) + F9 (no re-sync on the editor's own echo)**. Error reset declined; the rest of step 2 is not wanted for now. |
| Resize (update 22:30) | **Applied: `2f1bd43`, committed and pushed; the owner deploys.** F5 data-URL variant (no blob URLs) + F9 with a WeakSet of every template the editor applied or emitted. Fable rated the first F9 HIGH: with a single-slot "last emitted" ref, two Designer instances in one container (gallery `?template=` links, Vite dev/StrictMode) lost fields on resize. Fixed and re-verified: resize 0 ms frozen (was ~300), 0 re-rasters, selection/ids/scroll kept, 11/11 templates identical (55 screenshots, 33 saved JSONs, Generate-PDF rasters). Not applied, by owner choice: F4, F6, F7, F8, F11, error reset, undo emit. Note that `step2-combined.patch` no longer applies cleanly on top of `2f1bd43`, because it overlaps in `hooks.ts` and `Designer/index.tsx`. |
| Uncommitted in the repo | `docs/research/2026-10-18-step2-fixes-and-studies.md` (the finisher's §12 and updates: +173 −48), `docs/research/2026-10-18-step2-patches/` (new) and this file (new). |
| Owner questions | 10, in §4. |

## 1. What was found

### 1.1 The crash, and the decisive evidence: the owner's own crash dumps

- 92 of the owner's 97 Chrome dumps carry `V8 javascript OOM (CALL_AND_RETRY_LAST)`. **All 70 that carry V8 stack keys
  (every one since 2026-03-19) die in `stringify` with a `DetailView` frame.** Their entry points:
  - `onSelect`: 37;
  - `changeSchemas`: 28, 7 of them under Moveable's `triggerEvent`;
  - paste 1, template update 1, React-only frames 3;
  - arrow-key move: 0.

  The keys were read by a whitelisting script that prints only numbers and function names, never URLs or page
  content (study §1.1).
- At death, the 4 GB pointer cage holds 3087–3800 MB of **live** data (median ≈3415). The two last-resort GCs free
  ≤ 5.2 MB. The largest free region (54.75–174 MB) is always smaller than one ≈175 MiB string. Live sizes cluster
  ~177–182 MB apart, i.e. ≈17–21 retained strings. Median isolate uptime: 113 s (40 of 70 within 120 s).
- The line is `packages/ui/src/components/Designer/RightSidebar/DetailView/index.tsx:83`, effect deps
  `JSON.stringify(options)`.
  - `options.font` held the 19 fonts as `Uint8Array` (7.89 MB). One call gives 92,043,628 characters, 175 MiB as a
    two-byte string; the vanilla `🗑️` label is what makes it two-byte.
  - It runs on every render while a field is selected, and at least twice per selection change.
  - Upstream removed the line for good only in 6.0.0 (`577db47a`; it was also absent in 5.5.4–5.5.5), during a hook
    cleanup, without diagnosing it.
- Dose-response: live heap 1.43 GB with 2× the fonts, 2.14 GB with 3×. With 4× the tab crashes with the same
  signature: 2834 MB live, largest free region 617 MB, against a ≈702 MiB string.
- The crash days line up with the font commits (`4c5ce35`, `135f63e`/`7aa1cc3`, `0f9d910`) and with template work.

### 1.2 Why real sessions died within ~2 minutes: React DevTools

- Source: step-2 doc §7, *(reported)* by the retainer study; its crash logs were spot-checked.
- With React DevTools 8.0.0 (the version in the owner's Chrome Profile 4) and the pre-fix build, a plain cycle crashed
  the tab at 1× in 48.7 s, 2 times out of 2. The cycle: select a field, one property-panel action, click the paper.
  Live heap went 561 → 3416 MiB.
- Mechanism:
  - The extension's backend keeps the property panel's DevTools fiber instances.
  - Through a stale React 16 `firstEffect` pointer, each one keeps a whole DetailView generation alive, with 2–3 of the
    175 MiB strings.
  - That is one generation per field selection, without limit. It attaches even with DevTools closed.
- React DevTools was active in 97/97 of the owner's renderer dumps; v6.0.1 leaks the same way. Without the extension
  the same sequence plateaus (≤ 1.62 GiB).
- After step 1 the big strings are gone. With the extension, though, each selection still keeps ≈5.8 MB (fibers, DOM,
  closures), without bound: about 3 GB after ~400 selections.
- The 3-line `index.html` opt-out (`isDisabled`) makes it flat: 21.1 → 43.7 MB over 40 cycles, the same as without the
  extension (first-hand on the merged build, doc §7 table).

### 1.3 The constant lag

- `packages/ui/src/components/Renderer.tsx:41` (pre-fix): `cloneDeep(options)`, i.e. `structuredClone`, ran before the
  font data was replaced. 7.89 MB × 35 Renderers = 276 MB copied per render.
- A hover sweep froze the UI for 4.5–10.9 s, and zooming 100 → 800% for 1.3–4.7 s.
- Upstream fixed it in 6.1.12 (#1576).

### 1.4 Secondary causes (step 2) and what is not the cause

- RC3, the background raster: rasterized at scale = maxZoom/100 = 8 (A4 4762×6735, ≈128 MB RGBA), and redone on every
  resize and every class re-render, 0.3–1.9 s each.
- RC4, native accumulation:
  - `Root.tsx` re-adds every FontFace on each mount (25 → 900 in 4 cycles).
  - pdf.js documents are never destroyed: +5–6 faces per init, on a main-thread fake worker.
  - The playground leaves orphan instances; Generate PDF refetches the fonts and never revokes its URLs.
- RC5: the undo stack is never trimmed. The class's template echo forces a full re-sync: new uuids, selection
  dropped, scroll to the top, background re-rastered.
- None of these is the V8 OOM: they are native memory or bounded.
- **The 800% zoom is not the cause.** With maxZoom 250 the same pathology appears. With the font bugs removed, zooming
  to 800% freezes 0 ms, with today's scale-8 bitmap.
- **Dev-server-only leak.**
  - On the Vite dev server, react-aria keeps +1.9 MiB per cycle *(reported, doc §7)*, and StrictMode builds a second
    instance (`document.fonts` 50 vs 25).
  - First-hand (the `fix1-fix` pin runs: the same 12-iteration sequence, Chrome for Testing 134): JS heap 36.8 MB on
    the step-1 production build, 170.8 MB on the step-1 dev server, 2,861.9 MB on the pre-fix dev server.
  - The 2026-08-23 crash day (37 dumps) most likely ran the dev server. Judge memory on production builds only.
- **Vanilla-era crashes: unexplained.**
  - The owner is sure vanilla crashed too («ti assicuro che anche VANILLA questa app crashava»).
  - Vanilla ships 0.13 MB of binary fonts, an effect 60× smaller; a 15-minute vanilla session peaked at 172 MB.
  - No dump older than 2025-10-23 survives (Crashpad prunes after 365 days).
  - 4 other V8 OOMs have no DetailView frame (at least 3 are probably other tabs), and 1 dump has no OOM keys. All 5
    stay unexplained.

### 1.5 Side findings for aio-promo-monitor

Fidelity study, step-2 doc §8 *(reported; the anchors were re-checked)*:

| Templates | Consumer font map | Preview vs print | Severity |
|---|---|---|---|
| Euronics ×2, Amazon | Arial (+ ArialBold), the same files as the Designer | Nothing font-related. Kerning makes PDF lines up to 0.43–0.49 mm wider. | none |
| Foto Erhardt | SegoeUI, SegoeUIBoldItalic, Helvetica, HelveticaBold | The consumer's Helvetica files are an older Apple Helvetica: different bytes, **same metrics**, identical rendering. | none |
| Thomann | `OpenSansMedium` loads the **Bold** file (`asset-loader.ts:46`) | `banktransferInfo` prints Bold, 3.66 mm (4.8%) longer; 26 of 73 long texts break differently. | medium |
| MediaWorld ×3, Unieuro ×3 | **None** (`asset-loader.ts:68` returns `undefined`): the layout is measured with Roboto and drawn with the non-embedded standard Helvetica | Every line is 0.40–0.445 mm lower; right-aligned amounts end 0.11–0.26 mm further right, past their box; long names break differently and run up to 5–8 mm past the box. | high |

The 6 MediaWorld/Unieuro templates are already tuned to today's output. Fixing only the font map would therefore move
every printed line by ~0.4 mm. The recipes are in §8 of the step-2 doc and in aio-promo-monitor
`docs/superpowers/BACKLOG.md:263-268`.

## 2. What was decided (owner, verbatim; times CEST)

| # | Decision | Owner, verbatim | Effect |
|---|---|---|---|
| D1 | Be extremely careful: nothing may break aio-promo-monitor's PDF generation | 10-17 21:46: «non possiamo modificare troppo qua perchè non vorrei che la generazione di pdf nell'altro progetto si spacchi se modifichiamo robe quindi da essere estremamente cauti» | The contract (template JSON, font names, schema types) is kept. Every fix was A/B-tested on all 11 templates and through the consumer's own generator. |
| D2 | maxZoom 800 stays, with a sharp background | 10-17 22:08: «mi serve quello zoom è comodissimo per fare piccoli dettagli»; 22:57: «mi è stra comodo lo zoom di ora» | `maxZoom: 800` untouched, and the scale-8 raster kept: any clamp blurs 800% (study §4.1 option E, §5). F10 may only add sharpness. |
| D3 | No library upgrades | 10-18 01:12: «sempre occhio a non fare update della libreria che potrebbero far danni (per aio promo monitor)»; earlier, 10-17 23:08: «ripeto siamo indietro qui anche se è da valutare l'update» | Patch, don't upgrade (study §4.2): upstream fixes ported by hand (#1576), no `@pdfme/*` bump, no `npm install`. A pdfme upgrade must move the Designer and the consumer together. |
| D4 | Explain every option, the rejected ones too, and flag any library-upgrade risk | 10-18 01:12: «spiegameli tutti che facciamo prima e perchè consigli certi e certi no etc.» | Memory `explain-every-fix-option`. §4 below follows it. |
| D5 | Step 1 first, then step 2 | 10-18 01:17: «subito f1 f2 f3, poi review mia veloce tanto è poca roba presumo e poi deployo poi farei tutto quello che ha senso che hai studiato. lancia tutto in parallelo [...] anche 10 agenti o piu se ti servono» | Step 1 = F1–F3 in the working tree. Step 2 and 3 studies ran in parallel in scratch only, to apply after step 1 is deployed. |
| D6 | Test browsers that pop up are fine, if announced | 10-18 02:08: «no tranquillo va bene basta che mi dici che sei tu io ora tanto dormo» (after «c'è qualcuno che continua ad aprirmi chromium fra») | Say so whenever a browser runs. Prefer chrome-headless-shell (no Dock icon); never headful. |
| D7 | Invoice fonts: record now, fix later in aio-promo-monitor | 10-18 16:40: «si al momento sono andate bene ma devi salvarti (se vuoi anche in aio promo monitor project) che è da fixare [...] i font sono sbagliati, calcoli con roboto e poi applica altro etc» | The main chat wrote the BACKLOG note and both projects' memories (16:42). Do not "fix" it from the Designer side. |
| D8 | React DevTools: the page opt-out, now | 10-18 17:00: «2) puoi gia farlo ora tanto che mi serve?» (item 2 of the main chat's list: "React DevTools: turn it off on the site, or 3 lines in `index.html`") | An Opus agent added the 3 lines to `playground/index.html` (17:01–17:18). Shipped in `bc442b2`. |
| D9 | Claude commits, this time | 10-18 17:25: «fai tu i commit dei file che ci sono non committati e poi io deployo»; 17:26: «committa qua [...]» | `bc442b2` and `638c491` on `main`, by the main chat. A one-off: git stays owner-only. |
| D10 | firebase-tools as a project devDependency, not npx | 10-18 17:38: «io vorrei installato qui non npx» | This came after the main chat's dry run (+556 packages, 13 existing ones updated, `nan` among them, which node-canvas builds with) and its advice for a one-line `npx` script instead. The main chat accepted and scheduled it for after this workflow (§6). |

Standing rules this session kept (CLAUDE.md):

- Git is owner-only; read-only git is always fine.
- Never deploy. Never touch `playground/dist` or `public/template-assets`.
- No `npm install` / `npm ci`.
- Opus does the authoring, Fable the adversarial reviews.
- The roadmap goes in chat before any agent launches.

## 3. What was done

### 3.1 Who did what (every piece of authoring by subagents; times CEST)

| When | Who | What |
|---|---|---|
| 10-17 22:15 – 10-18 01:21 | Study workflow: 8 Opus agents (claude-md, audit, repro, upstream, synthesis, verify:safety, verify:causality, revise) | `CLAUDE.md` and the crash study |
| 01:23 – 04:34 | Step-1 workflow: implement (Opus), review (Fable), verify (Opus), fix (Opus) | F1–F3 in the working tree, verified (§3.2) |
| 04:35 – 04:38 | Opus micro-fix agent | F2's replacer typed `(k: string, v: unknown)`, plus one stale comment. `packages/ui/dist` rebuilt: sha256 `5083eb66c7435f16…`, unchanged by this type-only edit |
| 01:25 – 06:10 | Step-2 workflow. In parallel: core F4-F5-F8-F9, life F6-F7-F11, zoom F10, a retainer study and a fidelity study (all Opus). Then integrate (Opus), review (Fable: changes required) and fix (Opus) | Step 2 in scratch; the step-2 doc §1–§11. The fix agent stopped without reporting: the login session expired overnight |
| from 16:32 | Closing workflow `step2-finish-and-handoff`: finish-fix (Opus, 16:42–18:08), Fable delta review (18:09–18:38), handoff (Opus, this file) | The review fixes and their re-verification (doc §12); the review verdict approve-with-nits; this file and the patches folder |
| 16:38 – 16:43 | Main chat (inline micro-append) | Checked that aio-promo-monitor's invoice code is untouched; wrote the font note in its BACKLOG and in both projects' memories |
| 17:01 – 17:18 | Opus agent | React DevTools opt-out and its check. With the extension: +0.67 MB per cycle, as without it, against +6.67 MB before; smoke test passed *(reported by the main chat)* |
| 17:26 | Main chat, on the owner's request | Commits `bc442b2` and `638c491` |
| 17:27 – 17:35 | Owner | Build and deploy. The `firebase` CLI was only found with the PATH trick (§8) |

### 3.2 Step 1: `bc442b2` (live)

| File | Change |
|---|---|
| `playground/src/helper.ts` | F1: the 18 fonts are passed as absolute URLs (`fontUrl` at `:14`: `new URL('/fonts/' + file, window.location.origin).href`). Same keys, files and fallback flags. |
| `packages/ui/src/components/Designer/RightSidebar/DetailView/index.tsx` | F2: the effect deps use `JSON.stringify(options, (k: string, v: unknown) => …)`, which replaces any `data` object with `'...'`. |
| `packages/ui/src/components/Renderer.tsx` | F3: a port of upstream #1576. The render key is built without cloning the font bytes. |
| `playground/index.html` | React DevTools opt-out: sets `__REACT_DEVTOOLS_GLOBAL_HOOK__.isDisabled = true` before the app loads. |

Verification, first-hand from the step-1 verify logs (headless Chrome 155, foto_erhardt):

| Check | Before (HEAD `0f9d910`) | Step 1 |
|---|---|---|
| Select a field: heap after GC / longest freeze | 375.1 MB / 984 ms | 25.7 MB / 92 ms |
| 40 nudges, 2 batches | Per batch: 81–82 long tasks (35.8–36.7 s frozen); heap 553.6–730.8 MB; peak V8 2.37–2.55 GB | 0 long tasks; heap 28.8–30.6 MB; peak 60–100 MB |
| Hover sweep ×3 | 61–68 long tasks (3.5–4.0 s) per sweep | 0 |
| Zoom 100 ↔ 800% ×3 | 27–36 long tasks (1.7–2.2 s) per half-cycle | 0 |
| S8 owner loop | 15 minutes (study): 323 s frozen out of 871 s, peak 2.58 GB | ~10 minutes, 42 loops: 23 long tasks (3.8 s in total), heap after GC 28.2 → ~42 MB, peak ≤ 90.4 MB, no crash |
| Owner-trigger loop: select, panel typing, align, format, dropdowns, font change, inline edit, drag and resize ends, undo/redo, 800%, nudges, Save Local, Generate PDF | 3 cycles: 1088–1267 MB after GC, even after deselecting; 103–120 long tasks (35–38 s) per cycle, 110 s in total | 17 cycles in ~10 minutes (170 selects, 34 dropdown opens, 4 generates): heap after GC 34.4 → 54.6 MB (about +1.2 MB per cycle); 0–8 long tasks per cycle, 3.2 s in total |
| Dose test: 4× the fonts (this crashed before the fix) | — | Select 25.9 MB; 3 × 40 nudges 29.4–32.3 MB; 0 long tasks; no crash. Owner loop at 4×: 35–43 MB, no crash |
| 11 templates, before against after | — | Saved JSON 11/11 identical; backgrounds identical. Screenshots: 84/88 byte-identical; the other 4 differ by 43–65,723 pixels at threshold 0, and by 0 pixels at pixelmatch's default threshold (0.1, anti-aliasing ignored). Generate PDF 11/11: raster 0 px, text identical; the bytes differ (§7) |
| aio-promo-monitor's own generator (npm 5.3.15, per-vendor font maps) on the saved JSONs | — | 11/11 identical PDFs |
| ui Jest (Node 22) | — | 25/25 tests, 3/3 snapshots |

Live check: the deployed bundle contains F1 (`fontUrl`), F2's replacer and `maxZoom:800`, and `index.html` has the
opt-out.

### 3.3 Step 2: final patch ready, not applied

Contents (doc §1):

- F4: pdf.js hygiene in the converter.
- F5: the background is rasterized once per basePdf and shown through a `blob:` URL.
- F7: a FontFace registry. F8: undo capped at 100. F9: no re-sync on the class's echo.
- F6: exactly one instance per page, a `?template=` fallback, and the last 10 PDF URLs kept alive.
- F11: a Firebase SPA rewrite.

Files: `packages/converter/src/{index.browser,pdf2img,pdf2size}.ts`, `packages/ui/src/{hooks,constants,class}.ts`,
`packages/ui/src/components/{Root,Designer/index}.tsx`,
`playground/src/{helper.ts,routes/Designer.tsx,routes/FormAndViewer.tsx}` and `playground/firebase.json`. Untouched:
`packages/common`, `generator` and `schemas`, every dependency and lockfile, the template format, the font keys.

What step 2 adds on top of step 1 (doc Verdict, §2):

- A window resize, a Load Template of the same file, a language change or Ctrl+S: 0 re-rasters, instead of one
  280–400 ms freeze each time.
- Designer ↔ Form/Viewer ×10: renderer +4 MB per trip instead of +74 MB; 19 FontFaces instead of 2,445; 1 live
  instance instead of 21; long tasks 5.3 s instead of 14.7 s.
- The selection, the field ids and the scroll position survive a resize. The "instance is already destroyed" page
  errors go from 15 to 0. Deep links work once deployed.
- S8 10-minute loop: 0.5 s of long tasks instead of 4.4 s, 1 raster instead of 10, 19 FontFaces instead of 79.

Final re-verification (doc §12.4; scratch builds; chrome-headless-shell 134 and Chrome for Testing 134):

- 11 templates against step 1, all identical:
  - 55/55 screenshots, at 100% and 800%;
  - 33/33 saved JSONs after an edit and an undo;
  - 11/11 generated PDFs (150 dpi raster, `pdffonts`, `pdftotext`);
  - 11/11 backgrounds and field geometries.

  800% was reached everywhere, 19/19 fonts loaded, 0 page errors. The consumer's generator: 33/33 identical, in the
  integration run.
- `?template=` probe: 41/41 (6/41 as first reviewed, 13/41 on step 1). Also 41/41 with a server that answers
  `index.html` for every path, and on the Vite dev server.
- Generate PDF: the last 10 URLs stay alive. After 65 s, Download and reload work in 5/5 tabs. Each live URL holds
  about its PDF's size in the browser process (≈0.4 MB here), so the 10 cost at most ≈4 MB for these templates.
- S7 ×4: 1 live instance throughout, 19 FontFaces, JS heap 20.1 → 21.6 MB. F9 kept the selection 5/5. Blank basePdf:
  add, remove and undo of pages all work.
- Static checks: ui Jest 25/25 with 3/3 snapshots, converter 17/17; tsc 0 errors (ui, converter, playground); ESLint
  0 new problems; Prettier no new deviation. The tested bundle equals the final source.
- Fable delta review: the 3 earlier findings are resolved or justifiably deferred, plus one new LOW (§4 Q7).
- Integration regression *(orchestrator's count)*: 20 of 22 checks pass. The 2 misses are growths that step 2 does
  not target (S6, S8; §7).

The patch files, apply order, dry runs and data check are in `docs/research/2026-10-18-step2-patches/README.md`.

### 3.4 Studies

- **F10, a sharper 800%** (doc §6, *(reported)*): worth doing as its own project after step 2.
  - How: above ~450% zoom, a canvas covering only the visible part of the page, rendered by pdf.js in a real worker,
    on top of the unchanged scale-8 bitmap.
  - Edge width at 800%, in device px (today / prototype / poppler reference): header text 2.80 / 1.56 / 1.43, small
    print 2.86 / 1.60 / 1.59, barcode 2.05 / 0.80 / 0.80. 0 long tasks.
  - Costs: +1.09 MB of bundle, +35–45 MB renderer and +25–31 MB GPU memory, then 2–3 days of work plus the owner's
    visual check on the Retina display.
  - `f10-prototype.patch` applies on top of step 2 (offsets only); the two were never built together.
- **Retainer study** (§7): React DevTools; see §1.2.
- **Fidelity study** (§8): see §1.5.

### 3.5 Written elsewhere this session

- aio-promo-monitor `docs/superpowers/BACKLOG.md:263-268`, in the section at `:256`: the measured numbers, the Thomann
  case, the fix recipe and the upgrade warning. Uncommitted, next to other sessions' uncommitted BACKLOG edits. No code
  touched there.
- This project's memory: `explain-every-fix-option` and `invoice-fonts-vs-designer`. aio-promo-monitor's memory: the
  same invoice-font note.

## 4. Open questions for the owner (each self-contained, with a recommendation)

1. **Apply step 2, the final patch?**
   - What it does: it removes the remaining slow growth and wasted work (§3.3): no re-raster on resize, one instance
     per page, constant FontFaces, undo capped at 100, the selection survives a resize, direct links stop returning 404.
   - Output: identical (55/55 screenshots, 33/33 JSONs, 11/11 PDFs). Library upgrade: none.
   - Risk: `packages/ui` and `packages/converter` diverge further from upstream.
   - **Recommendation: yes.** Step 1 is deployed and works.
2. **Error-screen reset** (`step2-error-reset-optional.patch`, 1 statement)?
   - Today, after one failed background load, the Designer stays on the error screen even after a good Load Template
     or Change BasePDF. That is pre-existing 5.3.15 behaviour, which upstream fixed in `577db47a`.
   - **Recommendation: yes.** Verified on one scenario.
3. **Undo emit** (`step2-undo-emit-optional.patch`)?
   - Today, after Ctrl+Z, Save Local, **DL Template** (what goes to aio-promo-monitor) and Generate PDF still use the
     pre-undo template until the next edit. Pre-existing; F9 makes it more visible.
   - **Recommendation: yes.** It was measured by its author on its own base (3/3), never built on the final patch:
     build and check it with step 2.
4. **F6b** (Generate PDF gets the font bytes)?
   - It flattens the ~14 MB per generate renderer growth over the first ~10 generates, at a 115–234 ms freeze per
     Generate PDF and 7.9 MB kept in memory.
   - **Recommendation: no.**
5. **Background shown through a `blob:` URL (final patch) or a `data:` URL** (`step2-core-dataurl-alt.patch`)?
   - The output is the same either way. The blob variant may cost 0.1–1.3 MB more renderer memory per new raster.
   - The data-URL variant differs only in `hooks.ts`, and it was never built with the review fixes.
   - **Recommendation (this writer): blob**, the version verified end to end.
6. **F10, a sharper 800%?** See §3.4. **Recommendation: yes, as its own 2–3-day project after step 2 is live.** It is
   not a library upgrade.
7. **Node converter entry** (the Fable LOW)?
   - F4's `isEvalSupported: false` is only in `index.browser.ts`. `packages/converter/src/index.node.ts:15` and `:30`
     still use pdf.js's default (CVE-2024-4367).
   - The playground's thumbnail script (`scripts/generate-templates-thumbnail.mjs:6, 91`) runs that entry at every
     `npm run dev` / `build` / `deploy`, on the PDFs it generates from `public/template-assets/*/template.json`, which
     embed those templates' basePdfs.
   - **Recommendation: yes, as a micro-fix with step 2**: the same option at both sites, then the converter Jest.
8. **aio-promo-monitor font fixes**, to do in a session there (§1.5):
   - Thomann: a one-line font-map fix.
   - MediaWorld/Unieuro: accept the preview error, or change the map and re-align the 6 templates in the same change.
   - First, a before/after regression render of all 11 templates.
   - **Recommendation: Thomann soon; MediaWorld/Unieuro only together with the re-alignment.**
9. **Pre-existing playground semantics** that the Fable review flagged (not defects of step 2, identical in HEAD):
   - (a) The saved template is deleted when `new Designer()` / `new Form()` throws for a font or plugin the playground
     lacks, not only when it fails to parse or validate.
   - (b) With `localStorage` blocked or full, saving a gallery template ends in an unhandled rejection.
   - (c) On Form/Viewer, a later mode switch shows the saved template rather than the gallery one.
   - (d) The header's "Designer" link (`/designer`) and the gallery (`/`) share an unkeyed element, so a `?template=`
     on an in-app navigation would be ignored. No UI path does that.

   **Recommendation: (a) is worth a small fix later (keep the JSON and show an alert); leave (b)–(d).**
10. **CLAUDE.md stale lines**: approve the replacement text in §6, or have the main chat apply it inline as a stale-doc
    fix.

## 5. How to apply step 2, build, test and deploy

Apply the patch (repository root):

```bash
cd /Users/matteobrogin/Documents/developer/personal-projects/aio-pdfme
git status --short          # expect only this run's docs; the 12 patched files must be unchanged
D=docs/research/2026-10-18-step2-patches
patch -p1 --dry-run < $D/step2-combined.patch && patch -p1 < $D/step2-combined.patch
# Optional, each with its own OK: step2-error-reset-optional.patch, step2-undo-emit-optional.patch (README, same commands)
```

Rebuild and test (never the root `npm run build`, which deletes every `dist` first; no `npm install`):

```bash
nvm use                                  # .nvmrc = 22 -> v22.20.0; node-canvas is built for Node 22
(cd packages/converter && npm run build) # first: packages/ui bundles the converter
(cd packages/ui && npm run build)        # vite bundle + type declarations
(cd packages/converter && npm test)      # expect 17/17
(cd packages/ui && npm test)             # expect 25/25 tests, 3/3 snapshots
```

Check in a browser (doc §5 step 4). Run `cd playground && npx vite` and open http://localhost:5173; on the dev server
check behaviour, not memory. Then:

- select a field and resize the window: the selection stays, with no freeze;
- switch Designer ↔ Form/Viewer a few times;
- Generate PDF twice, then Download from the older tab;
- open a template from `/templates`;
- Load Template and Change BasePDF;
- zoom to 800%.

Deploy (owner only):

```bash
cd /Users/matteobrogin/Documents/developer/personal-projects/aio-pdfme/playground
nvm use          # 22: predeploy builds with node-canvas
npm run deploy   # since 33d5285 the firebase CLI is a playground devDependency
```

Then hard-reload the Designer with **Cmd+Shift+R**: Firebase serves `index.html` with `cache-control: max-age=3600`.
Check afterwards:

```bash
curl -s https://aio-pdfme.web.app/ | grep -o 'assets/index-[a-z0-9]*\.js'          # a new hash, not index-6ef2fd65.js
curl -s -o /dev/null -w '%{http_code}\n' https://aio-pdfme.web.app/designer           # 200 with F11 (404 today)
grep -o 'isEvalSupported:!1' dist/assets/index-*.js | wc -l                           # 2 = step-2 build (0 in step 1)
```

Keep watching `~/Library/Application Support/Google/Chrome/Crashpad/completed/` (study §4): no new
`CALL_AND_RETRY_LAST` dump over 2–4 weeks of normal use. Read new dumps only with a whitelisting script
(`scratchpad/newcrash/frames.py`, `scratchpad/verify-causality/oomkeys.py`).

Suggested commit messages (English; the owner commits, file by file):

- This run's docs: `docs: step-2 patches, review fixes and session handoff for the Designer crash fix` (the modified
  step-2 doc, `docs/research/2026-10-18-step2-patches/`, this file, plus the CLAUDE.md lines of §6 if approved).
- Step 2:

  ```
  fix(designer): rasterize the background once, free pdf.js resources, keep one instance per page

  - converter: destroy pdf.js documents, clean up pages, release the canvas, isEvalSupported: false
  - ui: background raster cached per basePdf (blob URL, request-id guard), shared FontFace registry,
    undo capped at 100, no re-sync on the class's echo, destroy() clears the pending resize
  - playground: one instance per page (cancellation, destroy-before-create, ?template= read once with a
    gallery/saved/blank fallback), last 10 Generate-PDF URLs kept alive, Firebase SPA rewrite

  Template JSON, font names, generated PDFs, maxZoom 800 and the scale-8 background are unchanged.
  ```

- Optional: `fix(ui): leave the error screen after a later successful load` and
  `fix(ui): emit the template on undo and redo`.

## 6. Waiting-on

- **Owner: commit this run's docs.** The step-2 doc is modified, and `docs/research/2026-10-18-step2-patches/` and this
  file are new.
- **Owner: CLAUDE.md.** This writer did not edit it. Proposed replacement for the "Known issue" bullet (`CLAUDE.md:147`):

  ```
  - **Designer tab crash ("Aw, Snap!" / "Uffa!", error code 5) and constant lag: root cause found, fix live.** A V8 out-of-memory in the property panel's `JSON.stringify(options)` while the 18 fonts were passed as bytes (≈175 MiB per string; 70/70 owner crash stacks), kept alive by the React DevTools extension; the lag was the per-field font clone. Study: `docs/research/2026-10-17-designer-crash-study.md`.
  - Step 1 (fonts as absolute URLs, DetailView replacer, upstream #1576 port, React DevTools opt-out) is committed as `bc442b2` and deployed (2026-10-18). Step 2 (F4–F9, F11) is not applied: patches and apply order in `docs/research/2026-10-18-step2-patches/`, measurements in `docs/research/2026-10-18-step2-fixes-and-studies.md`. State and open decisions: `docs/superpowers/HANDOFF-2026-10-18-designer-crash-fix.md`.
  ```

  Other stale lines, also not edited:
  - `:63`: "upstream code, unmodified". Since `bc442b2`, `packages/ui` differs in 2 files.
  - `:91`: `getFontsData()` (:22-120). It is now `:18-116`, and the fonts are absolute URLs.
  - `:103`: "identical to `d1db660`" and "8 commits … touch only `playground/` and `.nvmrc`". There are 10 commits now,
    and `bc442b2` touches `packages/ui`.
  - `:104`: "fetches 18 TTF/OTF files … as `Uint8Array`". Since `bc442b2` they are absolute URLs.
  - `:116`: "built on 2026-03-25 … `index-16a0f24c.js`". The dist was built 2026-10-18 17:27 and serves
    `index-6ef2fd65.js`.
  - `:117`: the `firebase` CLI exists only under nvm v24.16.0: `PATH="$PATH:$HOME/.nvm/versions/node/v24.16.0/bin"`
    after `nvm use`, until firebase-tools becomes a devDependency.
  - `:118` (deep links 404) stays true until step 2 is deployed.
- **Owner: answers to §4.**
- **Next session (owner's request D10): firebase-tools as a devDependency.**
  - The main chat's plan (17:40): `firebase-tools@15.30.2`, the exact version, installed once no agent uses the
    playground's `node_modules` any more.
  - Two Opus agents in series:
    1. Install under Node 22 and verify: the CLI answers and is logged in, with the `aio-pdfme` target; node-canvas
       and the template-asset generation still work; the app bundle is identical despite the 13 updated packages.
    2. Independently check the lockfile diff and the same build.
  - Then commit, and update the CLAUDE.md deploy line.
  - Caveat: it updates 13 installed packages, including `nan` (node-canvas). The owner chose it knowingly.
- **Owner: aio-promo-monitor.** Commit the BACKLOG note, which sits next to other sessions' edits. The font fixes need a
  session there (§4 Q8). Its BACKLOG also records an owner plan to upgrade pdfme there "later" (`BACKLOG.md:256-258`).
  If that happens, the Designer here must move in the same project (study §3.1).
- **Owner: watch Crashpad** for 2–4 weeks (§5).

## 7. Gaps (honest)

- **"Step 1 ends the crashes" rests on**:
  - harness runs at 1× and at 4× the fonts (no crash; 4× crashed before);
  - the owner's «fix va da dio» after the deploy;
  - no new dump from ~17:35 to 19:02.

  The 2–4-week Crashpad check has not happened yet. The two dumps of 17:30/17:32 are from the old bundle.
- **In-browser Generate PDF is no longer byte-reproducible.**
  - Since step 1, two runs of the same build differ by a few bytes. For example euronics gave 66,255 vs 66,249 B, on
    11/11 templates.
  - Before step 1 only the dates differed: the structure was identical with the dates masked (4 templates compared).
  - Content is identical: raster 0 px, `pdftotext` equal, `pdffonts` equal once pdf-lib's random subset suffix is
    normalized.
  - Cause not investigated. aio-promo-monitor uses its own generator and is unaffected (33/33).
- **Residual growth, not addressed:**
  - renderer ~+14 MB per Generate PDF over the first ~10–12 generates, then flat (pre-existing; F6b would flatten it);
  - S8 JS heap ~+0.5 MB per minute on step 2 (+0.18 MB per loop; step 1 +0.27), source not identified;
  - the heavier owner-trigger loop on step 1: JS heap after GC +1.2 MB per cycle (34.4 → 54.6 MB over 17 cycles,
    ~2 MB per minute); that loop was not re-run on step 2;
  - JS heap +0.6 MB per Load Template (pre-existing).

  At those rates the 4 GB heap is more than a day of continuous work in one tab away (≈33 hours at 2 MB per minute).
- **React DevTools:** the leak is avoided only through the opt-out. Without it: +5.8 MB per selection, unbounded.
  Grammarly (also active in 97/97 dumps) and 8 other extensions were never tested.
- **The dev-server-only leak** (react-aria) is not fixed, since it only affects `npm run dev` / `npx vite`.
- **Vanilla-era crashes:** unexplained (§1.4).
- **Step 2 coverage:**
  - Not run in Chrome 155, headful, or in the owner's profile.
  - Not re-run on the final patch: S8, the React DevTools runs, aio-promo-monitor's generator, the Firebase emulator
    check of F11.
  - Never tested: the PDF viewer's Ctrl+S and Print.
  - The blob-cost numbers come from one run on foto_erhardt, with the Mac swapping (~42.6 of 44 GB).
  - The error reset was tested on one scenario.
  - The final builds lacked the `index.html` opt-out (inert without the extension).
  - No template has a multi-page real basePdf or a table.
- **Optional patches:** undo emit and F6b were never built on the final patch. F10 was never built together with step
  2. The data-URL recipe was checked as patch mechanics only.
- **Reported, not re-measured by this writer:** the retainer study, the fidelity study, F10, the 17:01 opt-out check,
  the integration's "20/22" count. Everything in §3.2 and the live-site, dist, git and Crashpad facts were checked
  first-hand.
- **Small inconsistencies in the step-2 doc**, not edited (it is outside this writer's mandate):
  - "live since ~17:27" means built at 17:27, released ~17:35;
  - its §5 and §11 cite scratch paths; the persisted copies keep the same basenames in
    `docs/research/2026-10-18-step2-patches/`;
  - §6 says F10 is +459 lines; counted as `+` lines it is +483.

## 8. Traps

- **Node 22 for anything that loads node-canvas.** `npm run dev` / `build` / `deploy` in `playground/` and the converter
  Jest suite need it. The default Node here is 24.21; run `nvm use` first.
- **The global `firebase` CLI lives only under nvm v24.16.0** (nvm does not carry global packages across versions),
  which is why a plain `firebase` command is "not found". Since `33d5285` this no longer matters: `npm run deploy`
  uses the playground's pinned `firebase-tools` 15.30.2 from `node_modules/.bin`. Run `nvm use` first (Node 22 for the
  predeploy build).
- **Hard reload after a deploy** (Cmd+Shift+R): `index.html` is cached for an hour, so a normal reload can keep the old
  bundle. Today's two crashes (17:30, 17:32) ran the old bundle because the new one was not deployed yet; check the
  bundle hash with `curl` (§5) before testing.
- **Rebuild `packages/converter`, then `packages/ui`, before deploying step 2.** The playground runs the built
  `packages/*/dist` through symlinks. A deploy without the rebuild would ship step 2's playground code on step 1's
  library. Check with the `isEvalSupported:!1` grep (§5).
- **Root `npm run build`** deletes every `packages/*/dist` first, so the running webapp breaks until the build ends.
- **Never relative font URLs** (`'/fonts/x.ttf'`): pdfme decodes them as base64 and the fonts break. Use absolute
  `http(s)` URLs only (`fontUrl` in `helper.ts`).
- **Never `JSON.stringify` / `structuredClone` / `cloneDeep` options, or any object, that holds font bytes,** in deps,
  keys or memo keys. That is the crash.
- **No upgrades of pdfme or of any dependency** (D3). The only exception the owner granted is firebase-tools (D10).
  6.x hazards for the consumer: new fields default to `fontName: 'Helvetica'`, which throws with the EURONICS map;
  6.x-only properties; different line breaking (study §3.1).
- **maxZoom 800 and the scale-8 raster:** never lower, never clamp (D2).
- **Test browsers:** headless only, one at a time; prefer chrome-headless-shell
  (`~/.cache/puppeteer/chrome-headless-shell/mac_arm-134.0.6998.35/…`, Puppeteer `headless: 'shell'`; no Dock icon).
  Chrome for Testing is only for runs that need the PDF viewer. The system Chrome shares the owner's Crashpad folder
  and starts GoogleUpdater's crash handler.
- **Invoice data is private.** The scratch screenshots, crops and generated PDFs and the owner templates contain real
  invoice data. The repo and the site are public: never copy them in.
- **Crash dumps:** read only numeric keys and whitelisted function names, never URLs or page content.
- **Measure memory on production builds.** The dev server adds StrictMode's double instance and react-aria's leak.
- **The scratch directory is temporary.** The patches are now safe in the repo, but the harnesses
  (`repro/harness/README.md`, `step2-finish/harness/`) and the evidence still live only in scratch.
- **`?template=` is read once per mount** (F6). An in-app navigation to `/designer?template=x` without a remount
  ignores it; no UI path does that today.
- **Shell:** the tool shell is zsh, where `PIPESTATUS` and lines of `=====` behave differently. Harness scripts use
  bash.

## 9. Next work

1. Owner: commit this run's docs and decide CLAUDE.md (§6).
2. Step 2: apply, rebuild, test, browser check, deploy, F11 check (§5). Optionally with the error reset, the undo emit
   and the Node-entry micro-fix (§4 Q2, Q3, Q7).
3. firebase-tools devDependency: the two-agent plan in §6.
4. F10, as its own project (2–3 days, plus the owner's check on the Retina display).
5. aio-promo-monitor font fixes, in a session there.
6. Optional investigations: the S8 residual heap growth, the Generate PDF renderer growth, why in-browser PDFs are not
   byte-reproducible since step 1.

## 10. Where things live

| Where | What |
|---|---|
| `docs/research/2026-10-17-designer-crash-study.md` | Root-cause study (committed in `638c491`) |
| `docs/research/2026-10-18-step2-fixes-and-studies.md` | Step 2, integration, studies, review fixes (§12); committed in `638c491`, the §12 update is uncommitted |
| `docs/research/2026-10-18-step2-patches/` | The 6 patches + README (new, uncommitted) |
| `docs/superpowers/HANDOFF-2026-10-18-designer-crash-fix.md` | This file (new, uncommitted) |
| Scratch: `/private/tmp/claude-501/-Users-matteobrogin-Documents-developer-personal-projects-aio-pdfme/daabdcc4-7eac-4eca-8464-a2841af585f3/scratchpad/` | Temporary. `repro/` (harness and README, owner template copies), `fix1*/` (step 1 implementation, review, verification), `step2-*` (halves, integration, review, final trees and builds, harness, runs), `newcrash/` (the 2 dump copies and `frames.py`), `handoff/` (this run's dry-run scripts and logs, the data-check script) |
| aio-promo-monitor `docs/superpowers/BACKLOG.md:256-268` | The invoice-font note (uncommitted) |
| `~/.claude/projects/-Users-matteobrogin-Documents-developer-personal-projects-aio-pdfme/memory/` | `explain-every-fix-option`, `invoice-fonts-vs-designer` |

## 11. How this handoff was checked

Read first-hand at 18:39–19:10:

- `CLAUDE.md`; the step-2 doc (all); the crash study (Verdict, §1, §2, §3, §4, §5, §6, §7, §8);
- aio-promo-monitor's O16 handoff (format) and its `BACKLOG.md:256-270`;
- the owner's typed and queued messages and answers in the main transcript;
- the step-1 verify logs (`fix1-verify/logs`, `runs`, `equiv/compare/compare.json`, `consumer.log`) and the
  `fix1-fix` pin runs.

Commands, all read-only or in scratch:

- `git status`, `log`, `show --stat`, the reflog of `origin/main`;
- `curl` of the live `index.html` (headers, bundle name, opt-out) and of `/designer` (404);
- `ls -lT` of `playground/dist` and `.firebase`; greps of the deployed bundle for F1, F2 and `maxZoom:800`;
- Crashpad file dates, plus `newcrash/frames.py` on the 2 newest dumps;
- the full dry-run matrix of the README (GNU and Apple patch, `git apply --check`), on a scratch copy of the 659
  tracked files taken at 18:42;
- sha256 of the persisted patches against the scratch originals (6/6 identical);
- the data-check script.

Not re-run here: browsers, Jest, tsc, builds (taken from the step-1 logs and the finisher's re-verification).

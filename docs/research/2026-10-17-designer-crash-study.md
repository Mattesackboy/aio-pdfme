# Designer crash & lag study — 2026-10-17

Study only — no code changed. This file is the only thing added to the repository. Every number
below is either a first-hand measurement or comes from reading the code at the cited `file:line`.
Claims that rest on one study agent's report and were not re-checked are marked *(reported)*.

**Scope.** "The webapp" is this fork's pdfme playground (Vite + React SPA: `/designer`,
`/form-viewer`, `/templates`), deployed to Firebase Hosting from `playground/dist`; the owner also
runs it locally with `npm run dev` (§1.1). Symptom: constant
lag, and after a while Chrome shows "Aw, Snap!" (Italian "Uffa!", "Codice di errore: 5"). The fork
point is upstream `d1db660` (2025-04-08; `git describe` = `5.3.15-15-gd1db660e`, i.e. 5.3.15 in
practice). `packages/*` are unmodified upstream; the owner's 8 commits touch only `playground/` and
`.nvmrc`. Two hard constraints: the 800% zoom stays, with a sharp background; and nothing may break
aio-promo-monitor, which generates PDFs with npm `@pdfme/common`/`generator`/`schemas` **5.3.15** from
the template JSON designed here and registers fonts **by name**.

**How the evidence was gathered.**

- **Runtime (Chrome).** Production `vite build`s of 10 playground variants, built from copies in a
  scratch dir (never inside the repo). A Puppeteer 24.4.0 harness drove them in headless Google
  Chrome **155.0.8059.82** (V8 heap limit 4192 MB) and Chrome for Testing **134.0.6998.35**, at
  1512×900 with devicePixelRatio 2 on this Mac (arm64, 36 GB).
  - Main template: the owner's `templates/inline/foto_erhardt.json` (35 fields, 466,636-char
    data-URI basePdf).
  - Recorded per step: V8 heap after forced GC (retained memory), sampled V8 peak, `--trace-gc` and
    Chrome-trace GC peaks, macOS `footprint` of the renderer and GPU processes, long tasks (> 50 ms
    = frozen UI), `document.fonts.size`, every `canvas.toDataURL`. CPU profiles and heap snapshots
    were taken on demand.
- **Variants.**
  - `as-is`: HEAD.
  - `vanilla`: the upstream playground at `d1db660`, with maxZoom 250, Roboto as `Uint8Array` and 3
    fonts given as URLs.
  - `zoom250`: HEAD with maxZoom 250.
  - `fontsurl`: HEAD with the same 18 fonts passed as absolute URL strings.
  - `fix-h2h3` and `fix-h2h3h8`: HEAD with a patched `@pdfme/ui` and converter. maxZoom 800 and
    the scale-8 background are kept.
  - `fonts2x`/`fonts3x`/`fonts4x`: every font registered 2/3/4 times, as a dose-response test.
- **Scenarios.**
  - Open and idle. Hover sweep over all fields. Select a field. Drag.
  - 40 or 150 arrow-key nudges. Typing in the property panel.
  - Zoom 100% → 800% → 100%. Window resize. Reload the template. Generate PDF.
  - Designer ↔ Form/Viewer navigation.
  - A 15-minute "owner session" loop: zoom 400/600/800%, scroll, hover, select + drag, nudges,
    inline edit, Generate PDF every 3rd iteration, reload every 5th.
- **Upstream.**
  - A full-history clone of github.com/pdfme/pdfme: main at `ffc18cde` (2026-10-17); latest release
    **6.2.6** (2026-10-16).
  - The relevant commits, PRs and issues were read, and the bodies of all 457 issues and 1059 PRs
    were scanned.
  - A second harness compared npm 5.3.15 with 6.2.6 using the owner's fonts.
- **Static audit** of `packages/ui`, `packages/converter`, `packages/schemas`, `playground/` and the
  built bundles, plus Node 24 micro-benchmarks.
- **Crash history.** The owner's Chrome crash database
  (`~/Library/Application Support/Google/Chrome/Crashpad/completed`) was first checked only for the
  V8-OOM signature string and for file dates. In the review, its V8-OOM crash keys were extracted
  by scripts that print only numbers, status strings and whitelisted JS function names (OOM
  location, cage status, largest free region, allocator size, the last GC lines and so the isolate
  uptime, frame names of `v8-oom-stack`). Dump URLs and page content were never read.
- **Synthesis re-check.** The code was read at every cited line, and the raw CSV/JSON, the
  heap-snapshot summaries and the upstream diffs were checked. The decisive A/B (select a field,
  then nudge it; as-is vs patched) was re-run in Chrome for Testing 134.
- **Review re-check (2026-10-18).** Two adversarial verifiers added first-hand runs: the crash keys,
  retention reruns in Chrome for Testing 134 (dropdowns, field switches, React DevTools, the Vite
  dev server), a blob-URL download test and an output-equivalence A/B on 3 templates. The revision
  re-ran the crash-key extraction, the blob-URL test and the template compatibility check with the
  consumer's real font maps. The results are folded in below.

## Verdict

- **What kills the tab: a V8 out-of-memory crash inside the property panel's
  `JSON.stringify(options)`.**
  - 92 of the owner's 97 Chrome crash dumps carry `JavaScript OOM (CALL_AND_RETRY_LAST)`. All 70 of
    them that carry V8 stack keys (every one since 2026-03-19) die in `stringify` called from
    `DetailView`.
  - The dumps' V8 keys show how. The 4 GB pointer-compression cage holds **3.1–3.8 GB of live
    data**: the two last-resort full GCs before death free ≤ 5.2 MB. It has no free region large
    enough for the next `JSON.stringify(options)` result: largest free region 54.75–174 MB,
    against one ≈175 MiB string today (≈109 MiB before 2026-03-25).
  - At today's string size every crash happened with ≥ 3.09 GB of live heap, not at 4.2 GB.
  - The study reproduced the signature at 4× the font payload (Chrome logged
    `V8 javascript OOM (CALL_AND_RETRY_LAST)`). Its dump shows the same mechanism: 2834 MB live,
    largest free region 617 MB against a ≈702 MiB string.
- **Where the memory goes: one line of upstream pdfme.**
  - While a field is selected, the property panel computes `JSON.stringify(options)` on every
    render (`packages/ui/src/components/Designer/RightSidebar/DetailView/index.tsx:83`).
  - `options.font` holds the 19 fonts as `Uint8Array` (7.89 MB). JSON writes every byte as
    `"index":value`, so a single call produces a **92-million-character string (175 MiB)**.
  - Selecting a field and then nudging, dragging or typing in the panel creates new strings on
    every edit, and freezes the UI for about 1 s each time. In the harness 2–4 strings stay
    referenced by React: ≤ 0.74 GB live at 1×. The sampled peaks of 2.4–2.6 GB are garbage.
  - Live heap after GC scales with the font bytes: 1.43 GB at 2×, 2.14 GB at 3×, and at 4× the tab
    crashes with 2.83 GB live.
  - **Not explained: the accumulation.** The owner's sessions died at 1× with 3.1–3.8 GB live, 4–5×
    more than the harness ever held. In 40 of 70 crashes this happened within 2 minutes of the
    renderer's start (median 113 s). That is the equivalent of ~17–21 retained strings. Neither
    the study nor the review reproduced it, and the retainer is unknown (§1.3, §7).
- **Why it lags all the time: a second bug of the same family.**
  - Every field's Renderer deep-copies `options`, font bytes included, on every render
    (`packages/ui/src/components/Renderer.tsx:41`; `cloneDeep` is `structuredClone`).
  - With 35 fields that is 35 × 7.9 MB = 276 MB copied per hover, selection change or zoom step.
  - A hover sweep freezes the UI for 4.5–10.9 s in total; zooming to 800% for 1.3–4.7 s.
- **The 800% zoom is not the cause.**
  - With maxZoom 250 the same build lags and bloats the same way: 374 MB retained after selecting a
    field, and nudges peak at 2.36 GB.
  - With the font bugs removed, zooming to 800% and back freezes the UI for 0 ms, with today's
    background resolution.
  - The background raster at scale 8 is a real but secondary cost: +190 MB at open and 0.3–1.9 s
    per window resize.
- **Vanilla vs the owner's version.**
  - Both bugs are vanilla upstream code. The Renderer copy is present from 5.3.15 up to 6.1.11;
    the property-panel line is in every 5.x release except 5.5.4–5.5.5 (checked per tag). Vanilla only
    ships 0.13 MB of binary fonts, so the effect is about 60× smaller: a 15-minute vanilla session
    peaked at 172 MB with 11 s of blocking in total, against 2.58 GB and 323 s for the owner's
    build.
  - The owner's report that vanilla also crashed **could not be reproduced and is not explained by
    this mechanism**. No crash dump older than 2025-10-23 survives (Crashpad deletes reports after
    365 days), so that period cannot be checked. Some remembered crashes may also be other tabs:
    4 of the owner's dumps are V8 OOMs without a DetailView frame, at least 3 of them probably
    other pages (§1.1).
- **Fix (not implemented).** Pass the fonts as absolute URLs (one function in
  `playground/src/helper.ts`), and/or patch two places in `packages/ui`.
  - Both were measured: the 15-minute session froze for **7–8 s instead of 323 s**, the peak heap
    was **103–123 MB instead of 2.58 GB**, and selecting a field retained **26–32 MB instead of
    376 MB**.
  - **Expected, not yet shown, to remove the crash.** They shrink each stringify result from
    175 MiB to a few kB, so whatever retains these strings in real use stops mattering. That
    holds if the 3+ GB is these strings, which the ~180 MB steps of the live sizes suggest (§1.1).
    No fixed build was run at a crashing dose (`fonts4x`) or in the owner's real profile (see F2).
  - maxZoom 800 and the scale-8 background are unchanged, and so are the template JSON and the font
    names. The review's A/B on 3 templates found byte-identical screenshots, saved JSON and
    generated-PDF rasters.
- **Confidence.**
  - **High** for the lag and for the crash's allocation site: the stack keys of 70 of 70 owner
    dumps since 2026-03-19, code, heap snapshot, CPU profile, dose-response and A/B fix.
  - **Unknown** for the accumulation: why real sessions reach 3.1–3.8 GB live within minutes, while
    the harness at 1× stays ≤ 0.74 GB live, about 4× short of the crash condition.
  - **Inferred** (signature and date only) for the 22 dumps from 2025, which carry no stack keys.
    4 other V8 OOMs (no DetailView stack; at least 3 probably other tabs) and 1 dump without OOM
    keys stay unexplained (§1.1).
  - **Low** for the crashes reported on vanilla.

## Summary table (fix proposal, not implemented)

| # | Intervention | Files | Effort | Risk | Effect | 800% zoom |
|---|---|---|---|---|---|---|
| F1 | Fonts as absolute URL strings | `playground/src/helper.ts` | ~20 lines | Low | **Measured** (`fontsurl`): S8 blocked 8 s vs 323 s, peak V8 123 MB vs 2.58 GB | Unchanged |
| F2 | DetailView effect deps without font bytes | `DetailView/index.tsx:83` | 1–5 lines | Low | **Measured** (`fix-h2h3h8` vs `fix-h2h3`): select 26 vs 377 MB; 40 nudges 38 ms vs 59 s frozen | Unchanged |
| F3 | Renderer render key without cloning font bytes (port of upstream #1576) | `Renderer.tsx:39-47` | ~10 lines | Low | **Measured** (`fix-h2h3`): hover sweep 0 vs 4.5–10.9 s frozen | Zoom steps 0 ms (measured on `fontsurl`) |
| F4 | pdf.js: destroy documents, `page.cleanup()`, release the canvas, `isEvalSupported:false` | `packages/converter/src/*` | ~20 lines | Low | **Measured** (`fix-h2h3`): `document.fonts` constant; reload peak 383–517 vs 540–900 MB; closes CVE-2024-4367 | Unchanged |
| F5 | Rasterize a real basePdf once (cache keyed by its content + maxZoom; blank PDFs always recomputed); blob URL instead of base64 | `packages/ui/src/hooks.ts` | ~40 lines | Low–med | Expected: resize no longer re-rasterizes (today 0.3–1.9 s each) | Identical bitmap |
| F6 | Playground lifecycle: no orphan instances, fonts fetched once, PDF object URLs released without a timer | `playground/src/routes/*`, `playground/src/helper.ts`, `packages/ui/src/class.ts` | ~40 lines | Low | Expected: no growth or page errors on navigation | None |
| F7 | `Root.tsx` FontFace registry (no re-adding, delete on unmount) | `packages/ui/src/components/Root.tsx` | ~30 lines | Low | Expected: `document.fonts` constant across mounts (today 25 → 900 in 4 cycles) | None |
| F8 | Cap undo history at 100 | `Designer/index.tsx`, `hooks.ts` | 2 lines | None | Bounded (today +24 KiB per commit, forever) | None |
| F9 | Skip the full re-sync when the class re-sends the editor's own template | `Designer/index.tsx:254-257` | ~10 lines | Low–med | Expected: no re-raster/deselect/scroll-to-top after an edit + resize | None |
| F10 | *(optional)* Sharper than today at 800%: viewport detail canvas over the unchanged scale-8 bitmap; needs pdf.js off the main thread | `Paper.tsx`, `hooks.ts` | days | Medium | 1:1 device pixels at any zoom | Better |

F1–F3 remove the lag (measured) and are expected to remove the crash: the giant strings are gone
in every fixed build, but no fix was run at a crashing dose or in the owner's profile. Do F1 and
F2 first.

---

## 1. Evidence

### 1.1 Crash signature (owner's Chrome) and reproduction

- **Owner's crash database, today.**
  - 98 dumps; 93 contain `CALL_AND_RETRY_LAST`. One of those (`17b0bca6-d3b5-4dfe-9723-cf20d427a036.dmp`,
    2026-10-17 23:06) is the study's reproduction, so the owner's own count is **92 of 97**.
  - OOM dumps per day: 2025-10-23 ×3, 2025-10-30 ×1, **2025-12-02 ×18**, 2026-03-19 ×1,
    2026-03-23 ×2, **2026-03-25 ×29**, **2026-08-23 ×37**, 2026-10-17 ×1 (21:43, before the study).
  - The other 5 owner dumps. 4 of them are V8 heap OOMs with other causes; the 3 long-lived
    renderers are probably other tabs or sites:
    - 2026-01-22: `Reached heap limit` (Chrome 143); no other keys.
    - 2026-04-04 19:10: allocator 3949.8 MB; renderer up ≈1.9 days.
    - 2026-04-04 19:15: `Ineffective mark-compacts near heap limit`; renderer up 1.7 h; 13-frame
      stack with no pdfme function name.
    - 2026-05-12: allocator 4000.4 MB; 2 isolates; renderer up ≈24.7 days.
    - 2026-03-26 has no V8-OOM keys at all (cause unknown). So 96 of the 97 are V8 OOMs.
  - The folder holds 85.5 MB and the oldest dump is from 2025-10-23. This matches Crashpad's
    default pruning, which deletes reports older than 365 days or when the database exceeds 128 MB
    (`PruneCondition::GetDefault()` = `DatabaseSizePruneCondition(1024 * 128)` OR
    `AgePruneCondition(365)`).
- **What the V8 crash keys say** (review; numbers, status strings and whitelisted function names
  only).
  - **Stacks.** The 70 `CALL_AND_RETRY_LAST` dumps since 2026-03-19 (Chrome 145, 151, 155) carry a
    `v8-oom-stack`. In **70 of 70** the top frame is `stringify` and a `DetailView` frame is present.
    The 22 dumps from 2025 (Chrome 139 and 141) carry no stack keys.
  - **Entry points of those 70 stacks:**
    - `onSelect` (selection): 37.
    - `changeSchemas`: 28. 7 of them sit under Moveable's `triggerEvent` (drag ends, and group
      resize or rotate ends) and 2 under an `onChange` handler.
    - `paste`: 1. A template update: 1. React-internal frames only: 3.
    - Arrow-key `move`: **0**. The study's 4× repro went through `move` → `changeSchemas`.
  - **Heap at death.**
    - Cage status `ran out of reservation` in all 70.
    - Live heap after the two last-resort mark-compacts: 3087–3800 MB (median ≈3415). Together
      they free ≤ 5.2 MB. Allocator capacity 4096 or 4192 MB.
    - Largest free cage region: 54.75–174.00 MB. It is always smaller than one string at that
      date's font payload: ≈175 MiB after `0f9d910`, and ≈109 MiB before it (54.75, 86.5 and
      99.75 MB).
  - **Quantized live sizes.** On each day the live sizes at death fall in clusters ~177–182 MB
    apart, as whole strings would. On 2026-08-23 they cluster at 3087–3101 (12 dumps), 3268–3284
    (20) and 3436–3462 MB (5); on 2026-03-25 at 3412–3416, 3585–3610 and 3768–3777 MB. That is the
    equivalent of ~17–21 retained strings (~32 of the smaller ones before 2026-03-25).
  - **Time to death.** Isolate uptime at death: median 113 s; 58 of 70 ≤ 300 s, 40 ≤ 120 s,
    6 > 1000 s. In 64 of the 69 consecutive pairs, the next crashing renderer started 0.8–2.5 s
    after the previous crash, consistent with an immediate reload of the crashed tab.
- **Which build crashed** (file timestamps; URLs were not read).
  - 2026-03-25 (29 dumps): most likely the deployed production build. `playground/dist` was built at
    17:24:48 and deployed at 17:24:57 (`playground/.firebase/hosting.ZGlzdA.cache`). The first
    crashing renderer started at ≈17:26:16.
  - 2026-08-23 (37 dumps): most likely the **Vite dev server**. `playground/dist` was not rebuilt,
    but `npm run dev` ran: `playground/public/template-assets/index.json` was written at 13:40:39
    and `playground/node_modules/.vite/deps/_metadata.json` at 13:41:21. The first crashing renderer
    started at ≈13:41:20.
  - Dev mode runs the same prebuilt `@pdfme/ui` dist, which bundles React's production build, so
    RC1 is identical there. The difference is the playground's `React.StrictMode`: its effect runs
    twice and builds two Designer instances (`document.fonts` 50 vs 25).
  - Review run on the dev server: retention unchanged (385 MB after selecting, 562 MB after
    40 nudges).
- **The crash days line up with font and template work.**
  - In this fork: `4c5ce35` (2025-10-17, "updated fonts for invoices"), `135f63e`/`7aa1cc3`
    (2025-12-02, OpenSans), `0f9d910` (2026-03-25, Segoe UI).
  - In the consumer's template history: 2026-03-23 (mediaworld/euronics), 2026-03-25
    (foto_erhardt), 2026-08-23 (amazon, 3 commits).
- **Reproduction (`fonts4x`, 31.6 MB of Uint8Array fonts, Chrome 155).**
  - Selecting a field left 1428 MB on the heap after GC. The first 40 nudges left 2133 MB retained,
    with a 3.44 GB sampled peak.
  - About 162 s in, during the second batch of nudges, the harness got `Page crashed!` and
    `Inspector.targetCrashed`. Chrome stderr:
    `ERROR:third_party/blink/renderer/bindings/core/v8/v8_initializer.cc:965] V8 javascript OOM (CALL_AND_RETRY_LAST).`
  - This is the same signature as the owner's dumps. Its dump shows the same mechanism: 2834 MB
    live, largest free region 617.25 MB against a ≈702 MiB string.
- **The owner's exact config (1×) did not crash** in ~15-minute sessions or stress runs.
  - Highest V8 heap seen by `--trace-gc`: **2428.8 MB**, just before an incremental mark-compact
    that brought it back to 557.8 MB. The peaks are garbage. GC pauses stayed at about 50 ms or
    less, so GC itself is not the lag.
  - Live heap after GC stayed ≤ 0.74 GB (≈18% of the 4 GB cage), against ≥ 3.09 GB live in every
    real crash: about 4× short of the crash condition. Sampled peaks were 2.55–2.58 GB.
  - Renderer footprint: up to 5.3 GB.

### 1.2 Measurements: variant × scenario (headless Chrome 155, DPR 2, foto_erhardt)

**Table 1. The property-panel bug (RC1) and its fixes.**

| Variant | Select a field: heap after GC / longest freeze | 40 nudges: frozen per batch / peak V8 / heap after GC | Crash |
|---|---|---|---|
| as-is (HEAD) | 375.8 MB / 1.84 s | 37–62 s / 2.55 GB / 552–732 MB | no |
| zoom250 (HEAD, maxZoom 250) | 373.5 MB / 1.20 s | 41.6 s / 2.36 GB / 552 MB | no |
| fix-h2h3 (Renderer + pdf.js fixed, RC1 not) | 377.3 MB / 1.15 s | 58.7 s / 2.55 GB / 555–733 MB | no |
| **fix-h2h3h8** (+ DetailView fixed) | **26.4 MB / 70 ms** | **38 ms / 110 MB / 29–31 MB** | no |
| **fontsurl** (fonts as URLs, no package change) | **31.9 MB / 87 ms** | **0 / 136 MB / 37 MB** | no |
| vanilla (d1db660) | 28.3 MB / 89 ms | 0 / 134 MB / 34 MB | no |
| fonts2x (15.8 MB of fonts) | 726 MB / 2.72 s | 75 s / 2.74 GB / 1080–1434 MB | no |
| fonts3x (23.7 MB) | 1077 MB / 3.58 s | 117 s / 3.65 GB / 1607–2136 MB | no |
| fonts4x (31.6 MB) | 1428 MB / 3.94 s | 137 s / 3.44 GB / 2133 MB | **yes** (2nd batch) |

More as-is results:

- 150 nudges sent 10 ms apart, as if holding an arrow key: 195 s frozen out of 221 s.
- Typing 20 characters, then 20 backspaces, in the property panel: 11.4 s frozen per iteration
  (fontsurl: 0).
- CPU profile of selecting a field plus 5 nudges: **5906 ms self time in `DetailView`**.

**Synthesis re-check** (Chrome for Testing 134, same harness, 10 nudges):

- as-is: selecting a field gives 375.1 MB after GC and a 1.19 s freeze. The 10 nudges cost
  21 long tasks = 9.1 s; heap after GC 552.8 MB, peak 986 MB.
- fix-h2h3h8: selecting a field gives 25.7 MB and a 73 ms freeze. The 10 nudges cost 0 ms; heap
  27.9 MB, peak 38.5 MB.

**Table 2. Hover and zoom lag (RC2).**

| Variant | Hover sweep over 35 fields, frozen | Zoom 100 → 800% (+ button), frozen per half-cycle | Notes |
|---|---|---|---|
| as-is | 4.5–10.9 s (67–68 long tasks) | 1.7 s mean, max 4.7 s | CPU profile of one sweep: **3807 ms self in `useRerenderDependencies`** |
| zoom250 | 4.4 s | — (stops at 250%) | |
| fix-h2h3 / fix-h2h3h8 / fontsurl | **0** | **0** on fontsurl (renderer ≤ 609 MB, GPU ≤ 0.94 GB at 800%); not run on the fix-* builds | |
| vanilla | 0 | — (stops at 250%) | |

The upstream harness ran npm 5.3.15 and 6.2.6 in headless Chrome 155 at 1440×900, DPR 2, with 210
hover moves (each includes ~33 ms of settle time):

- 5.3.15 with the owner's fonts, maxZoom 800: **111.6 ms per move**, 170 long tasks = 13.3 s.
- 5.3.15 with the owner's fonts, maxZoom 250: 80.7 ms per move.
- **5.3.15 with the vanilla fonts at maxZoom 800: 50.0 ms per move, no long tasks.**
- 6.2.6 with the owner's fonts at 800: 49.9 ms per move, no long tasks.

**Table 3. 15-minute owner session (S8).**

| Variant | Iterations | Frozen in total | Peak V8 | Heap after GC | Peak renderer footprint |
|---|---|---|---|---|---|
| as-is | 22 | **323 s of 871 s (37%)** | **2.58 GB** | 554–738 MB while a field is selected (31–36 MB after reloads) | 5.30 GB |
| vanilla | 61 | 11 s (1.2%) | 172 MB | 34–54 MB | 0.71 GB |
| fontsurl | 46 | 8 s (0.9%) | 123 MB | 37–51 MB | 0.92 GB |
| fix-h2h3h8 | 48 | 7 s (0.8%) | 103 MB | 28–43 MB | 0.94 GB |

Iteration counts differ because the cap is 15 minutes and as-is iterations take ~40 s each. Even
the fixed variants grow +16–20 MB/min of native memory, mostly from Generate PDF (see RC4).

**Table 4. Background raster (RC3) at open and on window resize.**

| Variant | Background bitmap | `toDataURL` | Open: frozen / peak renderer | Resize: frozen per resize, mean / max |
|---|---|---|---|---|
| as-is | 4762×6735 (scale 8, 32 MP ≈ 128 MB RGBA); JPEG data URL 1.42 MB | 131–693 ms | 1.0–1.7 s / 575–635 MB | 746 / 1941 ms |
| fontsurl | same | same | 0.95–1.18 s / 386–389 MB | 296 / 418 ms |
| zoom250 | 1488×2104 (scale 2.5), 0.29 MB | 191 ms | 0.82–0.90 s / 390 MB | 491 / 1158 ms |
| vanilla | 1488×2104 | 89 ms | 0.64–0.79 s / 202–226 MB | 93 / 237 ms |

Every resize re-runs `pdf2img` (one more `toDataURL` per resize). Zooming does not.

**Table 5. Native accumulation (outside the JS heap).**

| Scenario | as-is | vanilla | patched |
|---|---|---|---|
| 10 × Load Template (S5) | `document.fonts` 31 → 85 (+6 per reload); footprint +5 MB per reload; peak 540–900 MB | — | fix-h2h3: fonts constant at 19; +1.3 MB per reload; peak 383–517 MB |
| 4 × Designer → Form/Viewer → mode switch → Designer (S7) | `document.fonts` 25 → **900**; footprint 298 → 894 MB; 2 × `[@pdfme/ui] this instance is already destroyed` | fonts 26 → 370; 280 → 439 MB | — |
| 4 × Generate PDF (S6) | +15.7 MB per generate (JS heap flat) | +23 MB per generate | — |

### 1.3 What accumulates (heap snapshots, S8 as-is)

- **Start of the session** (nothing selected): 54.7 MB total self size.
- **End of the 15 minutes:** 772.8 MB. Almost all of the growth is strings: `(string)` went from
  2.6 to 711.2 MB.
- **The strings.** Four strings of **175.42 MB** each, all starting with
  `{"font":{"Helvetica":{"fallback":true,"data":{"0":0,"1":1,"2":0,…`.
  - This is the output of `JSON.stringify(options)`. DetailView:83 is the only call site in
    `packages/ui/src` that serializes `options` with the font bytes; Renderer replaces `data` with
    `'...'` first.
  - Their retainers are React hook state: effect `deps` and `memoizedState`, on the fiber and on its
    alternate.
  - They are released when the field is deselected or the template is reloaded; the heap then drops
    back to 31–36 MB.
  - **Exception (review):** once a property-panel dropdown (an antd `Select`) has been opened,
    2–4 strings (0.35–0.7 GB) stay retained with nothing selected.
    - Plain Esc: 25 MB after deselecting.
    - One Select opened per cycle: 379–382 MB after deselecting. Both Selects: 736–738 MB.
    - It plateaus, at one leaked DetailView generation per Select, so on its own it does not
      explain 3+ GB. The study's harness never opened a dropdown.
- **Everything else.** The next largest objects are two 1.42 MB background data-URL strings. All
  other categories grew by less than 7 MB. `JSArrayBufferData` stayed at 11.47 MB (115 buffers);
  PDF document objects did not grow.
- **Conclusion.**
  - In the harness the retained set is bounded but enormous: 2–4 × 175 MiB while a field is
    selected (≤ 0.74 GB live at 1×), plus up to ~0.7 GB after a dropdown was opened.
  - Each edit also creates 175–350 MiB of garbage strings, but garbage is not what kills the tab.
    In the owner's dumps the heap at death is 3.1–3.8 GB of **live** data, and the last-resort GCs
    free ≤ 5.2 MB (§1.1).
  - Real sessions therefore retain the equivalent of ~17–21 of these strings, 4–5× what the
    harness ever held, often within two minutes. That accumulation was not reproduced, and its
    retainer is unknown (§7).

### 1.4 Fonts vs zoom, and the font history

**Fonts vs zoom.**

| Fonts | maxZoom 800 | maxZoom 250 |
|---|---|---|
| Owner's fonts | Lag, 2.4–2.6 GB peaks | The same |
| Vanilla fonts | No lag (upstream harness) | No lag |

It is the font bytes, not the zoom.

**Font history** (this fork's commits). The size of one `JSON.stringify(options)` is estimated at
11.66 characters per font byte, measured, and stored two-byte (×2):

| From | Commit | Uint8Array font bytes (incl. Roboto) | One `JSON.stringify(options)` | Surviving OOM dumps |
|---|---|---|---|---|
| 2025-04-08 | `d1db660` (vanilla) | 0.13 MB | ~1.5 M chars ≈ 3 MiB | none (pruned) |
| 2025-04-16/17 | `5607bd1`, `4b04a16` (Arial, Helvetica) | 0.52 / 1.19 MB | ~6 / ~14 M chars ≈ 12 / 27 MiB | none (pruned) |
| 2025-10-17 | `4c5ce35` (invoice fonts) | 4.39 MB | ~51 M chars ≈ 98 MiB | 10-23 ×3, 10-30 ×1 |
| 2025-12-02 | `135f63e`, `7aa1cc3` (OpenSans) | 4.91 MB | ~57 M chars ≈ 109 MiB | 12-02 ×18, 2026-03-19 ×1, 03-23 ×2 |
| 2026-03-25 | `0f9d910` (Segoe UI) | 7.89 MB | 92.0 M chars ≈ 175 MiB (measured) | 03-25 ×29, 08-23 ×37, 10-17 ×1 |

Two consequences:

1. Real sessions already crashed at the 4.4–4.9 MB level, while the harness did not crash at
   7.9 MB. Real use retains far more strings than the harness: 3.1–3.8 GB live at death against
   ≤ 0.74 GB (§1.3), by a mechanism not identified. This assumes the deployed build matched the
   committed code on those days. The largest free regions of the 2026-03-19/23 dumps (54.75–99.75 MB,
   below one ≈109 MiB string) are consistent with the 4.91 MB font set.
2. The string is twice as large as it needs to be because of `labels: {'signature.clear': '🗑️'}`
   (`playground/src/routes/Designer.tsx:56-58`). This is **vanilla playground config**, not an owner
   change. A single non-Latin-1 character makes V8 store the whole string as two-byte.

---

## 2. Root causes, ranked

### RC1 — The property panel serializes the font bytes on every render (crash + ~1 s freeze per edit)

- **Mechanism.** `DetailView` builds its widget map in an effect whose deps include
  `JSON.stringify(options)`.
  - The deps expression is evaluated on every render, before React compares anything.
  - `JSON.stringify` writes a `Uint8Array` as an object: `{"0":0,"1":1,…}`, about 11.7 characters
    per byte.
  - The effect then calls `setWidgets`, which forces a second render, so each change of the
    selected field runs the serialization at least twice.
  - React keeps the previous deps arrays (current fiber and alternate), so in the harness 2–4 of
    these strings are alive while a field is selected. Real sessions retain far more (§1.3).
- **Anchors.**
  - `packages/ui/src/components/Designer/RightSidebar/DetailView/index.tsx:59-83`: the deps are at
    `:83`. `:440-444` is the memo comparator, which compares only `activeSchema`; context changes
    still re-render the component, e.g. the new i18n function created on each class render at
    `packages/ui/src/components/AppContextProvider.tsx:67`.
  - `options` is the class's `this.options`, passed through at `AppContextProvider.tsx:70`. It
    includes `font`, built in `playground/src/helper.ts:22-120`.
  - The deployed bundle has it too. `playground/dist/assets/index-16a0f24c.js` contains
    `…Yt(lr)},[jt,$t,JSON.stringify(dt)])`, where `dt` is the options passed to `WidgetRenderer`.
- **Trigger.** A field is selected and anything changes it or re-renders the editor:
  - selecting, or switching to another field;
  - drag or resize end;
  - every arrow nudge, including key auto-repeat;
  - every property-panel edit (100 ms debounce) and the align buttons;
  - window resize or language change while a field is selected.

  At 800% detail work, that is practically every action. The owner's crash stacks enter through
  selection (`onSelect`, 37 of 70) and `changeSchemas` (28 of 70: property edits, align buttons,
  drag/resize ends), never through arrow nudges (§1.1).
- **Magnitude.**
  - One call produces 92,043,628 characters: 421 ms in Node, 175 MiB as a two-byte string in Chrome.
  - Selecting a field adds +350 MB retained. Each edit freezes the UI for about 1 s.
  - In the harness the live heap stays ≤ 0.74 GB at 1× (the peaks of 2.4–2.6 GB are garbage), and
    the tab crashes at 4×. The owner's sessions crash at 1× with 3.1–3.8 GB live.
- **In vanilla?** Yes. The same code is in every 5.x release except 5.5.4–5.5.5 (including
  5.5.10), but vanilla's 0.13 MB of binary fonts give 1.5 M characters (7 ms), which is harmless.
  The bug is upstream; the owner's 7.89 MB of `Uint8Array` fonts are the trigger.
- **Evidence.** Table 1, §1.3 heap snapshots, the CPU profile, the dose-response runs, the A/B fix,
  the synthesis re-check, and the V8 stack keys of 70 owner dumps (§1.1).

### RC2 — Every field Renderer deep-copies the font bytes on every render (constant lag)

- **Mechanism.** `useRerenderDependencies` calls `cloneDeep(options)` before replacing font `data`
  with `'...'`, and `cloneDeep` is `structuredClone` (`packages/common/src/helper.ts:31`). The copy
  is thrown away right after.
  - The hook runs in every render of every Renderer, and Renderers are not memoized.
  - Hover state lives at the top of the editor (`Designer/index.tsx:69, 220-222`), so every hover
    enter or leave re-renders all of them.
- **Anchors.** `packages/ui/src/components/Renderer.tsx:39-56`: the clone is at `:41`, the data is
  replaced only after it at `:42-46`, and the result is serialized at `:47`.
- **Trigger.** Every editor render: hover enter/leave over a field or a list item, selection,
  commit, each 25% zoom step (`scale` is in the deps), and class re-renders.
- **Magnitude.**
  - 7.89 MB × 35 Renderers = **276 MB of `ArrayBuffer`s copied per render**: 31.4 ms per render in
    Node, longer in Chrome.
  - Hover is 111.6 ms per move against a 50 ms baseline. A hover sweep freezes the UI for
    4.5–10.9 s, and zooming 100 → 800% for 1.3–4.7 s.
  - This is churn, not retention: the JS heap stays flat and the copies are external memory.
- **In vanilla?** Yes, about 60× smaller (0.13 MB of fonts: 0.6 ms per render).
- **Evidence.** Table 2, the CPU profile, and the upstream 5.3.15/6.2.6 harness.

### RC3 — Background rasterized at scale = maxZoom/100 and redone on every size/template change

- **Mechanism.** For a real basePdf, every init parses the PDF and renders each page at
  `scale = maxZoom/100 = 8` (A4: a 4762×6735 canvas, 32 MP ≈ 128 MB RGBA) on the main thread.
  - The canvas is then encoded with `toDataURL('image/jpeg')`, decoded with `atob`, and re-encoded
    by a per-byte string concatenation (`arrayBufferToBase64`).
  - The result is shown as a CSS `background-image` data URL.
  - The effect depends on `[template, size]`: the ResizeObserver creates a new `size` object after
    every debounced resize, and every class render after an edit passes a new `template` object
    (see RC5). There is no cancellation.
- **Anchors.**
  - `packages/ui/src/hooks.ts:74-77` (`pdf2img(…, { scale: maxZoom })`), `:81`, and `:96-107` (the
    effect).
  - `packages/ui/src/helper.ts:593-597` (`useMaxZoom`) and `:247-267` (per-byte base64).
  - `packages/converter/src/index.browser.ts:39-43`, `packages/ui/src/components/Paper.tsx:91-92`,
    `packages/ui/src/class.ts:38-47`.
  - `playground/src/routes/Designer.tsx:66` (`maxZoom: 800`).
- **Magnitude.** +190 MB peak footprint at open compared with scale 2.5. The JPEG data URL is
  1.42 MB, held twice in the heap. Each resize freezes the UI for 0.3–1.9 s.
- **Not the crash or lag driver.** zoom250 shows the same Table 1 numbers, and fontsurl at 800%
  freezes the UI for 0 ms with this exact bitmap.
- **Sharpness today (computed, not visually verified).**
  - The paper is 793.7 CSS px wide at 100% (210 mm × 3.7795 px/mm), i.e. 1.333 CSS px per PDF
    point.
  - Base fit scale ≈ 0.65–0.75 for a ~900-px-tall window. At 800% on DPR 2 that is
    1.333 × base × 8 × 2 ≈ 14–16 device px per point, against the bitmap's 8.
  - So today's background is device-sharp only up to about 400–460% zoom, and is **upsampled about
    1.7–2.0× at 800%**.
- **In vanilla?** Yes, at scale 2.5 (10× fewer pixels).

### RC4 — Native accumulation per UI mount/init: FontFaces and orphan instances

- **`Root.tsx` re-adds every font on every mount.**
  - It creates `new FontFace(...)` for each font and filters with `document.fonts.has(fontFace)`,
    which compares object identity and so never matches. Nothing is removed on unmount
    (`packages/ui/src/components/Root.tsx:12-29`).
  - The owner's fonts are 7.9 MB of binary font data per mount.
- **pdf.js documents are never destroyed.**
  - `pdf2img`/`pdf2size` create a new document per call and never call `destroy()`
    (`packages/converter/src/pdf2img.ts:33-60`, `pdf2size.ts:20-32`).
  - pdf.js's FontLoader therefore never removes the PDF's embedded fonts from `document.fonts`:
    +5–6 faces per init.
  - Everything runs on the main thread in a "fake worker", because
    `packages/converter/src/index.browser.ts:3` imports `pdf.worker.entry.js`, which sets
    `window.pdfjsWorker`. The harness saw 0 workers in every variant.
  - The documents themselves are collected by GC; heap snapshots show no growth.
- **Orphan instances in the playground.**
  - `FormAndViewer.tsx:83-88`: `onChangeMode` calls `setMode` **and** `buildUi`. The `[mode]` effect
    at `:126-133` then destroys the old instance and builds a second new one, so each Form/Viewer
    switch leaves one orphan instance with its own ResizeObserver and fonts.
  - `Designer.tsx:28-37, 174-181`: the build deletes `?template=` from the URL, which re-runs the
    effect while the first build is still awaiting the fonts. This applies to the Templates-gallery
    flow; it was not exercised at runtime.
  - `generatePDF` (`playground/src/helper.ts:196-224`) re-fetches all 18 fonts on each click and
    never revokes its object URL (`:219`).
- **Magnitude.**
  - S7 (4 cycles): `document.fonts` 25 → 900 and footprint +150 MB per cycle (vanilla: +40 MB).
  - Generate PDF: +16–23 MB of native memory per click.
  - None of this is in the V8 heap, so it **cannot** produce the observed V8 OOM. It matters for
    long sessions with a lot of navigation.
- **In vanilla?** Yes, smaller.

### RC5 — Minor or latent

- **Undo stack never trimmed.** `Designer/index.tsx:106-116` keeps `past.current.push(cloneDeep(...))`
  forever: +24 KiB per commit, +0.27–0.29 MB per S8 iteration. Real, but reaching 4 GB would take
  days of editing.
- **Template echo re-sync.** After an edit the class holds the template it received from the editor
  (`packages/ui/src/Designer.tsx:73-79`).
  - At the next class render (a resize, a language change) the editor sees a "new" template
    (`Designer/index.tsx:254-257`) and does a full re-sync.
  - The re-sync gives every schema a new uuid, so all Renderers remount
    (`packages/ui/src/helper.ts:269-278`). It also drops the selection, scrolls to the top, and
    re-rasterizes the background.
  - Found by reading the code; not measured separately.
- **Module caches.** `CacheContext` (`contexts.ts:14`) and Preview `_cache` (`Preview.tsx:23`) are
  never cleared, but the UI only stores `getFontKitFont-<fontName>` in them, so they are bounded by
  the number of fonts. Not a cause.
- **Security, not memory.** `getDocument(pdf)` without `isEvalSupported:false`
  (`index.browser.ts:32, 48`) leaves pdf.js 3.11.174 exposed to CVE-2024-4367 when opening an
  untrusted PDF. Upstream fixed this in #1182 (5.4.3).

---

## 3. Upstream status (pdfme main `ffc18cde`, latest release 6.2.6)

| Cause | Upstream | Commit / PR | First release |
|---|---|---|---|
| **RC1** DetailView `JSON.stringify(options)` | **Removed**, as part of a hook cleanup; nobody diagnosed it as a memory bug. History: the line existed since 2023–2024; removed in 5.5.4 (`75b17ac0`, #1247); **re-added two days later in 5.5.6** (`ae82bbc6` "fix: optimize useEffect dependencies in DetailView component"); still in 5.5.10; removed for good in `577db47a` "Clean up ui hook dependencies" (widgets via `useMemo` on option identity). | `577db47a` | **6.0.0** |
| **RC2** Renderer font clone | **Fixed**: options are cloned without `font`; a font map with `data: '...'` is built for the key. | `8ea32d94` (#1576, contributor cubimon) | **6.1.12** |
| **RC3** background scale = maxZoom | **Coupling unchanged**: HEAD `hooks.ts:101` still calls `pdf2img(imageBuffer, { scale: maxZoom })` and `useMaxZoom` is still `maxZoom / 100`. Rendering moved to PDFium in a dedicated Worker with PNG output, a request-id guard and chunked base64. Mobile pixel clamps were tried and reverted. | `99dc26d5` (#1558); `ed0ee1cd` (#1549), `a994d459` (#1551), `1e1398cd` (#1552) | 6.1.6–6.1.7 |
| **RC4** Root FontFace re-add | **Unchanged**: same identity-based `document.fonts.has()`. Measured on 6.2.6: +19 FontFaces per Designer re-creation (38 → 171 over 8 cycles). | — (#710 closed without a fix) | — |
| **RC4** pdf.js never destroyed / fake worker | **Fixed**: `loadingTask.destroy()` in `finally`, a real module worker (pdfjs 5), later PDFium in a Worker. | `22d4fd1f`, `99dc26d5` | 6.0.0 / 6.1.7 |
| **RC4** playground orphan instances, blob URLs, font refetch | **Rewritten playground**: build cancellation, destroy-before-create, object URLs revoked. These are playground fixes, not in `packages/`. | `786c5b93` (#1495), `a46f8359` (#1548) | 6.1.3 / 6.1.6 |
| **RC5** undo stack | **Capped** at `MAX_HISTORY_LENGTH = 100`. | `1d35dbf3` (#1643) | 6.2.2 |
| **RC5** CVE-2024-4367 | **Fixed** with `isEvalSupported: false`. | `2a1ea0ef` (#1182) | 5.4.3 |

The first release with both RC1 and RC2 fixed is **6.1.12**. Checked per tag: RC1 is present in
5.3.15–5.5.3 and 5.5.6–5.5.10, and absent in 5.5.4–5.5.5 and from 6.0.0 on. RC2 is present up to
6.1.11.

**What maintainers and contributors said** (verbatim):

- On RC2, PR #1576, author cubimon: *"Fonts are copied on renderKey resulting in low performance if
  fonts are used as bytearrays instead of string urls. This fix avoids copying the font data in
  renderKey."* Maintainer hand-dot: *"Released as 6.1.12."*
- Issue #1565, user raulopaulo: *"Fonts are copied by structuredClone on renderKey on every
  interaction, which results in the bad performance. This is especially bad if multiple fonts are
  specified, in my case I had about 20 fonts, in the screenshot you can see that a single font (~1MB
  Arial) already takes 400ms."* Another commenter: *"After upgrading to 6.1.12 the issue has been
  resolved."*
- Issue #1458, hand-dot: *"Closing this based on the reports that the Form performance issue was
  addressed by #1576 (render-key / font cloning)."*
- On RC3, PR #1549, hand-dot, about **iOS Safari**: *"page backgrounds were rendered via `pdf2img` at
  the `maxZoom` scale (5x with the playground's `maxZoom: 500`). For the A3-sized 2-page PDF this
  created 4110x5953 canvases (~24.5M pixels each), exceeding iOS Safari's ~16.7M pixel per-canvas
  limit and exhausting memory, repeatedly killing the tab"*. Then PR #1552: *"Backs out the mobile
  crash mitigation attempts, since neither resolved the real-device crashes"*, and commit
  `1e1398cd`: *"The per-page canvas clamp did not resolve the mobile crashes either, so remove it
  entirely to keep the codebase clean while the root cause is investigated."*
- PR #1558, hand-dot: *"Move browser PDF rendering into a dedicated `clawpdf` Web Worker so heavy
  template base PDFs do not render on the main thread."* The same PR lowered the upstream
  playground's maxZoom from 500 to 300.
- On RC4, issue #710, hand-dot, when closing it: *"The thread converged on Safari/WebKit memory
  behavior (and workarounds such as a new window), and we have not confirmed a pdfme-side fix on
  current Safari/iPad builds."*
- No upstream issue or PR mentions a desktop Chrome "Aw, Snap", a renderer OOM, or the DetailView
  string. The searches covered Aw Snap, out of memory, OOM, SIGTRAP, RESULT_CODE, Error code 5,
  Uffa, memory, leak, crash and more *(reported)*. The synthesis re-searched all issue and PR
  bodies for DetailView and stringify and found nothing relevant.
- **6.2.6 at runtime.** The upstream harness measured hover and zoom only; it never selected a
  field. So the removal of RC1 in 6.x is verified in the code (HEAD DetailView has no
  `JSON.stringify(options)`), not at runtime.

### 3.1 Upgrading the Designer vs the consumer's generator 5.3.15

- **Template JSON format: no breaking change** between `d1db660` and 6.2.6. The zod schema is still
  `.passthrough()`, and `pdfmeVersion` is informational only.
  - The upstream study simulated the 6.2.6 Designer's load/save on all 11 owner templates and
    generated them with npm 5.3.15, using one merged font map with the consumer's font names: 11/11
    accepted, identical byte sizes, pixel-identical rasters.
  - The synthesis checked `compat/out/results.json`: every variant `ok: true`, with equal sizes.
  - That merged map is not what production uses. The revision re-ran the check with the consumer's
    real per-vendor maps from `loadPdfFont`, i.e. `font: undefined` for MEDIAWORLD and UNIEURO.
    Result: 11/11 templates accepted in all 4 variants, identical byte sizes, and 100-dpi rasters
    identical across the variants.
- **Hazard 1 (re-verified first-hand).** Since 5.3.17 (#1015, `8230cfb5`), new fields get
  `fontName` = the Designer's fallback font. In this playground that is `Helvetica`
  (`playground/src/helper.ts:23-26`).
  - npm 5.3.15 with the consumer's EURONICS font map (Arial/ArialBold) then throws
    `[@pdfme/common] Helvetica of template.schemas is not found in font.`
  - The fork's new fields (fontName left undefined) generate fine.
- **Hazard 2 *(reported)*.** Properties that exist only in 6.x are ignored by 5.3.15: text
  padding/border, inline-markdown, `overflow: 'expand'`, image `objectFit`. New schema types throw
  "not found in plugins". `#RRGGBBAA` colors are drawn opaque. A 4-digit `#RGBA` color makes 5.3.15
  throw, and that hazard already exists in the fork.
- **Hazard 3 *(reported, measured by the upstream agent)*.** 6.2 line breaking (UAX #14, #1615)
  differs from 5.3.15. For wrapping text, the 6.x preview no longer matches what the consumer
  prints: 1.1–2.7% of pixels differ on 5 templates with long, punctuated inputs.
- **Mechanics.** ESM-only, Node 20+, plugins must be passed explicitly, React 19 is bundled. In
  6.2.6, URL fonts must be public (`isUrlSafeToFetch` rejects localhost); this would matter for F1
  under `npm run dev`, and only after an upgrade. The upstream playground is a different app, with
  maxZoom 300.

---

## 4. Fix proposal (not implemented)

The list is ordered by impact, then by risk. F1–F3 remove the lag (measured) and are expected to
remove the crash (see F2's verification); F4–F9 remove the remaining slow growth and wasted work;
F10 is an optional sharpness upgrade.

**Why none of this can affect aio-promo-monitor.**

- No item touches `schemasList2template`, the template JSON shape, the basePdf passthrough, or any
  font key.
- No item touches `packages/common`, `packages/generator` or `packages/schemas`. Those are the only
  pdfme packages the consumer uses, and it takes them from npm 5.3.15, not from this repo.

**Build chain.** The playground uses `packages/*/dist` through symlinks
(`playground/node_modules/@pdfme/* -> ../../../packages/*/dist`), and the `@pdfme/ui` bundle inlines
`@pdfme/converter` and pdf.js. A package fix therefore ships only after rebuilding
`packages/converter` → `packages/ui` → `playground` and redeploying `playground/dist`. F1 needs only
the playground rebuild.

**Acceptance checks for every fix (F1–F4), on top of the per-fix thresholds below.**

- **Equivalence A/B on all 11 templates**, fixed build against today's. These must be
  byte-identical:
  - screenshots at 100% and 800%;
  - the template JSON saved after a scripted edit-and-undo sequence;
  - the generated-PDF raster.

  The review ran this for `fontsurl` and `fix-h2h3h8` on foto_erhardt, thomann and euronics. All
  outputs were identical and all 19 FontFaces were `loaded`.
- **Consumer check:** generate every exported template with the consumer's own generator and its
  per-vendor font maps.
- **Real conditions:**
  - one headful Chrome 155 session on the Retina display;
  - a run with several same-site tabs;
  - the F1/F2 checks repeated on the dev server (`npm run dev`, with StrictMode).
- **After deploying:**
  - re-run a crash-key script that reads only the numeric V8-OOM keys and whitelisted frame names
    (like the review's `verify-causality/oomkeys.py`) on the Crashpad folder; there must be no new
    dump with a `stringify`/`DetailView` stack;
  - over 2–4 weeks of normal use, there must be no new `CALL_AND_RETRY_LAST` dump.

### F1 — Pass the fonts as absolute URLs (playground only; the fastest relief, measured)

- **Problem.** The 18 fonts go into `options.font` as `Uint8Array`, which feeds both upstream bugs
  (RC1, RC2).
- **Change.** In `getFontsData`, give each font `data` as an absolute URL instead of fetched bytes.
  Keep the keys and `fallback` flags exactly as they are:
  ```ts
  const fontUrl = (file: string) => new URL(`/fonts/${file}`, window.location.origin).href;
  // Helvetica: { fallback: true, data: fontUrl('helvetica.ttf') }, … (same keys, same files)
  ```
- **Files.** `playground/src/helper.ts:13-17, 22-120`.
- **Consumer.** Unaffected. The template JSON only stores `fontName`, and the names are unchanged.
- **800% zoom.** Unchanged (maxZoom 800, scale-8 background). The zoom becomes smooth because RC2
  disappears.
- **Caveats.**
  - The URL must be **absolute http(s)**. `packages/schemas/src/text/helper.ts:125-128` decodes any
    other string as base64, so `'/fonts/x.ttf'` would break the fonts.
  - The browser now fetches the fonts itself (same origin, HTTP cache). The Designer's text
    measurement and the generator fetch the URL (`packages/schemas/src/text/pdfRender.ts:46-48`).
    The `fontsurl` build generated 15 PDFs during the 15-minute session.
- **Verification** (harness, numbers to beat):
  - `--scenario SEL,S9 --iterations 2`: heap after selecting a field < 50 MB (today 375.8 MB); 40
    nudges frozen < 100 ms (today 37–62 s); peak V8 < 150 MB (today 2.55 GB).
  - S2h hover sweep: 0 long tasks (today 4.5–10.9 s).
  - S3 zoom to 800%: 0 long tasks (today 1.3–1.7 s per half-cycle).
  - S8 15 minutes: frozen < 15 s in total (today 323 s), peak V8 < 200 MB (today 2.58 GB).
  - Measured `fontsurl`: 0.9% frozen, 123 MB peak.

### F2 — DetailView: never serialize the font bytes (the actual crash fix in the library)

- **Problem.** RC1. It hits anyone who passes binary fonts, including future font sources such as
  IndexedDB.
- **Change.** This is the exact patch that was measured (`fix-h2h3h8`):
  ```ts
  // packages/ui/src/components/Designer/RightSidebar/DetailView/index.tsx:83
  }, [activeSchema, pluginsRegistry,
      JSON.stringify(options, (k, v) => (k === 'data' && v !== null && typeof v === 'object' ? '...' : v))]);
  ```
  - The replacer stops JSON from descending into font data. The key becomes a few kB.
  - Upstream's 6.0.0 rewrite (`useMemo` widgets on `[options, …, props, …]`) is the alternative.
    It is not recommended as a backport: upstream itself reverted a similar deps change within two
    days in 5.5.6 (`ae82bbc6`).
- **Files.** `packages/ui/src/components/Designer/RightSidebar/DetailView/index.tsx`.
- **Consumer and zoom.** No impact: this is UI-only code.
- **Verification.** Same thresholds as F1, on a build that still passes `Uint8Array` fonts.
  Measured: selecting a field 26.4 MB / 70 ms; 40 nudges 38 ms / 110 MB peak.
  - **Dose test (not yet run):** `fix-h2h3h8` + `fonts4x` + `SEL,S9` must stay under 100 MB and
    not crash. Today it crashes.
  - **The owner's triggers:** add scenarios that switch between fields, edit properties, and open
    the property-panel Selects before deselecting. Heap after GC must stay < 50 MB.
  - **Real profile (decisive):** in the owner's own Chrome profile, after about 2 minutes of normal
    work, a DevTools heap snapshot must show no string over 1 MB. The same snapshot taken today
    would identify the unknown retainer (§7).

### F3 — Renderer render key without cloning the font bytes (port of upstream #1576)

- **Problem.** RC2.
- **Change.** Port upstream `8ea32d94`; a verbatim cherry-pick conflicts because the function was
  renamed upstream:
  ```ts
  const { font: fontOptions, ...optionsWithoutFont } = options;
  const _options: UIOptions = cloneDeep(optionsWithoutFont);
  if (fontOptions) {
    const fontForKey: Font = {};
    Object.entries(fontOptions).forEach(([name, f]) => { fontForKey[name] = { ...f, data: '...' }; });
    _options.font = fontForKey;
  }
  ```
- **Files.** `packages/ui/src/components/Renderer.tsx:39-47`.
- **Consumer.** No impact. Plugins still receive the original `options`, font bytes included, for
  text measurement.
- **Zoom.** Each zoom step stops copying 276 MB. Zooming to 800% without the copy was measured at
  0 ms of long tasks on `fontsurl`; S3 was not run on `fix-h2h3`.
- **Verification.** S2h hover sweep 0 long tasks (measured on `fix-h2h3`), and S3 zoom 0 long tasks.

### F4 — pdf.js hygiene: destroy, cleanup, release the canvas, safe evaluation

- **Problem.** RC4 FontFaces (+6 per init), lingering 128 MB canvases until GC, and CVE-2024-4367.
- **Change.**
  - `pdf2img`: wrap the work in `try/finally { await pdfDoc.destroy() }`. After each page, call
    `page.cleanup()` and set `canvas.width = canvas.height = 0`.
  - `pdf2size`: the same `finally`.
  - `getDocument({ data: pdf, isEvalSupported: false })` at both call sites (upstream #1182).
  - Optional and not measured: stop importing `pdf.worker.entry.js` and point
    `GlobalWorkerOptions.workerSrc` to a bundled worker, so parsing leaves the main thread. The ui
    library build would then have to ship the worker file, so this is deferred.
- **Files.** `packages/converter/src/pdf2img.ts`, `pdf2size.ts`, `index.browser.ts`.
- **Consumer.** No impact. The consumer does not use `@pdfme/converter`.
- **Zoom.** None; same bitmap.
- **Verification.** S5, 10 reloads: `document.fonts` constant (measured 19; today 31 → 85);
  footprint ≤ +2 MB per reload (measured +1.3; today +5); reload peak ≤ 520 MB (measured 383–517;
  today 540–900).

### F5 — Rasterize the background once per basePdf, not once per resize

- **Problem.** RC3's repeated cost: a window resize, a DevTools dock, or the first class render after
  an edit redoes the 32 MP raster, the JPEG encode and the base64 round trip.
- **Change** in `useUIPreProcessor`:
  1. Cache only the raster of a real (non-blank) basePdf, i.e. the `pdf2size` + `pdf2img` results.
     - Key it by the basePdf's content **plus maxZoom**, which sets the raster scale. The same
       reference covers edits, because `schemasList2template` passes basePdf through by reference
       (`helper.ts:325-334`); a string compare or a hash covers reloads.
     - Always recompute the backgrounds, pageSizes and page count of a blank basePdf from the
       current (dynamic) template's schemas. For a blank basePdf they come from `schemas.map`
       (`hooks.ts:57-65`), and two paths change the page count while basePdf stays the same: add
       and remove page (`Designer/index.tsx:224-252`, offered only for a blank basePdf, `:269-271`),
       and Form/Viewer table overflow (`Preview.tsx:58-88`).
     - A cache keyed by basePdf alone would return arrays of the old length, and `Paper.tsx:31-33`
       renders nothing when the lengths differ.
  2. On a `size` change, recompute only `scale` (pure arithmetic).
  3. Replace `arrayBufferToBase64` for backgrounds with
     `URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }))`, and revoke the previous URL
     when it is replaced or on unmount.
  4. Add a request-id guard so a stale init cannot overwrite a newer one (upstream HEAD has one,
     `hooks.ts:66, 135-149`).
- **Files.** `packages/ui/src/hooks.ts:40-121` (Designer and Form/Viewer both use it).
- **Consumer.** No impact: display path only.
- **Zoom.** **Identical bitmap (scale 8) → identical sharpness**. Only the repeated re-renders go
  away.
- **Verification.** S4 resize: 0 `toDataURL` calls per resize (today +1); frozen per resize
  ≤ 100 ms (today 746 ms mean as-is, 296 ms with F1). `bgDims` must still read `4762x6735`, and the
  background image bytes must hash the same as today's JPEG.
  - Blank basePdf (euronics): add a page, remove it, then undo. The canvas must show every page.
  - "Change BasePDF" in the Designer.
  - Form/Viewer typing, including a table that overflows to 2 pages.

### F6 — Playground lifecycle (no orphan instances, fonts fetched once, PDF URLs released safely)

- **Problem.** RC4 orphans and per-click refetch.
- **Change.**
  - `FormAndViewer.tsx`: delete `buildUi(value)` from `onChangeMode` (the `[mode]` effect already
    rebuilds). In `buildUi`, check a `cancelled` flag after each `await` and destroy the previous
    instance before creating a new one.
  - `Designer.tsx`: the same cancellation pattern; read `?template` once. This also stops the
    StrictMode double build under `npm run dev` (§1.1).
  - `helper.ts`: memoize `getFontsData()` in a module-level promise, and have `generatePDF` reuse
    it.
  - Do **not** revoke the PDF's object URL on a timer. Chrome's PDF viewer re-requests the blob URL
    for Download, Ctrl+S and reload, and all of them fail once the URL is revoked.
    - Review test: with the URL revoked, the download was `canceled` with 0 bytes and the reload
      got no response. Unrevoked, the download completed (423,059 bytes) and the reload returned 200.
    - Upstream #1548 (`a46f8359`) ships the same 60 s timer, so its presence upstream is not
      evidence that it is safe.
    - Instead, revoke the previous PDF's URL when the next one is generated, so at most one stays
      alive, or save through an `<a download>` link.
  - `packages/ui/src/class.ts:119-125`: in `destroy()`, clear the pending debounced resize and call
    `resizeObserver.disconnect()`. This removes the `this instance is already destroyed` page
    errors.
- **Files.** `playground/src/routes/FormAndViewer.tsx:31-133`,
  `playground/src/routes/Designer.tsx:28-75, 174-181`, `playground/src/helper.ts:196-224`,
  `packages/ui/src/class.ts`.
- **Consumer and zoom.** No impact.
- **Verification.** S7, 4 cycles: 0 page errors (today 2); footprint growth ≤ 20 MB per cycle
  (today ~150). S6: per-generate native growth clearly below today's +15.7 MB. Generate a PDF, wait
  more than 60 s, then Download from the PDF tab and reload it: both must still work.

### F7 — `Root.tsx` FontFace registry

- **Problem.** RC4: +19 FontFaces (7.9 MB of binary font data) per mount, never removed. Still
  present upstream.
- **Change.** A module-level `Map<family, { source, face, refs }>`.
  - Skip creating a face when the same family is registered with the same source (the same URL
    string, or the same `Uint8Array`; F6's memoized fonts keep that identity).
  - Increment `refs` on mount. On the last unmount, call `document.fonts.delete(face)`.
  - Keep `FontFace.family` equal to the font key, so CSS `fontFamily: 'SegoeUI'` still resolves.
- **Files.** `packages/ui/src/components/Root.tsx:12-29`.
- **Consumer and zoom.** No impact.
- **Verification.** S7: `document.fonts` stays at one mount's worth (~19, plus pdf.js faces until
  F4) instead of 25 → 900.

### F8 — Cap the undo history at 100

- **Change.** `if (past.current.length > 100) past.current.shift();` in `commitSchemas`
  (`Designer/index.tsx:106-116`), and the same for the timeTravel stacks (`hooks.ts:227-235`). This
  matches upstream `MAX_HISTORY_LENGTH = 100` (#1643).
- **Verification.** In S8 the retained-heap baseline stops rising after 100 commits.

### F9 — Do not re-sync on the class's echo of the editor's own template

- **Change.** In `TemplateEditor`, remember in a ref the last template emitted through
  `onChangeTemplate`, and skip `updateTemplate` when the incoming prop is that same object
  (`Designer/index.tsx:254-257`). Combined with F5, a resize after an edit no longer re-uuids,
  deselects, scrolls to the top or re-rasterizes.
- **Verification.** Select a field, nudge, resize: the selection survives and there is no
  `toDataURL` call. Not yet measured.

### F10 — *(optional)* Sharper than today at 800%: a viewport detail canvas

- **Change.**
  - Keep one pdf.js page per basePdf alive (destroyed on basePdf change or unmount, see F4).
  - When the zoom exceeds what the base bitmap resolves (about 400% on Retina today), render only the
    **visible rect** into an absolutely positioned `<canvas>` inside the Paper. Render at
    `1.333 × base × zoom × devicePixelRatio`, 200 ms after zoom/scroll stops, and cancel superseded
    renders.
  - Schemas stay above it.
- **Memory** ≈ visible device pixels × 4 B: about 14 MB for a 1067×836 CSS-px canvas area on
  Retina, whatever the zoom.
- **Effect.** 1:1 device pixels at 800%, sharper than today's ≈1.7–2.0× upsampling.
  - The base bitmap stays at scale 8 permanently (§5); F10 only adds a detail layer on top.
  - During scroll, pan or drag the user sees the base bitmap until the detail canvas refreshes,
    which is exactly when fields are being aligned to the background. So it must never be
    blurrier than today.
- **Precondition.** pdf.js must run off the main thread: a real worker (F4's deferred item) or
  OffscreenCanvas.
  - Today pdf.js runs in a main-thread "fake worker": every build logs
    `Warning: Setting up fake worker.`, and the harness saw 0 workers.
  - Without that, each refresh would be a main-thread long task of an estimated 0.1–0.4 s at
    every scroll or zoom settle, bringing back at 800% the freezes that F1–F3 remove.
- **Risk.** Medium: a new rendering path. The render time is an estimate, not measured.
- **Acceptance.** 0 long tasks during scroll and drag at 800%, and a screenshot crop taken during a
  drag at least as sharp as today's.
- **Optional UX backport.** Upstream #1574 (6.1.12) keeps Moveable handles at a constant on-screen
  size at high zoom, which helps 800% detail work *(reported; not checked against the fork)*.

### 4.1 The 800% background: options evaluated against the evidence

| Option | Sharpness at 800% vs today | Memory | Main-thread cost | Verdict |
|---|---|---|---|---|
| A. Keep the scale-8 bitmap, rasterize once (F5) | Same | Same peak, once | Once per basePdf (0.3–1.5 s) | **Do it.** Measured usable once F1–F3 are in: 0 ms frozen at 800%, renderer ≤ 610 MB |
| B. Zoom-aware lazy bitmap, capped at today's scale 8 | Same at 800% (no zoom level worse) | Lower at low zoom | One raster per zoom bucket | Optional, small |
| C. Viewport detail canvas at zoom × DPR (F10), over the unchanged scale-8 bitmap | **Better (1:1)** | +~15–25 MB per visible page | ~0.1–0.4 s per settle (estimate); needs pdf.js off the main thread | Optional, if more sharpness is wanted |
| D. One full-page bitmap at zoom × DPR (scale ≈ 14–16) | 1:1 | ~110–140 MP ≈ 450–550 MB per page | Seconds per raster (extrapolated) | No |
| E. Full-page bitmap capped at 4096² (#1549-style) | **Worse** (A4 ≈ scale 5.8) | Lower | Lower | **No**: blurs 800%; upstream reverted it as ineffective |
| F. Lower maxZoom | — | — | — | **Forbidden** (and measured useless: zoom250 still bloats to 2.36 GB) |

### 4.2 Upgrade vs patch — recommendation

**Patch now; upgrade later, if at all, together with the consumer.**

1. F1–F3 are about 30 lines and were measured to remove the 175 MiB strings and the lag at
   maxZoom 800, with today's background. That this ends the crashes is expected but not yet
   verified (F2).
2. After patching, the fork still lays out and wraps text with the same 5.3.15 code the consumer's
   generator uses. With the same fonts, what the Designer shows is what aio-promo-monitor prints.
   Today the font files match only for euronics ×2 and amazon (§7).
3. Upgrading to 6.2.6 brings RC1, RC2, the pdf.js issues of RC4, the undo cap, the zoom UX work
   (#1574 zoom-invariant handles, debounced render scale) and the security fixes.
   - It does **not** decouple RC3 (scale = maxZoom) or fix the `Root.tsx` FontFaces.
   - It needs the playground re-ported: the fonts, maxZoom 800, Firebase, the signature plugin.
   - It adds the consumer hazards of §3.1: new fields default to `Helvetica` (re-verified to throw
     for EURONICS), 6.x-only properties and colors, and different line breaking.

If you upgrade, treat it as one project with the consumer's generator, both moving to 6.2.6. Keep a
regression check that generates every exported template with the consumer's generator and compares
the rasters; the upstream study's compat harness can be reused, in its per-vendor-font version
(`revise/compat-pervendor/`). Do not upgrade to any 5.x release
to "fix" this: RC1 is still in 5.5.10. Do not adopt the rewritten upstream playground: it is a
different app, with maxZoom 300 and URL fonts.

---

## 5. What NOT to do

- **Do not lower maxZoom, and do not clamp the full-page background below scale 8.**
  - Either blurs or removes the 800% detail work.
  - Lowering the zoom was measured to be beside the point: zoom250 retains and spikes just like
    as-is. A clamp would only shrink the background cost, which is not the crash driver.
  - Upstream's 4096² clamp did not stop the crashes it targeted on iOS and was reverted.
- **Do not add more `Uint8Array` fonts before F1 or F2.** 2× already retains 1.43 GB, 3× 2.14 GB
  (live heap after GC), and 4× crashes. At ~46 MB of fonts `JSON.stringify` would even throw
  `Invalid string length` (V8's maximum string length is ~536.9 M chars).
- **Do not pass fonts as relative URLs** (`'/fonts/x.ttf'`): they are decoded as base64 and the
  fonts break.
- **Do not remove fonts from the Designer to save memory.** It must measure with the same font names
  the consumer registers.
- **Do not count on RAM or flags.** A renderer's V8 heap is capped at ~4 GB however much RAM the Mac
  has, and a web page cannot raise it.
- **Do not hand-edit `packages/*/dist`.** Fix `src`, then rebuild converter → ui → playground.
- **Do not build new memo or effect keys with `JSON.stringify(options)`** or any object that
  contains font data. It is the same trap.
- **Do not upgrade the Designer to 6.x while the consumer stays on 5.3.15 without the regression
  check** (§3.1). Do not adopt the upstream playground.

---

## 6. Contradictions between the study agents, resolved

- **RC3 severity.** The audit called the background raster "critical" (static estimate); the repro
  study called it "partial" (measured).
  - Resolution: the measurement wins. zoom250 shows the same heap and lag pathology, and fontsurl
    is smooth at 800% with the scale-8 bitmap.
  - The raster is a medium cost at open and on resize, not the crash or lag driver.
- **pdf.js documents (RC4).** The repro study said "confirmed", the audit said "partially". Both are
  right:
  - the main-thread fake worker and the FontFace leak are real;
  - the documents themselves are not retained (heap snapshots show no growth of PDF objects).
- **Module caches.** The repro study said "refuted", the audit said "partially". Resolution: they are
  bounded. In UI code paths the only key is `getFontKitFont-<name>`; image and barcode caches are
  per `generate()`. Not a cause.
- **Playground lifecycle.** The repro study said "partially", the audit said "confirmed".
  - The FormAndViewer double build is confirmed by reading `FormAndViewer.tsx:83-88, 126-133`, and
    its symptoms are measured in S7.
  - It is native memory, so it is not a V8 OOM driver. The `?template=` Designer race was not run.
- **Has upstream fixed the crash?** The upstream agent said upstream never identified it and that
  6.2.6 is smooth with stable memory; the audit said RC1 was fixed upstream in `577db47a`. Both are
  true:
  - nobody upstream diagnosed it, and the line was removed in 6.0.0 during a hook cleanup;
  - the 6.2.6 runtime claim covers hover and zoom only.
- **The 🗑️ label.** The repro study listed it as an owner-side amplifier. Correction: it is in the
  vanilla playground too (`git show d1db660:playground/src/routes/Designer.tsx`).
- **Cost per selection.** The audit's 0.85 s and ~270 MB per selection (Node, one-byte strings)
  against the browser's 1.1–2.0 s and 2 × 175 MiB are consistent once the two-byte doubling is
  counted.
- **The owner's statement that vanilla crashed too.** Not resolved; see §7.

## 7. Gaps (what remains unverified)

- **The accumulation behind the 1× crashes.** It was not reproduced, and its retainer is unknown.
  - Real sessions die with 3.1–3.8 GB live: in 40 of 70 crashes within 2 minutes of the renderer's
    start (median 113 s). The harness at 1× never exceeded 0.74 GB live in 15 minutes, and the dumps
    show real sessions crashing even at 4.4–4.9 MB of fonts.
  - The review's reruns (Chrome for Testing 134, as-is, foto_erhardt) did not reproduce it either:
    - 8 select/Esc cycles: 375–379 MB selected, 25–27 MB after Esc;
    - 36 rapid field switches: 553–555 MB;
    - 5 rubber-band selections: 552–555 MB;
    - React DevTools 8.0.0 loaded, then 40 nudges: 557 MB;
    - the Vite dev server with StrictMode, then 40 nudges: 562 MB;
    - property-panel dropdowns: bounded at +0.35–0.7 GB.
  - Untested candidates:
    - DevTools open, with React DevTools (installed in the owner's Profile 4, v8.0.0, and
      Profile 7, v6.0.1);
    - other extensions (the owner's crashed renderer of 2026-10-17 21:43 had 11 native contexts,
      against 5 in the harness);
    - Chrome's V8 field trials, which the harness's fresh profiles most likely lacked;
    - real OS key auto-repeat and sustained typing;
    - several same-site tabs sharing one renderer, and therefore one V8 heap.
  - Hours-long sessions are not needed: 58 of 70 crashes came within 5 minutes of the renderer's
    start.
  - **Decisive test:** in the owner's real profile, take a DevTools heap snapshot after about 2
    minutes of normal work (select fields, edit properties), and count the ~175 MB strings and their
    retainers.
- **Linking the dumps to the webapp.**
  - The 70 OOM dumps since 2026-03-19 are tied to DetailView's `stringify` by their V8 stack keys.
  - The 22 from 2025 carry no stack keys and are linked by signature and date only.
  - URLs were not read, so the build behind each day's dumps is inferred from file timestamps
    (§1.1).
  - 4 other V8 OOMs carry no DetailView frame (at least 3 are probably other tabs); 1 dump has no
    OOM keys and is unexplained.
- **Vanilla-era crashes.** The report that vanilla also crashed was not reproduced: vanilla's
  15-minute peak was 172 MB. Dumps from before 2025-10-23 are pruned, and the fork had only 1.2 MB
  of binary fonts before 2025-10-17. A different, unidentified mechanism in that period cannot be
  ruled out. Some remembered crashes may also be misattributed: the owner's Chrome has V8 OOMs that
  are probably other pages (§1.1).
- **Headless only.** The GPU and compositor cost of 800% under Metal on Retina was not measured.
  The "≈1.7–2.0× upsampled at 800%" figure is computed, assuming a base scale of 0.65–0.75; it was
  not checked visually.
- **The fixes themselves.** None is implemented.
  - F1–F4 were measured through the `fontsurl`, `fix-h2h3` and `fix-h2h3h8` builds (headless,
    foto_erhardt only).
  - F2's dose test (`fix-h2h3h8` + `fonts4x`) was not run, and the owner's accumulation path is
    unknown. So F1–F3 are expected, not shown, to stop the crashes.
  - The review's A/B found F1, F2, F3 and the measured part of F4 output-equivalent on 3 templates.
  - F5–F10 are designs and were not measured. The F10 render cost is an estimate.
- **6.2.6.** It was never exercised with a selected field. Template compatibility was tested by
  simulating the 6.2.6 load/save in Node, not with a real 6.2.6 edit-and-save session.
- **Templates.** Only foto_erhardt was measured for performance. The review's equivalence A/B also
  covered thomann and euronics; the other 8 templates were not run.
- **Untested paths.** The Templates-gallery `?template=` double build. Orphan instances were inferred
  from FontFace counts, render counts and page errors. The +16–23 MB of native growth per Generate
  PDF was not attributed.
- **Concurrency.** Up to 5–6 headless browsers ran at once, so absolute milliseconds are inflated.
  The ratios (50–1000×) are robust.
- **Side note on fidelity, not memory.** The Designer previews with the same font files as
  production only for euronics ×2 and amazon (Arial, ArialBold). Seven of the 11 templates use
  Helvetica. There are three mismatches:
  - **MEDIAWORLD and UNIEURO (6 templates).** `loadPdfFont` returns `undefined`
    (`asset-loader.ts:68`), so the consumer generates with no font map.
    - npm 5.3.15 then skips `checkFont` and measures and wraps with Roboto (`getDefaultFont`).
    - It draws with pdf-lib's non-embedded standard Helvetica (pdffonts:
      `Helvetica Type 1 WinAnsi emb=no`).
    - The Designer previews these templates with the fork's `helvetica.ttf`.
  - **foto_erhardt.** The consumer's `Helvetica`/`HelveticaBold` files are byte-identical to the
    playground's `helvetica-font.ttf`/`helvetica-font-bold.ttf`, not to the `helvetica.ttf`/
    `helvetica-bold.ttf` that the Designer loads under those names.
  - **thomann.** The consumer maps `OpenSansMedium` to the Bold file.

  Preview metrics can therefore differ from production PDFs. The font names, and so the contract,
  still match.

## 8. Raw data and how to re-run

These scratch paths are temporary and may disappear with the session. Root:
`/private/tmp/claude-501/-Users-matteobrogin-Documents-developer-personal-projects-aio-pdfme/daabdcc4-7eac-4eca-8464-a2841af585f3/scratchpad/`.

- **Repro harness:** `repro/harness/` (`README.md`, `run.cjs`, `heapsummary.py`, `summarize.py`,
  `tracegc.py`).
  - Aggregate table: `repro/data/summary.csv`. Heap diff: `repro/data/heapdiff-s8-as-is.json`
    (snapshots in `repro/data/runs/s8-as-is/`).
  - Crash run: `repro/data/runs/iso-fonts4x/` (`CRASH-NOTE.json`, `chrome-stderr.log`).
  - Builds: `repro/builds/<variant>`; patched packages: `repro/work/pkgs/`.
- **Synthesis re-check:** `synthesis/runs/verify-as-is`, `synthesis/runs/verify-fix`.
- **Upstream:** clone `upstream/pdfme`, harness results `upstream/harness/results/`, GitHub data
  `upstream/gh/`, template compatibility `upstream/compat/`.
- **Audit benchmarks:** `audit/bench_options.log`, `audit/bench_commit.log`, `audit/scripts/`.
- **Review:**
  - `verify-causality/`: the crash-key scripts (`oomkeys.py`, `gclines.py`, `rawkeys.py`,
    `stackfreq.py`, `stackwl.py`) and the retention reruns (`runs/`, `runs-dev/`);
  - `verify-safety/`: the A/B (`ab.cjs`, `runs/`) and the blob test (`blobtest/`);
  - `revise/`: the revision's re-runs (`*-mine.txt`, `scripts/stackshape.py`,
    `scripts/uptime_exact.py`, `compat-pervendor/`, `blobtest/`).
- **Re-run a check:**
  `cd repro/harness && node run.cjs --build <build> --port 5310 --template ../data/templates/inline/foto_erhardt.json --scenario SEL,S9 --iterations 2 --browser chrome134`.
  Use `chrome134` (Chrome for Testing): the system Chrome shares the default Crashpad folder and
  starts GoogleUpdater's crash handler.

**Side effect of the study.** The reproduced crash added one dump to the owner's Crashpad folder
(`17b0bca6-d3b5-4dfe-9723-cf20d427a036.dmp`, 2026-10-17 23:06). It was left in place.

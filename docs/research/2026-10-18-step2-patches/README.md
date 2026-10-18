# Step-2 patches: Designer crash follow-up (2026-10-18)

Copies of the step-2 patches, moved out of the session's temporary scratch directory so that they survive it.
**None of them is applied.** Step 1 (F1–F3 plus the React DevTools opt-out) is committed as `bc442b2` and live.

- Measurements and decisions behind each patch: [`../2026-10-18-step2-fixes-and-studies.md`](../2026-10-18-step2-fixes-and-studies.md)
  (§1 what each fix does, §5 how to apply, §9 decisions, §12 review fixes and re-verification).
- Root cause: [`../2026-10-17-designer-crash-study.md`](../2026-10-17-designer-crash-study.md).
- Session state, open decisions, deploy commands: [`../../superpowers/HANDOFF-2026-10-18-designer-crash-fix.md`](../../superpowers/HANDOFF-2026-10-18-designer-crash-fix.md).

All files are unified diffs with `a/` and `b/` prefixes. Apply them from the repository root with `patch -p1`
(`git apply` works too). Base: HEAD `638c491`, i.e. step 1 (`bc442b2`) plus the docs commit. Each file is
byte-identical to the scratch file of the same name that the step-2 doc cites (sha256 below).

## Files

| File | Status | What it does | Applies on | Lines, files | sha256 (first 16) |
|---|---|---|---|---|---|
| `step2-combined.patch` | **final**: the one to apply | F4 pdf.js hygiene (`destroy`, `page.cleanup()`, canvas released, `isEvalSupported: false`). F5 background rasterized once per basePdf, shown through a `blob:` URL, request-id guard. F7 one shared FontFace per font. F8 undo capped at 100. F9 no re-sync on the class's echo of the editor's own template. F6 exactly one instance per page: cancellation, destroy-before-create, `?template=` read once with a gallery → saved → blank fallback, invalid saved Form inputs dropped, the last 10 Generate-PDF URLs kept alive, pending resize cleared on `destroy()`. F11 Firebase SPA rewrite. | `638c491` | +449 −159, 12 files | `c76f1f7d4a58a881` |
| `step2-error-reset-optional.patch` | optional, recommended, needs the owner's OK | One `setError(null)` after a successful init in `hooks.ts`: a good Load Template or Change BasePDF leaves the error screen (as upstream `577db47a`). | 1 | +2 −0, 1 file | `62ee70b1fb9541ac` |
| `step2-undo-emit-optional.patch` | optional, recommended, needs the owner's OK | Undo/redo emit the template, so Save Local, DL Template and Generate PDF after Ctrl+Z use what the editor shows. Removes the `TODO(undo-emit)` marker. | 1 | +12 −5, 2 files | `e303910a3e2f54ea` |
| `step2-life-optional-f6b-generator-font-bytes.patch` | optional, **not recommended** | Generate PDF gets the font bytes, fetched once per page. Flattens the ~14 MB per generate renderer growth, at a 115–234 ms freeze per generate and 7.9 MB kept in memory *(reported)*. | 1 | +23 −1, 1 file | `a82c387c75ed59a1` |
| `f10-prototype.patch` | prototype, a separate project | F10: above ~450% zoom, a canvas over the visible part of the page rendered by pdf.js in a real worker, on top of the unchanged scale-8 bitmap; about 1.8× sharper text at 800% (doc §6). | 1 (offsets only) | +483 −0, 9 files (4 new) | `da38352381b449f8` |
| `step2-core-dataurl-alt.patch` | alternative, reference only | The step2-core half (F4, F5, F8, F9) with the background as a `data:` URL instead of a `blob:` URL. Of the 6 files it touches, only `packages/ui/src/hooks.ts` differs from the final patch. | `638c491` alone, **not** on top of 1 | +168 −68, 6 files | `a18cebaf7e89cf28` |

Line counts are `+`/`-` lines of each diff. The step-2 doc §6 gives +459 for F10; counted here the same way as the
other rows, it is +483.

Not included:

- `step2-rdt-optout-optional.patch` (React DevTools opt-out, 3 lines in `playground/index.html`): already in `bc442b2`.
  A forward dry run reports "Reversed (or previously applied) patch detected"; a reverse dry run passes.
- The combined patch as first reviewed (`step2-int/step2-combined.patch`) and the two halves as delivered
  (`step2-core.patch`, `step2-life.patch`): superseded by `step2-combined.patch`.
- Harness, builds and evidence stay in scratch and may disappear with it. The screenshots, crops and generated PDFs
  there contain the owner's real invoice data: never copy them into this public repository.

## Apply order and commands

From the repository root, after checking with `git status` that none of the patched files has changed:

```bash
D=docs/research/2026-10-18-step2-patches

# 1. Final patch (required)
patch -p1 --dry-run < $D/step2-combined.patch && patch -p1 < $D/step2-combined.patch

# 2. Optional add-ons, each only with its own OK. 2a and 2b work in either order, with the same result.
patch -p1 --dry-run < $D/step2-error-reset-optional.patch && patch -p1 < $D/step2-error-reset-optional.patch   # 2a
patch -p1 --dry-run < $D/step2-undo-emit-optional.patch && patch -p1 < $D/step2-undo-emit-optional.patch       # 2b
# 2c, not recommended: step2-life-optional-f6b-generator-font-bytes.patch, same commands

# 3. F10, only as its own project, on top of 1 (and 2a/2b/2c if applied)
patch -p1 --dry-run < $D/f10-prototype.patch
```

Data-URL variant instead of the blob URL (decision 2 in the step-2 doc §9), on a clean `638c491`:

```bash
patch -p1 < $D/step2-core-dataurl-alt.patch
git apply --include='packages/ui/src/class.ts' --include='packages/ui/src/components/Root.tsx' \
  --include='playground/*' $D/step2-combined.patch
```

This gives the final patch's 12 files with only `hooks.ts` replaced by the data-URL version (checked file by file
on a scratch copy). That combination was never built or measured.

After applying: rebuild `packages/converter` first, then `packages/ui` (`npm run build` in each; never the root
`npm run build`, which deletes every `dist`; no `npm install`). Run the ui and converter Jest suites under Node 22,
check in a browser, then deploy. The exact steps are in §5 of the handoff.

## Dry-run results (2026-10-18, 18:42–18:56)

Taken on a scratch copy of the 659 tracked files of the working tree (HEAD `638c491`; only the step-2 doc modified)
with GNU patch 2.7.6 (`/opt/homebrew/bin/patch`). The single-patch dry runs (1 on the working tree; 2a, 2b, 2c and
F10 on 1; the data-URL patch on the working tree) also exit 0 with macOS `/usr/bin/patch` (2.0-12u11-Apple), and 1,
2a, 2b, 2c and F10 also pass `git apply --check`. Re-run at 18:55 with the copies in this folder: same results.

| Patch | Applied on | Result |
|---|---|---|
| `step2-combined.patch` | the working tree | exit 0, no fuzz, no offset; the 12 files come out byte-identical to the tree verified in the review-fix run |
| `step2-error-reset-optional.patch` | 1 | exit 0, clean |
| `step2-undo-emit-optional.patch` | 1 | exit 0, clean; after 2a its `hooks.ts` hunk lands at offset 2, no fuzz |
| 2a then 2b, against 2b then 2a | 1 | identical `hooks.ts` and `Designer/index.tsx` |
| `step2-life-optional-f6b-generator-font-bytes.patch` | 1, and 1 + 2a + 2b | exit 0, clean |
| `f10-prototype.patch` | 1 | exit 0; 4 hunks of `Designer/index.tsx` at offsets 5/5/27/30, no fuzz |
| `f10-prototype.patch` | 1 + 2a + 2b, with or without 2c | exit 0; offsets 5/5/24/37, no fuzz |
| `step2-core-dataurl-alt.patch` | the working tree | exit 0, clean. On top of 1 it fails, as expected (it replaces part of 1) |
| Data-URL recipe above | the working tree | exit 0; then 2a, 2b, 2c and F10, each dry-run on its own: exit 0 |
| `step2-rdt-optout-optional.patch` (not included) | the working tree | already applied (`bc442b2`) |

If any patched file changes before you apply, run the dry run again.

## Verification status

- `step2-combined.patch`: verified on scratch builds (step-2 doc §12.4). On the 11 templates: 55/55 screenshots,
  33/33 saved JSONs and 11/11 generated PDFs identical to step 1. `?template=` probe 41/41. ui Jest 25/25 with 3/3
  snapshots, converter 17/17, tsc clean, ESLint 0 new problems. A Fable line-by-line review of the final diff:
  approve-with-nits, with one low finding (see below).
- Error reset: verified on one scenario (§12.3). Undo emit: measured by its author on its own base, 3/3 consistent
  *(reported)*; never built on top of the final patch. F6b: regenerated for the final `helper.ts`, never built on it.
  F10: measured on its own (§6), never together with step 2. Data-URL variant: measured by its author on its own
  *(reported)*, never with the review fixes.

## Data check

The patches are code and comments only. Checked by script (in scratch): no e-mail address, IBAN-like string,
number of 9 or more digits, base64 run of 80+ characters, `data:` URI or postal-address word. None of the 425 string
tokens of the 11 owner templates (basePdf excluded) and none of the 430 text tokens of their base PDFs occurs in any
patch, apart from code words (`Helvetica`, `SegoeUI`, and substrings of `boolean`, `observe` and `generator`).

## Known gaps of the final patch

- F4's `isEvalSupported: false` is only in `packages/converter/src/index.browser.ts`. The Node entry
  (`index.node.ts:15` and `:30`) still opens PDFs with pdf.js's default. The playground's thumbnail script uses that
  entry at build time (`playground/scripts/generate-templates-thumbnail.mjs:6, 91`). LOW and not a regression; found
  by the Fable review, not fixed here. Proposed follow-up: `pdfjsLib.getDocument({ data: pdf, isEvalSupported: false })`
  at both sites, then the converter Jest suite.
- `packages/ui` and `packages/converter` now diverge from upstream: a future upgrade will conflict in `hooks.ts`,
  `Designer/index.tsx`, `Root.tsx`, `class.ts` and `pdf2img.ts`.

# Airis dark-theme artwork

## Objective and scope
Redraw the Airis empty-state artwork so it belongs to the dark theme and carries the Bridge "A" logo through the dress, and keep the approved character design in the repository as a reference. Scope: the three shipped assets (`today.webp`, `editor-library.webp`, `catalog.webp`) and a character reference under `docs/design/airis/`. Out of scope: new assets (`season`, `history`), empty-state copy/actions per screen, the Selection `Confirmed 12/31/1969` bug, CSS glow on the artwork.

## Constraints and approach
- Branch: `feat/airis-dark-artwork` (from `dev`).
- Asset contract (`frontend/scripts/check-airis-assets.mjs`): WebP, exactly 512x512, at least one transparent pixel. Verified with `bun --cwd="frontend" run check:airis-assets`.
- Generation: Pi `codex_generate_image` with native transparency (prompt asks for a transparent background, PNG output); no local chroma-key removal (it greyed the cyan glows). Every prompt states the canon and the clean anime cel-shading style, because chained edits accumulate painterly texture.
- Approved canon (user-reviewed): two-layer dress whose front opening draws the logo "A"; concave waist band anchors it; one high-low inner skirt on a hidden tulle petticoat; stiffened overskirt hem curling to a blue starry lining; slim bare legs; low block-heel Mary Janes; feather clip on her left side only; long white opera gloves.
- TDD: not applicable — binary artwork and passive documentation have no meaningful RED. Verification is the asset gate, visual inspection on dark and light surfaces, and the repository pre-commit gate.

## Tasks
- [ ] ADA-1 — Add the Airis character reference (turnaround sheet + canon document) under `docs/design/airis/`. Route: inline (documentation + one image). Acceptance: sheet committed as WebP, canon document lists design rules and generation lessons. Checks: pre-commit gate.
- [ ] ADA-2 — Regenerate the three empty-state assets in the approved design, keeping each screen's theme (Today: calendar/plus/clock; Editor Library: covers/shelf; Catalog: magnifier/book/genre tiles). Route: inline generation + delegated verification. Acceptance: three 512x512 transparent WebP files pass `check:airis-assets`, read at 160 px and 40 px on dark and light surfaces, no grey/purple glow, no painterly hair texture. Checks: `check:airis-assets`, its Vitest suite, delegated verify, pre-commit gate.

## Progress and evidence
- Exploration: current assets are 512x512 `yuva420p` WebP; the gate checks codec, dimensions and transparency only. Design iterations live outside the repo in `%TEMP%/airis-preview/` (`n3-slim.png` base, `airis-turnaround-v2.png` sheet).

## Next step
ADA-1.

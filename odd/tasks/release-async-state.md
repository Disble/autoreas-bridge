# Release — async-state standard and Catalog default
Publish the approved contents of dev using the repository's main/tag/CI release path.
Status: preparing; version pending release-scope compatibility check.

## Specs
1. **S1** — "revisado en dev, aprobado y puedes saccar release de todo esto"
2. **S2** — "perfecto, un cambio pequeño, puedes ponerme en Catalogo section que se ordene por defecto por Last watched?"

## Tasks
- T1 | S1 S2 | inline | in_progress | Preserve the approved Catalog change, choose the release version from actual changes, update version/changelog/learning log and regenerate the installer include. Commit: pending.
- T2 | S1 S2 | independent verify | pending | Verify release metadata, Catalog checks and real Windows build; run normal repository hooks. Commit: pending.
- T3 | S1 | inline | pending | Merge dev into main, push branches, tag main and publish through the Release workflow. Commit/tag/run: pending.
- T4 | S1 | inline | pending | Read back published release assets/guards and record completion or concrete blockers. Evidence: pending.

## Log
- L1 — Original request: "revisado en dev, aprobado y puedes saccar release de todo esto"
- L2 — Catalog change is approved and independently verified (101 Catalog tests, typecheck, focused ESLint; no commit yet). Starting dev is 9c6c08a8; current released version is 2.8.0. User authorized publication of all changes, not merely a local build. Published tags must not be moved. No secrets may be read or exposed.

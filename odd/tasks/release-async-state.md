# Release — async-state standard and Catalog default
Publish the approved contents of dev using the repository's main/tag/CI release path.
Status: preparing 2.9.0; minor release, no breaking REST/WS/DB/config change found.

## Specs
1. **S1** — "revisado en dev, aprobado y puedes saccar release de todo esto"
2. **S2** — "perfecto, un cambio pequeño, puedes ponerme en Catalogo section que se ordene por defecto por Last watched?"

## Tasks
- T1 | S1 S2 | inline | done | Catalog committed (4bbccc59, all frontend hooks green); version 2.9.0, changelog and learning log prepared; real Windows/NSIS build passed and generated installer include matches 2.9.0. Release metadata is committed with T2 after verification.
- T2 | S1 S2 | independent verify | in_progress | Independent verifier mwjgnujq-3-h3g6 PASS: 101 Catalog tests, typecheck, render smoke and staged diff checks exit 0; matching 2.9.0 NSIS and real Windows installer. Native ASSESS risk item 5 requires independent verify (satisfied), reviewDue=false. Release metadata commit and hooks pending.
- T3 | S1 | inline | pending | Merge dev into main, push branches, tag main and publish through the Release workflow. Commit/tag/run: pending.
- T4 | S1 | inline | pending | Read back published release assets/guards and record completion or concrete blockers. Evidence: pending.

## Log
- L1 — Original request: "revisado en dev, aprobado y puedes saccar release de todo esto"
- L2 — Catalog change is approved and independently verified (101 Catalog tests, typecheck, focused ESLint), committed as 4bbccc59 with all frontend hooks green. Starting dev was 9c6c08a8; currently published version is 2.8.0. User authorized publication of all changes, not merely a local build. Published tags must not be moved. No secrets may be read or exposed.
- L3 — Actual git history/OpenAPI diff since v2.8.0 shows additive presence_unanswered hourly-summary support; version 2.9.0 selected. The explorer lacked git and its initial unchanged-wire claim was corrected from that diff.
- L4 — First local build failed when -clean attempted to delete running build/bin/autoreas-bridge-dev.exe (Access is denied). No process was stopped. Building without -clean succeeded with the same compilation/NSIS checks and preserved the running app. Generated INFO_PRODUCTVERSION and build ldflags are 2.9.0, CGO_ENABLED=1. Logs: .git/agent-release/windows-build.log and windows-build-preserve-dev.log. Installer interaction/tray checks remain unverified.
- L5 — Independent release verification PASS. CI must still prove that the version -X symbol resolves (TestBridgeVersionIsStampable), validate tray build wiring, build Linux and publish assets. No binaries are staged. The inspected release workflows retain these guards.

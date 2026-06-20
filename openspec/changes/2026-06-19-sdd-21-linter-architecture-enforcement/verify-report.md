# Verify Report — linter-architecture-enforcement

### Verdict

PASS

Verification performed directly by the orchestrating agent (per AGENTS.md rule 3), 2026-06-19.

## Gate battery (clean tree)

| Check | Command | Result |
|-------|---------|--------|
| Frontend lint | `bun --cwd=frontend run lint` | PASS (0 errors; 16 advisory warnings) |
| Frontend typecheck | `bun --cwd=frontend run typecheck` | PASS |
| gofmt | `go run ./tools/checkgofmt` | PASS |
| golangci-lint (depguard) | `golangci-lint run` | PASS |
| go vet | `go vet ./...` | PASS |
| go build | `go build ./...` | PASS |
| Frontend tests | `bun --cwd=frontend run test` | PASS (55/55) |

## Behavioral verification (negative probes — rules must BITE, not just pass on clean code)

| Probe | Setup | Expected | Result |
|-------|-------|----------|--------|
| A — Go domain purity | `internal/anime/domain/zzprobe.go` imports `net/http` | golangci-lint fails with `domain-purity` depguard message | BITES ✓ |
| B — Frontend dumb-UI | feature `.tsx` calls `useEffect` | `bun run lint` fails with "Dumb UI Rule" | BITES ✓ |

Both probes removed afterward; clean tree confirmed green again.

## Spec coverage

All 10 requirements / 26 scenarios in `specs/architecture-enforcement/spec.md` are satisfied by the shipped configuration:
- Frontend (R1–R6): dumb-UI purity, hook anatomy, strict colocation, type contracts, public JSDoc, transversal hygiene + typecheck gate — enforced by `frontend/eslint.config.js` + `frontend/eslint/architecture-rules.js`, probe B confirms the MUST-fail direction.
- Backend (R7–R9): domain purity, ports isolation, transport confinement — enforced by `.golangci.yml` depguard, probe A confirms the MUST-fail direction.
- Gate (R10): `lefthook.yml` runs frontend-lint, frontend-typecheck, golangci-lint pre-commit.

## Notes / accepted risks

- **Load-bearing**: `frontend-typecheck` in `lefthook.yml` — `no-undef` is delegated to `tsc`; removing the job would silently lose undefined-symbol detection (design D4).
- **Recorded drift (code wins as runtime truth)**: `internal/anime/domain/state_machine.go` imports `internal/api/contracts` (backwards for pure hexagonal). Documented, not enforced against; deferred to a future change (design D9).
- **Advisory only**: sonarjs + react-doctor run at `warn`; `doctor:react` intentionally excluded from the gate (advisory + network-dependent).

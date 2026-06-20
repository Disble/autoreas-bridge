# Proposal: Deterministic Linter-Enforced Architecture Constraints

> Retroactive proposal. The change is ALREADY IMPLEMENTED, VERIFIED, and green. This documents reality to satisfy the sdd-gate.

## Intent

Architecture constraints (Dumb-UI, Hook Anatomy, colocation, domain purity, transport confinement) were prose-only in `AGENTS.md`/`ARCHITECTURE.md` and therefore non-enforceable — they drifted silently. Make them DETERMINISTIC: enforced by linters wired into the lefthook pre-commit gate. User norm: "guidelines must be deterministic via linters first, transversal by default." Rules ported from sibling `ollama-telemetry`, itself an adaptation of `autoreas-mobile` standards (same family).

## Scope

### In Scope
- Frontend ESLint v8 legacy → v9 flat config; codify architecture rules as a rules module.
- Backend golangci-lint `depguard` boundary rules (domain purity, ports-vs-adapters, Wails confinement).
- Wire `frontend-typecheck` into the lefthook gate (no-undef is delegated to `tsc`).
- Document deterministic enforcement in `ARCHITECTURE.md` section 10.
- Make existing `frontend/src/features/dashboard/**` green under the new rules.

### Out of Scope
- Fixing recorded drift `internal/anime/domain → internal/api/contracts` (left as-is, documented).
- `doctor:react` in the gate (advisory + network-dependent — kept as a manual script).
- Any runtime/behavior change. These are build-time guards only.

## Capabilities

### New Capabilities
None — no runtime behavior introduced; this is a build-time governance change.

### Modified Capabilities
None at the spec level. Pure tooling/config + docs change.

## Approach

- FRONTEND: remove `.eslintrc.cjs`; add `eslint.config.js` (flat) + `eslint/architecture-rules.js` + `eslint/README.md`. Plugins (bun): eslint@9, @eslint/js, eslint-import-resolver-typescript, eslint-plugin-check-file, eslint-plugin-import-x, eslint-plugin-react-doctor, eslint-plugin-sonarjs; keep eslint-plugin-react-hooks. Enforce: Dumb-UI (no useEffect/useLayoutEffect, no Wails bindings in feature `.tsx`), Hook Anatomy (useMemo→useCallback→useEffect order, hook ends with return), strict colocation (no inline interfaces/types/consts/helpers/Zod in views & hooks, tests in `__tests__/`, kebab-case folders via check-file), `Readonly<Props>` boundary, JSDoc on exported hooks/types/constants/schemas/helpers, 500-line max. Transversal: import-x/no-cycle, sonarjs (warn), react-doctor (warn). Decisions: `no-undef` OFF (delegated to tsc); `@typescript-eslint/no-unused-vars` (TS-aware). New scripts: typecheck, validate, doctor:react.
- BACKEND: `.golangci.yml` enables `depguard` with 3 boundary rules — verified to actually fail via a negative probe.
- GATE: add `frontend-typecheck` job so `tsc` runs (compensates `no-undef` off).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/.eslintrc.cjs` | Removed | Legacy v8 config |
| `frontend/eslint.config.js`, `frontend/eslint/**` | New | Flat config + rules module + README |
| `frontend/package.json` | Modified | New plugins + typecheck/validate/doctor:react scripts |
| `frontend/src/features/dashboard/**` | Modified | Real JSDoc + 2 unused-var fixes to go green |
| `.golangci.yml` | Modified | depguard boundary rules |
| `lefthook.yml` | Modified | Added `frontend-typecheck` job |
| `ARCHITECTURE.md` | Modified | Section 10 rewritten for deterministic enforcement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `no-undef` off lets undefined symbols slip | Medium | `frontend-typecheck` (tsc) in the gate |
| Flat-config migration breaks lint locally | Low | Verified green; README documents setup |
| depguard false negatives on layering | Low | Negative probe confirmed rules fail on violation |
| sonarjs/react-doctor noise blocks commits | Low | Configured as advisory `warn`, not error |

## Rollback Plan

Revert the 4 config/doc files; restore `.eslintrc.cjs` from git; remove the `frontend-typecheck` job from `lefthook.yml` and the `depguard` block from `.golangci.yml`. Dashboard JSDoc edits are harmless and may stay. No runtime/behavior impact — guards are build-time only.

## Dependencies

- bun for frontend dependency install.
- golangci-lint already available in the gate.

## Recorded Drift (code wins as runtime truth)

`internal/anime/domain` imports `internal/api/contracts` (domain→api is backwards for pure hexagonal). NOT broken, NOT enforced against — left as-is and documented. Out of scope for this change.

## Success Criteria

- [x] Frontend `lint` + `typecheck` green under v9 flat config.
- [x] `golangci-lint run` green with depguard; negative probe confirms it fails on violation.
- [x] `lefthook` pre-commit gate runs frontend-typecheck + golangci-lint.
- [x] `ARCHITECTURE.md` section 10 documents the deterministic enforcement.

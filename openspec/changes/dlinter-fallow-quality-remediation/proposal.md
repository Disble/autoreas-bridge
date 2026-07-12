# Proposal: Dlinter Fallow Quality Remediation

## Intent

Plan a factual frontend quality remediation that clears upgraded `dlinter-ts-react` lint debt and Fallow duplication/dead-code findings without weakening architecture rules or hiding debt.

## Scope

### In Scope
- Remove the current `bun --cwd="frontend" run lint` baseline of **64 errors** through root-cause fixes that preserve dumb UI, hook anatomy, colocation, readonly props, helper JSDoc, and file-size limits.
- Remediate Fallow with command-scoped evidence: changed-code audit baseline **10 unused exports / 2 dev-dependencies-in-production / 6 duplicate clone groups** and full semantic duplication baseline **19.98% / 26 clone groups**.
- Use tests plus `fallow ... --trace` or `--trace-dependency` evidence before deleting exports/files or changing retention config.

### Out of Scope
- Editing generated `frontend/wailsjs/**`.
- Broad ignores, broad baselines, rule weakening, or deletion of valid guards, schemas, barrels, tests, or unfinished unrelated work.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `frontend`: strengthen the frontend quality contract so remediation is verified by canonical lint, Fallow changed-code audit evidence, semantic duplication evidence, and trace-backed dead-code retention decisions.

## Approach

1. Fix deterministic lint clusters first: async handler wrappers, unnecessary assertions, nested-condition/helper cleanup, regex/sort/test hygiene.
2. Triage dead code with trace evidence only; remove confirmed-unused exports first and retain intentional files through precise verified config when a real false positive exists.
3. Reduce duplication by extracting shared shapes or dumb primitives only where ownership is clear and frontend architectural rules remain intact.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/features/**` | Modified | Lint fixes, trace-backed deletions, duplication refactors |
| `frontend/src/infrastructure/*-source/**` | Modified | Wails adapter assertion cleanup |
| `frontend/src/shared/contracts/**` | Modified | Shared type consolidation where ownership is already shared |
| `frontend/.fallowrc.json` | Modified | Narrow, justified false-positive retention only if trace evidence demands it |
| `openspec/specs/frontend/spec.md` | Modified | Canonical quality-verification contract |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scoped metrics get mixed | Med | Name exact command beside every claim |
| Fallow false positives delete intentional files | High | Require trace evidence before removal |
| Refactors leak logic into `.tsx` | Med | Keep async/data logic in hooks/helpers with tests first |

## Rollback Plan

Revert the remediation slice, restore any narrowly changed retention config, and re-run the canonical commands to confirm the repo returns to the pre-change measured baselines.

## Dependencies

- `dlinter-ts-react` policy remains authoritative.
- Bun frontend scripts for lint and Fallow JSON reporting.

## Success Criteria

- [ ] `bun --cwd="frontend" run lint` reports zero errors.
- [ ] `bun --cwd="frontend" run fallow audit --quiet` and `--format json --quiet` show the targeted changed-code issues resolved without config broadening.
- [ ] `bun --cwd="frontend" run fallow dupes --format json --quiet --mode semantic` shows duplication reduced through real refactors.
- [ ] Every deletion or retention decision has test and trace evidence.

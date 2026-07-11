# Proposal: Frontend Global Declaration Governance

## Intent

Revise the active lint-governance change so the contract matches the user-confirmed frontend standards: maintained source is governed globally, generated `wailsjs/**` is the narrow documentation exception, split modules live behind folder entrypoints, and fixtures prove every rejection and exception.

## Scope

### In Scope
- Define global rules for maintained frontend declarations under `frontend/src/**`.
- Require folder-owned split modules with pure `index.ts` public entrypoints.
- Define declaration ownership for `*.types.ts`, `*.constants.ts`, `*.helpers.ts`, and main UI/hook/adapter/delivery modules.
- Expand the fixture matrix to cover accepted, rejected, harness-only, and generated-exception cases.
- Identify which policies use stock ESLint selectors and which need custom repo support.

### Out of Scope
- Implementing lint/config/code changes in this phase.
- Backend lint-policy expansion.
- Runtime behavior changes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `architecture-enforcement`: enforce global frontend declaration governance, pure barrel entrypoints, ownership-by-file-role, global JSDoc coverage, harness-only invalid fixtures, and the generated `wailsjs/**` documentation carve-out.

## Approach

Use `frontend/src/**` as the maintained-surface default. Public declarations MUST carry JSDoc. `wailsjs/**` stays excluded as generated code. A split module that uses `*.helpers.ts`, `*.types.ts`, or `*.constants.ts` MUST live in its own folder with an `index.ts` barrel that contains re-exports only. `*.types.ts` owns interfaces/types, `*.constants.ts` owns constants, `*.helpers.ts` owns helper functions, and main UI/hook/adapter/delivery files own only their named main function. The final topology removes all six migrated infrastructure adapter flat facades, leaves no compatibility shims, and leaves no production allowlist entries behind. Stock ESLint selectors can enforce most declaration and JSDoc rules. Pure-barrel validation, sibling-file ownership, and the fixture rejection catalog need custom plugin or harness/script support.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/eslint.config.js` | Modified | Global maintained-surface scope and generated-code exception |
| `frontend/eslint/architecture-rules.js` | Modified | Ownership, barrel, and declaration-governance selectors/helpers |
| `frontend/eslint/__tests__/**`, `__fixtures__/**` | Modified | Fixture matrix for valid, invalid, exempt, and harness-only paths |
| `frontend/eslint/README.md`, `docs/architecture.md` | Modified | Document rule ownership, pure barrel contract, and exception matrix |
| `openspec/changes/.../*` | Modified | Align proposal/spec/design/tasks/verify with stacked review plan |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Pure barrels become a loophole | Medium | Restrict to re-export-only `index.ts` files and fixture-test every edge |
| Folder-ownership checks exceed stock ESLint power | High | Plan custom rule or repo-owned validation script explicitly |
| Global coverage exposes latent debt | Medium | Keep delivery as `stacked-to-main` with fixture/policy slice first |

## Rollback Plan

Restore the previous proposal contract, drop the folder-ownership expansion, and keep the earlier narrower documentation wording. No runtime rollback is needed.

## Dependencies

- `openspec/changes/2026-06-19-sdd-21-linter-architecture-enforcement/exploration.md`
- `openspec/changes/2026-06-19-sdd-21-linter-architecture-enforcement/specs/architecture-enforcement/spec.md`

## Success Criteria

- [ ] Artifacts describe global frontend governance and the generated `wailsjs/**` exception consistently.
- [ ] The proposal names the pure `index.ts` barrel rule and declaration ownership rules explicitly.
- [ ] The fixture matrix covers green, red, exempt, and harness-only cases.
- [ ] Custom-support policies are separated clearly from stock-selector enforcement.

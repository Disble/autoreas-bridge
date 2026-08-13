# Frontend architecture enforcement

Architecture governance for this frontend is **react-doctor**, invoked by
`dharness check` and configured in `frontend/doctor.config.json`.

Six rules from `dharness-eslint-plugin` (`require-jsdoc`,
`require-variable-jsdoc`, `max-file-lines`, `role-file-shape`,
`folder-ownership`, `pure-index-barrel`) reach the code through the
`// dharness:eslint-layer` region that `dharness sync` splices into
`eslint.config.js`, so they run inside the `frontend-lint` job.

> **Do not misread the sync output.** `dharness sync` lists those six under
> "residue" because they do not fire under react-doctor's `--staged` pass.
> That is true and does **not** mean they are off — they fire through ESLint.
> Measured 2026-08-11: 30 `require-jsdoc` / `require-variable-jsdoc` errors on
> pre-existing code. Note the plugin is stricter than `CLAUDE.md`, which asks
> for JSDoc on every **exported** helper; the rule also wants it on private
> declarations at the top of a file.

`frontend/eslint.config.js` is deliberately small. It carries only the rules
this repository decided for itself and no external preset knows about:

| Rule | Why it is local |
|---|---|
| `max-lines` (500) | The hard-fail half of the shared file-size policy. `tools/checkgofilesize/repository_policy_test.go` asserts the exact line. |
| `no-restricted-imports` on `**/index` | ADR-011. The only automated barrel signal left in the repo. |
| `no-restricted-syntax` (Vitest) | Mock hygiene and per-test timeout bans, proposed upstream and never adopted. |

The `react-doctor` plugin is registered there but its rules stay **off**: the
CLI pass is the governance run, and enabling the same rules in the
`frontend-lint` job would pay for them twice. Registration is still required so
that `// eslint-disable-next-line react-doctor/...` comments in the source
resolve instead of erroring.

## History — and two things this file used to get wrong

Until 2026-08-11 governance came from the `dlinter-ts-react` preset, which
bundled typescript-eslint, react, react-hooks, sonarjs, jsdoc, import-x,
check-file and `eslint-plugin-react-doctor` behind one
`createRecommendedConfig()` call. It was removed in favour of react-doctor
alone; `eslint-plugin-react-doctor` is now a direct devDependency rather than a
transitive one.

Two claims in the previous version of this file were already false when it was
deleted, and are worth naming so they are not restored from memory:

1. **"Their public surface flows through a pure re-export `index.ts`."** ADR-011
   removed all 67 barrels in July 2026. There are no barrels here. See
   `docs/adr/011-no-barrel-files.md`.
2. **"Gated by lefthook before any commit lands."** True for the hard-fail path
   only. `dharness check` runs react-doctor over the **staged change**, so a
   violation sitting in a file the commit does not touch is not re-evaluated.

## Commands

```bash
bun --cwd="frontend" run lint          # the small local pass
bun --cwd="frontend" run doctor:react  # the react-doctor governance pass
bun --cwd="frontend" run validate      # lint + typecheck
```

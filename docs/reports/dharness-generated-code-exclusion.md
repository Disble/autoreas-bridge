# Report for dharness / react-doctor — no way to exclude generated code

**Date:** 2026-08-23
**Reporter:** autoreas-bridge (Wails v2 desktop app, React 19 + Vite + TypeScript frontend)
**Tools:** `dharness check` → `react-doctor` with `dharness-eslint-plugin`
**Severity:** blocks every commit that regenerates framework bindings

## Summary

`dharness check` fails on machine-generated files that the project cannot edit and must regenerate. There appears to be no supported way to exclude a path from `react-doctor`, so the only workarounds are disabling rules globally or not committing generated output. Both are worse than the problem.

We are asking for a path-exclusion mechanism.

## What happens

Our framework (Wails v2) generates TypeScript bindings into `frontend/wailsjs/`. Committing a regenerated binding produces:

```
✖ dharness/require-jsdoc ×94
✖ dharness/max-file-lines ×1

  wailsjs/go/main/App.js:1 … :365     (91 findings)
  wailsjs/go/models.ts:1              (max-file-lines, file is 2543 lines)
  wailsjs/go/models.ts:1744, :1777    (require-jsdoc)
```

All 95 findings are in generated files. Zero are in hand-written source.

The file cannot be shrunk: `models.ts` is one TypeScript class per Go struct, emitted by the framework. The functions cannot be documented: `App.js` is one wrapper per exported Go method, regenerated wholesale on every build.

## Why the existing escape hatches do not apply

- **Not editable.** Wails deletes and re-extracts the directory on build. From the Wails v2.12.0 source, `pkg/commands/build/base.go:436-437`:
  ```go
  wrapperDir := filepath.Join(options.WailsJSDir, "wailsjs", "runtime")
  _ = os.RemoveAll(wrapperDir)
  ```
  and `pkg/commands/build/build.go:131-136` regenerates the bindings on every build unless explicitly skipped. Any comment we add is gone on the next build.
- **Inline suppressions do not survive** for the same reason.
- **Disabling the rules** in `doctor.config.json` turns them off for the entire project, including the hand-written source they exist to protect. `dharness/max-file-lines` and `dharness/require-jsdoc` are two of the guards we most want.

## What we tried

`doctor.config.json`, with `dharness check` re-run after each attempt:

| Key | Result |
|---|---|
| `"ignores": ["wailsjs/**"]` | not honored — same 95 findings |
| `"ignorePatterns": ["wailsjs/**"]` | not honored |
| `"exclude": ["wailsjs/**"]` | not honored |
| `"excludePatterns": ["wailsjs/**"]` | not honored |

We also checked `react-doctor --help` and `react-doctor rules --help`. `rules` offers `disable`, `set`, `category` and `ignore-tag` — all **rule**-scoped, none **path**-scoped. `--scope` and `--staged` select which files enter the scan by git state, not by pattern.

A hook-level glob does not help either: `dharness check` runs `react-doctor --staged`, which reads the git index itself rather than accepting a file list, so filtering upstream has no effect.

## Why this is not visible to most projects

`react-doctor --staged` only scans staged files. Generated bindings are only staged when the binding surface changes — for us, roughly monthly. Our gate adopted dharness on 2026-08-13; the previous binding regeneration was 2026-08-07. This report is from the first commit since adoption that staged generated output. The violation was latent the whole time: `models.ts` was already 2301 lines in August.

Any project committing generated code — Wails, protobuf, GraphQL codegen, OpenAPI clients, Prisma — will hit this the first time that output changes after adopting dharness.

## What the rest of our toolchain already does

Two other tools in the same repository already exclude the same path, so the exclusion itself is uncontroversial here — `react-doctor` is the only one without a mechanism:

- `frontend/eslint.config.js:46` — `'wailsjs/**/*'` in `ignores`
- `.dharness/fallow.jsonc:4` — `"ignorePatterns": ["wailsjs/**"]`, with the comment: *"wails: wails.json declares no `wailsjsdir`, so the default Wails itself falls back to (frontend/) applies"*

Notably `fallow`, shipped alongside dharness, **does** support `ignorePatterns`. `react-doctor` appears not to.

## What we are asking for

A path-exclusion mechanism honored by `react-doctor`, ideally matching the flat-config convention already familiar from ESLint:

```jsonc
{
  "ignores": ["wailsjs/**", "src/generated/**"],
  "plugins": ["dharness-eslint-plugin"],
  "rules": { /* ... */ }
}
```

Per-rule exclusion would also solve it, and is arguably better — generated code should still be checked for, say, correctness rules, just not for authorship rules like JSDoc and file length:

```jsonc
{
  "rules": {
    "dharness/require-jsdoc":   ["error", { "ignores": ["wailsjs/**"] }],
    "dharness/max-file-lines":  ["error", { "ignores": ["wailsjs/**"] }]
  }
}
```

If a mechanism already exists and we missed it, pointing us at it would be just as good — and it may be worth surfacing in `--help`, since `rules --help` lists only rule-scoped controls and gives no hint that path scoping exists.

## Environment

- `react-doctor` invoked by `dharness check` (the repo also pins `react-doctor@0.5.7` for its manual `doctor:react` script)
- Node via Bun, Windows 11
- `dharness/max-file-lines: 500` per `.dharness/rules.json`
- Wails v2.12.0; `wails.json` declares no `wailsjsdir`, so generated output lands in `frontend/wailsjs/`

## One smaller, unrelated observation

`react-doctor` emits this on every run in our repo:

```
(node:1920) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of
file:///…/.dharness/eslint.config.js is not specified and it doesn't parse as
CommonJS. Reparsing as ES module because module syntax was detected. This
incurs a performance overhead.
```

`.dharness/eslint.config.js` is written by `dharness init` and uses ES module syntax, but `.dharness/` has no `package.json` declaring `"type": "module"`. Adding one alongside the generated config would silence the warning and avoid the reparse.

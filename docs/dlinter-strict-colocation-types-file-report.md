# `dlinter/strict-colocation` rejects a compliant `*.types.ts` file

This is a minimal, reproducible false positive for the dlinter team. The hook
module follows the rule's prescribed colocated-folder layout, yet the rule
reports that its interface must be moved to the same file it already occupies.

## Quick reproduction

From `frontend/`:

```powershell
bun run lint
```

The reported file is already a sibling `*.types.ts` module:

```text
src/shared/hooks/use-async-list/
├── __tests__/use-async-list.test.ts
├── index.ts
├── use-async-list.ts
└── use-async-list.types.ts
```

## Minimal source

`src/shared/hooks/use-async-list/use-async-list.types.ts`:

```ts
export interface UseAsyncListResult<T> {
  readonly isLoading: boolean;
  readonly items: readonly T[];
  readonly reload: () => void;
}
```

`src/shared/hooks/use-async-list/use-async-list.ts` consumes that type through
a type-only import:

```ts
import type { UseAsyncListResult } from './use-async-list.types';

export function useAsyncList<T>(
  load: () => Promise<readonly T[]>,
  refreshKey?: unknown,
  sourceKey?: unknown,
): UseAsyncListResult<T> {
  // implementation omitted
}
```

## Original actual result

On 2026-07-12, `bun run lint` fails with:

```text
src/shared/hooks/use-async-list/use-async-list.types.ts
  1:8  error  Strict Colocation: interfaces must be declared in a separate *.types.ts file  dlinter/strict-colocation
  1:8  error  Missing JSDoc comment                                                         jsdoc/require-jsdoc
```

The first diagnostic is contradictory: the interface is already declared in
`use-async-list.types.ts`, which matches the diagnostic's requested location.

## Resolution verification

After updating `dlinter-ts-react` from `^0.4.0` to `^0.4.1`, the same command
no longer emits the `dlinter/strict-colocation` diagnostic. The only remaining
lint failure was the independent project rule `jsdoc/require-jsdoc`, which is
now satisfied by documenting the exported interface.

## Expected result

`dlinter/strict-colocation` should accept interfaces declared in a sibling
file whose basename is `<module>.types.ts`. For this reproduction,
`use-async-list.types.ts` must be treated as the valid type boundary for
`use-async-list.ts`.

## Impact and temporary workaround

The project requires colocated `*.types.ts` files for complex frontend modules,
so this prevents an explicit public return contract for the shared hook. Until
the rule is fixed, the hook relies on TypeScript return-type inference and does
not export `UseAsyncListResult<T>`.

The reproduction file remains restored as the production type contract. It is
now commit-ready once the normal project checks pass.

## Relevant configuration

- ESLint is executed by `frontend/package.json` through `bun run lint`.
- The project uses `dlinter-ts-react` `^0.4.1` as its strict-colocation rule
  provider (with ESLint `^9`).
- Fallow configuration at `frontend/.fallowrc.json` is unrelated to this
  diagnostic; the failure comes from ESLint before Fallow is involved.

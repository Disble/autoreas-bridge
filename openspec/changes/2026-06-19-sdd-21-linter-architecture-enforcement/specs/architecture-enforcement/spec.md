# Architecture Enforcement Specification

## Purpose

This specification defines the deterministic, linter-enforced guarantee that
the toolchain rejects architecture violations of the Hexagonal/ports-adapters
boundaries and frontend dumb-UI/strict-colocation conventions declared in
`AGENTS.md` / `ARCHITECTURE.md`. These requirements describe build-time
governance behavior: what the lint/typecheck/gate pipeline MUST accept and
MUST reject, not runtime behavior.

## Requirements

### Requirement: Frontend Dumb-UI Purity

`.tsx` files under `frontend/src/features/**` MUST contain no side-effect
hooks and no Wails binding calls; they MUST remain presentation-only.

#### Scenario: useEffect in a feature view fails lint
- GIVEN a `.tsx` file under `frontend/src/features/**`
- WHEN the file calls `useEffect` or `useLayoutEffect`
- THEN `bun run lint` MUST fail

#### Scenario: Wails binding import in a feature view fails lint
- GIVEN a `.tsx` file under `frontend/src/features/**`
- WHEN the file imports a generated Wails binding (`wailsjs/**` or
  equivalent bound call)
- THEN `bun run lint` MUST fail

#### Scenario: Pure presentational view passes lint
- GIVEN a `.tsx` file under `frontend/src/features/**`
- WHEN the file only renders HeroUI/Tailwind markup driven by props and
  contains no `useEffect`/`useLayoutEffect` and no Wails imports
- THEN `bun run lint` MUST pass for that rule

### Requirement: Frontend Hook Anatomy

Feature custom hooks (`use-*.ts`) MUST follow the required internal
ordering: derived state and callbacks (`useMemo`/`useCallback`) before
`useEffect`, and the hook body MUST end with a `return` statement.

#### Scenario: useEffect before derived state fails lint
- GIVEN a `use-*.ts` hook file
- WHEN a `useEffect` call appears before a `useMemo` or `useCallback`
  declaration in the same hook body
- THEN `bun run lint` MUST fail

#### Scenario: Hook without a trailing return fails lint
- GIVEN a `use-*.ts` hook file
- WHEN the hook body does not end with a `return` statement
- THEN `bun run lint` MUST fail

#### Scenario: Correctly ordered hook passes lint
- GIVEN a `use-*.ts` hook file
- WHEN derived state and callbacks are declared before any `useEffect`,
  and the hook ends with a `return` statement
- THEN `bun run lint` MUST pass for this rule

### Requirement: Frontend Strict Colocation

Complex frontend feature modules MUST colocate inline-forbidden constructs
(interfaces, types, consts, helpers, Zod schemas) into dedicated sibling
files, keep tests under `__tests__/`, and use kebab-case feature folder
names.

#### Scenario: Inline interface in a view fails lint
- GIVEN a `.tsx` view file inside a feature module
- WHEN the file declares an inline `interface` or `type` instead of
  importing it from `*.types.ts`
- THEN `bun run lint` MUST fail

#### Scenario: Inline helper or Zod schema in a hook fails lint
- GIVEN a `use-*.ts` hook file inside a feature module
- WHEN the file defines a helper function or a Zod schema inline instead
  of importing it from `*.helpers.ts` or `*.schema.ts`
- THEN `bun run lint` MUST fail

#### Scenario: Test file outside __tests__/ fails lint
- GIVEN a feature module directory
- WHEN a test file (`*.test.ts` / `*.test.tsx`) exists outside a
  `__tests__/` subfolder
- THEN `bun run lint` MUST fail

#### Scenario: Non-kebab-case feature folder fails lint
- GIVEN a directory under `frontend/src/features/**`
- WHEN the folder name is not kebab-case
- THEN `bun run lint` MUST fail

#### Scenario: Fully colocated feature module passes lint
- GIVEN a feature module with `index.ts`, `.tsx`, `use-*.ts`,
  `*.helpers.ts`, `*.types.ts`, `*.constants.ts`, optional `*.schema.ts`,
  and tests under `__tests__/`
- WHEN no inline interfaces/types/consts/helpers/Zod schemas exist in the
  view or hook files
- THEN `bun run lint` MUST pass for these rules

### Requirement: Frontend Type Contracts

Every field of a `*Props` interface declared in a `*.types.ts` file MUST
be `readonly`, and any function receiving such a props object at a
component boundary MUST type the parameter as `Readonly<Props>`.

#### Scenario: Non-readonly Props field fails lint
- GIVEN a `*Props` interface in a `*.types.ts` file
- WHEN any property of that interface is declared without `readonly`
- THEN `bun run lint` MUST fail

#### Scenario: Non-Readonly-wrapped boundary parameter fails lint
- GIVEN a component or hook function that accepts a `*Props` argument at
  its public boundary
- WHEN the parameter type is not wrapped in `Readonly<...>`
- THEN `bun run lint` MUST fail

#### Scenario: Fully readonly Props interface passes lint
- GIVEN a `*Props` interface where every field is `readonly` and consuming
  functions type the parameter as `Readonly<Props>`
- WHEN lint runs against that file
- THEN `bun run lint` MUST pass for this rule

### Requirement: Frontend Public Documentation

Every exported hook, type, constant, schema, or helper in frontend feature
modules MUST carry a JSDoc comment.

#### Scenario: Exported helper without JSDoc fails lint
- GIVEN an exported function in a `*.helpers.ts` file
- WHEN the export has no preceding JSDoc comment
- THEN `bun run lint` MUST fail

#### Scenario: Exported hook, type, constant, or schema without JSDoc fails lint
- GIVEN an exported hook (`use-*.ts`), type (`*.types.ts`), constant
  (`*.constants.ts`), or schema (`*.schema.ts`)
- WHEN the export has no preceding JSDoc comment
- THEN `bun run lint` MUST fail

#### Scenario: Documented exports pass lint
- GIVEN every exported hook/type/constant/schema/helper in a feature
  module has a JSDoc comment
- WHEN lint runs against that module
- THEN `bun run lint` MUST pass for this rule

### Requirement: Frontend Transversal Hygiene

The frontend toolchain MUST reject circular imports and files exceeding
500 lines, and MUST run a type-check pass as part of the gate to cover
undefined-symbol detection that ESLint's `no-undef` no longer performs.

#### Scenario: Circular import fails lint
- GIVEN two or more frontend modules that import each other forming a
  cycle
- WHEN `import-x/no-cycle` evaluates the import graph
- THEN `bun run lint` MUST fail

#### Scenario: Oversized file fails lint
- GIVEN a frontend source file exceeding 500 lines
- WHEN lint evaluates the `max-lines` rule
- THEN `bun run lint` MUST fail

#### Scenario: Typecheck runs in the pre-commit gate
- GIVEN the `lefthook` pre-commit gate executes
- WHEN the `frontend-typecheck` job runs `bun run typecheck`
- THEN an undefined symbol or type error MUST cause the gate to fail
- AND a clean frontend tree MUST pass `bun run typecheck`

### Requirement: Backend Domain Purity

`internal/anime/domain` MUST NOT depend on transport (`net/http`,
`github.com/wailsapp/wails/v2`) or persistence (`database/sql`) packages.

#### Scenario: Domain importing net/http fails golangci-lint
- GIVEN a file under `internal/anime/domain/**`
- WHEN the file imports `net/http`
- THEN `golangci-lint run` MUST fail under the `domain-purity` `depguard`
  rule

#### Scenario: Domain importing database/sql fails golangci-lint
- GIVEN a file under `internal/anime/domain/**`
- WHEN the file imports `database/sql`
- THEN `golangci-lint run` MUST fail under the `domain-purity` `depguard`
  rule

#### Scenario: Domain importing the Wails runtime fails golangci-lint
- GIVEN a file under `internal/anime/domain/**`
- WHEN the file imports `github.com/wailsapp/wails/v2`
- THEN `golangci-lint run` MUST fail under the `domain-purity` `depguard`
  rule

#### Scenario: Transport-free domain code passes golangci-lint
- GIVEN a file under `internal/anime/domain/**`
- WHEN the file imports none of `net/http`, `database/sql`, or
  `github.com/wailsapp/wails/v2`
- THEN `golangci-lint run` MUST pass the `domain-purity` rule for that file

### Requirement: Backend Ports Isolation

`internal/api/contracts` MUST NOT depend on its own handler adapters
(`internal/api/handlers`) or on transport/persistence drivers.

#### Scenario: Contracts importing handlers fails golangci-lint
- GIVEN a file under `internal/api/contracts/**`
- WHEN the file imports `autoreas-bridge/internal/api/handlers`
- THEN `golangci-lint run` MUST fail under the `contracts-are-ports`
  `depguard` rule

#### Scenario: Contracts importing transport or persistence fails golangci-lint
- GIVEN a file under `internal/api/contracts/**`
- WHEN the file imports `net/http`, `database/sql`, or
  `github.com/wailsapp/wails/v2`
- THEN `golangci-lint run` MUST fail under the `contracts-are-ports`
  `depguard` rule

#### Scenario: Adapter-free contracts pass golangci-lint
- GIVEN a file under `internal/api/contracts/**`
- WHEN the file imports none of `internal/api/handlers`, `net/http`,
  `database/sql`, or `github.com/wailsapp/wails/v2`
- THEN `golangci-lint run` MUST pass the `contracts-are-ports` rule for
  that file

### Requirement: Backend Transport Confinement

The Wails desktop runtime (`github.com/wailsapp/wails/v2`) MUST stay
confined to the composition root; no package under `internal/**` may
import it.

#### Scenario: Internal package importing Wails fails golangci-lint
- GIVEN a file under `internal/**`
- WHEN the file imports `github.com/wailsapp/wails/v2`
- THEN `golangci-lint run` MUST fail under the `wails-confined-to-edge`
  `depguard` rule

#### Scenario: Wails-free internal package passes golangci-lint
- GIVEN a file under `internal/**`
- WHEN the file does not import `github.com/wailsapp/wails/v2`
- THEN `golangci-lint run` MUST pass the `wails-confined-to-edge` rule for
  that file

#### Scenario: Composition root may still import Wails
- GIVEN `app.go` or `main.go` at the repository composition root (outside
  `internal/**`)
- WHEN the file imports `github.com/wailsapp/wails/v2`
- THEN `golangci-lint run` MUST NOT fail under `wails-confined-to-edge`
  for that file

### Requirement: Pre-Commit Gate Integration

The `lefthook.yml` pre-commit gate MUST run the frontend lint job, the
frontend typecheck job, and `golangci-lint run` so that every requirement
above is enforced before a commit is created.

#### Scenario: Gate fails on any architecture violation
- GIVEN a commit is attempted with a staged change violating any
  requirement in this specification
- WHEN the `lefthook` pre-commit hook runs the `frontend-lint`,
  `frontend-typecheck`, or `golangci-lint` job
- THEN the corresponding job MUST exit non-zero
- AND the commit MUST be blocked

#### Scenario: Gate passes on a clean tree
- GIVEN a commit is attempted with no architecture violations present
- WHEN `lefthook` runs `frontend-lint`, `frontend-typecheck`, and
  `golangci-lint`
- THEN all three jobs MUST exit zero
- AND the commit MUST proceed

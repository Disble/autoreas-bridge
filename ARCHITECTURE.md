# Architecture & Development Manifesto

## 1. Core Philosophy (CONCEPTS > CODE)

This project follows a strict **Feature-Sliced Design** adapted to the desktop bridge frontend.
* **The UI is an implementation detail:** Business logic lives in hooks and pure functions, ignorant of Wails bindings and delivery concerns.
* **The desktop shell is an implementation detail:** Wails bindings are adapter edges and must be consumed from smart hooks, not dumb UI.
* **HeroUI React is Mandatory:** We build UIs combining HeroUI React primitives with Tailwind classes. Avoid raw HTML widgets when a HeroUI primitive already solves the problem.

## 2. Frontend Directory Structure

```text
frontend/src/
├── App.tsx            # Delivery/composition root only.
├── app/               # Optional future delivery layer (routing/composition only).
├── components/        # Shared UI primitives or temporary bridge components.
├── features/          # Domain-driven frontend modules.
│   └── dashboard/     # Reference feature once introduced.
├── test/              # Shared frontend test bootstrap.
└── assets/            # Static frontend assets.
```

## 3. Strict Colocation (The Component Ecosystem)

Complex frontend features and UI modules must follow strict colocation. A module is self-contained.

```text
frontend/src/features/dashboard/ui/BridgeStatusCard/
├── index.ts
├── BridgeStatusCard.tsx
├── use-bridge-status-card.ts
├── bridge-status-card.types.ts
├── bridge-status-card.constants.ts
├── bridge-status-card.helpers.ts
├── bridge-status-card.schema.ts   # optional, when schema validation exists
└── __tests__/
    ├── BridgeStatusCard.test.tsx
    ├── use-bridge-status-card.test.ts
    └── bridge-status-card.helpers.test.ts
```

## 4. Delivery Layer Rule (`frontend/src/App.tsx`, `frontend/src/app/**`)

Delivery files are composition-only.

They MUST NOT:
- import Wails bindings directly
- use React state/effect hooks
- contain data orchestration or business logic
- declare feature-local helper functions/constants/types at the root

If delivery needs behavior, create a feature entrypoint component and render it.

## 5. The 10-Step Hook Anatomy

Every frontend custom hook (`use-*.ts`) MUST follow this order:

1. Imports
2. Signature
3. Refs
4. State
5. Context / 3rd Party Hooks
6. Queries / Mutations
7. Derived State (`useMemo`)
8. Callbacks (`useCallback` using pure helpers)
9. Effects
10. Return

## 6. Strict Colocation Enforcement Details

Frontend feature `.tsx` and `use-*.ts` files MUST NOT contain at the root level:
- `interface` or `type` declarations
- root-level `const` declarations
- root-level helper functions
- inline Zod schemas

Those constructs belong in:
- `*.types.ts`
- `*.constants.ts`
- `*.helpers.ts`
- `*.schema.ts`

Additionally, the main feature component/hook export MUST be a named `function` declaration.

## 7. Props Contract Rule

Every property in any `*Props` interface inside frontend `*.types.ts` must be declared as `readonly`.

## 8. The 500-Line Protocol

If any frontend `.ts` or `.tsx` file exceeds 500 lines, refactor it immediately.

## 9. Testing Policy (TDD + SDD)

* Read the relevant `openspec/specs/` contract first.
* Write the failing test first for frontend helpers/hooks.
* Keep helper logic pure and fully covered where practical.
* Keep hook tests focused on behavior through public return values.
* Dumb UI tests should validate behavior/conditional rendering, not CSS trivia.

## 10. Deterministic Enforcement Barriers

Architecture described only in prose is a promise, not a guarantee. Every
constraint below is now enforced by a linter and gated by `lefthook` before a
commit lands — deterministic first, transversal by default.

### Frontend (ESLint v9 flat config — `frontend/eslint.config.js`)

Rules live in the colocated `frontend/eslint/` module. They enforce:
* **Delivery purity:** `App.tsx` / `app/**` cannot import Wails bindings, React hooks, or feature hooks.
* **Dumb UI:** feature `.tsx` cannot import Wails bindings or use `useEffect`/`useLayoutEffect`.
* **Hook anatomy:** `useMemo` → `useCallback` → `useEffect` ordering; hooks end with a `return`.
* **Strict colocation:** no inline interfaces/types/consts/helpers/Zod in views & hooks; tests live in `__tests__/`; feature folders are `kebab-case` (`check-file`).
* **Type contracts:** every `*Props` field is `readonly`; props parameters use `Readonly<Props>` at the boundary.
* **Public JSDoc:** exported hooks, helpers, constants, types, and schemas require documentation.
* **Transversal hygiene:** no circular imports (`import-x/no-cycle`), cognitive complexity & duplication (`sonarjs`), React anti-patterns (`react-doctor`, advisory), 500-line max.
* **Type safety:** `no-undef` is delegated to TypeScript; `bun run typecheck` runs in the gate.

### Backend (golangci-lint `depguard` — `.golangci.yml`)

The Hexagonal / Ports & Adapters boundaries are enforced deterministically:
* **Domain purity:** `internal/anime/domain` cannot import `net/http`, `database/sql`, or the Wails runtime.
* **Ports stay free of adapters:** `internal/api/contracts` cannot import `internal/api/handlers` or transport/persistence drivers.
* **Transport confinement:** the Wails runtime stays in the composition root (`app.go`/`main.go`); no `internal/**` package may import it.

### Other barriers

* **Generators:** complex feature scaffolding should come from `bun --cwd="frontend" run generate:feature <feature> <ComponentName>`.
* **Instruction Files:** `AGENTS.md` and `CLAUDE.md` repeat the same constraints so future agents start with the right mental model.

---
*If in doubt, prefer a feature folder under `frontend/src/features/` over adding logic to `App.tsx` or `components/`.*

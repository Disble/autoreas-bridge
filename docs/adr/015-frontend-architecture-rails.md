# ADR-015: Frontend architecture rails

- **Status**: Accepted
- **Date**: 2026-08-25
- **Supersedes**: ADR-001 (feature-sliced architecture), ADR-002 (smart hooks,
  dumb UI), ADR-003 (testing policy), ADR-004 (LLM enforcement barriers),
  ADR-005 (compile-time architecture rails) — all five consolidated here
- **Related**: `docs/adr/006-frontend-runtime-read-models.md`,
  `docs/adr/011-no-barrel-files.md`, `docs/adr/012-progressive-list-rendering.md`

## Context

The bridge frontend started as a small Wails MVP. Even a small React surface
drifts fast when one file mixes rendering, Wails bindings, and view
orchestration — and it drifts faster when both humans and agents edit it. The
rails below were originally recorded as five separate ADRs written between
2026-04 and 2026-07. Each was a genuine decision, but each was also short
enough that the operational form of the rule migrated to `AGENTS.md` and
`CLAUDE.md`, leaving five stubs that drifted out of date against their own
successors: ADR-001 still mandated the `index.ts` barrels that ADR-011 later
deleted, and ADR-005 still scoped mandatory JSDoc to exported helpers, which
`AGENTS.md` rule 6 has since widened to every declaration.

This ADR consolidates them into one current record. `AGENTS.md` states the
rules operationally and is what a reader should follow; this file states why
they exist and what they cost, which is the part a rules list cannot carry.

## Decision

### 1. Feature-sliced organization with strict colocation

Frontend business concepts live under `frontend/src/features/`. Every complex
UI module is a self-contained folder holding `.tsx`, `use-*.ts`, `*.types.ts`,
`*.constants.ts`, `*.helpers.ts`, an optional `*.schema.ts`, and a colocated
`__tests__/`. Modules are imported by concrete path — **no `index.ts`
barrels**, per ADR-011, which measured a 59.7% dead-barrel rate and removed 67
of them.

`frontend/src/App.tsx` and `frontend/src/app/**` are delivery-only composition
layers. A stateful widget that three features import is not a feature: it
moves to its own `shared/<domain>/` module, as `shared/ordering/` did.

### 2. Smart hooks, dumb UI, strict hook anatomy

`.tsx` files under `features/` render HeroUI primitives and Tailwind classes
and nothing else. Wails bindings, effects, and orchestration live in
`use-*.ts`. Hooks follow a fixed order — imports, signature, refs, state,
context/third-party hooks, queries/mutations, derived state, callbacks,
effects, return — so any hook can be scanned for its side effects in one pass.

When several hooks render the same backend runtime process they consume a
shared read-model store from `frontend/src/shared/store/` rather than each
owning an independent snapshot and event subscription. ADR-006 records that
decision and its alternative.

### 3. TDD for helpers and hooks

A frontend helper or hook is not modified before its colocated test is written
or updated. Coverage intent by file kind: `*.helpers.ts` and `*.schema.ts`
carry effectively full behavior coverage; `use-*.ts` carries behavior-focused
integration coverage; `.tsx` is tested for behavior and conditional rendering,
never for style trivia.

Green is not the end of the cycle. The repo runs RED → GREEN → **MUTATE** →
REFACTOR: a test that still passes with its guard deleted proves nothing, and
neither `go test` nor a coverage percentage will say so. Frontend mutation is
automated through `lefthook.yml`'s `test:mutation:staged`; see
`docs/mutation-testing.md`.

### 4. Enforcement is mechanical, not editorial

Documented conventions do not survive contact with a rushed edit. Each rail
above is backed by a barrier that fails the commit:

- ESLint for `max-lines`, delivery purity, strict colocation, readonly
  `*Props`, and mandatory JSDoc — the latter now covering **every**
  declaration, private and test-file included, through
  `dharness/require-jsdoc` and `dharness/require-variable-jsdoc`.
- Fallow for dead code, dependency hygiene, duplication, and changed-code
  audit pressure (`docs/fallow-usage.md`).
- Generator-based scaffolding, so a new feature folder is born compliant.
- The rule text in `AGENTS.md` and `CLAUDE.md` as the last line, not the first.

The ordering matters and is itself the decision: a rule with no barrier is a
convention enforced by review, and ADR-011's enforcement section records what
that costs when the barrier is withdrawn.

## Consequences

**Positive.** Higher cohesion and predictable file locations, which makes both
TDD and agent edits cheaper. Testable logic separated from render files.
Shared runtime state has one invalidation path, removing a class of stale-UI
bugs between sibling panels. Architectural drift surfaces as a lint failure
during the commit rather than as a review comment days later.

**Negative.** More files and more upfront structure discipline. Real ceremony
when extracting a small component into a feature module. ESLint and scaffolding
maintenance become part of the platform burden — the barriers are code, and
code that is not maintained stops failing. Some legitimate edge cases will need
rule exceptions, and each exception costs a deliberate decision.

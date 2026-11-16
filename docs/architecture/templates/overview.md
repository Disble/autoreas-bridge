# <Context> — overview

<!--
Template for docs/architecture/contexts/<context>/overview.md. Copy it when a module gets its page,
replace every <placeholder>, delete sections that do not apply only after saying why in one line, and
list the new file in docs/architecture/README.md. Rules: docs/architecture/README.md "Naming and
structure". Diagrams are Mermaid blocks. A claim about code names its file; a measured number says how
it was measured.
-->

<One paragraph: what this context owns and why it exists. Link the ADRs behind it.>

For <the multi-step process>, read `workflow.md`. For <a cross-cutting rule it relies on>, read
`../../cross-cutting/<file>.md`.

## Responsibility

- Owns: <state, tables, events>.
- Does not own: <neighbouring responsibilities and who owns them>.

## Package map

| Package | Role |
|---|---|
| `internal/<context>/...` | <role> |

## Ports and adapters

<Driving ports (who calls in), driven ports (what it calls out to), and their adapters. ADR-017 naming.>

## Readiness and failures

- Module handle: `modules.<Context>` (ADR-032). Becomes `ready` when <condition>; `failed` when <condition>.
- Failure codes its bindings return, and the domain errors they map from.
- Outcomes that are results, not failures (for example `conflict`).

## Events

| Event | Published when | Consumers |
|---|---|---|

## Storage

<Tables, columns, formats, retention. Quote persisted values literally.>

## Invariants

- <What must always hold, and where it is enforced (test, gate, constraint).>

## Frontend

- Screens and features: `frontend/src/features/<feature>/...`.
- Query keys: `<context>Keys` in `frontend/src/shared/query/...`; which backend events invalidate them.
- Source port and adapter: `frontend/src/infrastructure/<source>/...`.
- UI/client state kept in Zustand, if any, and why it is not server state.
- Loading, empty and failure rendering: which `toAsyncView` states each screen shows.

## Entry points

| Trigger | Entry |
|---|---|
| Wails binding | `internal/desktop/<file>.go` `<Method>` |
| REST | `internal/api/...` |

## Known drift

- <Where the code differs from this page or from ADR-032, measured, with the file.>

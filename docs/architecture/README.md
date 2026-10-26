# Bridge architecture

This folder documents how the Bridge backend and its bounded contexts are built: who owns which
state, which ports and adapters exist, and how each workflow runs from trigger to outcome. It is the
architecture counterpart of `docs/design/`, which covers visual design only.

The code is the execution contract. When a document here disagrees with the code, the code wins as
runtime truth; record the drift in the document's "Known drift" section and fix it in the same unit
that touches that code.

## File map

### Bounded contexts

| Path | Read it when |
|---|---|
| `contexts/downloads/overview.md` | Touching `internal/download`: its packages, ports, adapters, events, storage and invariants |
| `contexts/downloads/workflow.md` | Following one download run end to end: run, anime, episode, hoster, rename, Stop |
| `contexts/downloads/hoster-attempt-phases.md` | Changing how one hoster attempt is watched: grace probes, JD verdict, completion poll |
| `contexts/anime/overview.md` | Touching `internal/anime`: its services, the store gateway, the save transaction, events, storage and invariants |
| `contexts/anime/workflow.md` | Following one anime save end to end: decide, stamp, Season rule, commit, publish, conflict |

### Cross-cutting

| Path | Read it when |
|---|---|
| `cross-cutting/persistence.md` | Opening `bridge.db`, choosing `InTx` or `InWriteTx`, the schema bootstrap order, or how `name_key` is computed and enforced |
| `cross-cutting/deprecations.md` | Removing upgrade-only migrations, or deciding whether new compatibility code must be marked for removal in a future major release |

Related documents kept where they are:

- `docs/architecture.md` — the system-wide overview (hexagonal style, bounded contexts, event bus,
  composition root). It is being split into this folder one context at a time; each context that has
  a folder here keeps only a one-line pointer there, and until a context has its own folder, that
  file remains its reference.
- `docs/adr/` — architecture decision records. An ADR records why a decision was taken and is never
  rewritten; documents here describe the current state and link to the ADRs behind it.
- `docs/observability/` — the Activity and runtime-event architecture.

## Naming and structure

- One folder per bounded context under `contexts/`, named after its `internal/` package in plain
  English (`internal/download` → `contexts/downloads/`).
- Every context folder starts with `overview.md`: responsibility, package map, ports and adapters,
  events, storage, invariants, entry points and known drift.
- Add `workflow.md` when the context runs a multi-step process. Write it as one decision tree from
  trigger to every terminal outcome, so a reader can check that no path is a dead end.
- Put a sub-process that needs its own detail in a separate kebab-case file and link it from the
  workflow at the step it expands.
- Cross-cutting topics that belong to no single context (the event bus, the composition root,
  persistence conventions, the deprecation register) go in `cross-cutting/` when they are first
  written, and are listed in the cross-cutting table above.
- Keep each file focused and under about 300 lines; split by topic rather than growing one file.
- A claim about code names the file it lives in (`internal/download/service_pipeline.go`), and a
  persisted value is quoted literally (`fs_poll_confirmed`). Every measured number names how it was
  measured.
- Write in English, like the code.
- Every diagram is a Mermaid code block (```` ```mermaid ````), so it renders and stays interactive
  in GitHub and the editor. Never draw diagrams in ASCII art or embed them as images. Pick the
  Mermaid type by content: `flowchart` for decision trees and module maps, `sequenceDiagram` for
  calls between actors, `stateDiagram-v2` for state machines. Do not use `end` as a node id: it is a
  Mermaid keyword.

## Adding to the architecture docs

1. Put the detail in the right context folder, or create the folder with its `overview.md`, and list
   every new file in the file map above. A cross-cutting document goes in `cross-cutting/` and is
   listed in its own table there.
2. When a context gets its own folder, replace its section in `docs/architecture.md` with a one-line
   pointer here, in the same unit.
3. A document that describes code the project intends to delete links to
   `cross-cutting/deprecations.md` and keeps its removal steps there, not in the context document.
4. Source comments may cite these paths (for example
   `docs/architecture/contexts/downloads/hoster-attempt-phases.md`); moving or renaming a file means
   updating those citations in the same unit.

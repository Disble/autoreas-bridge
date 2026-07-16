# Learning Log (Vitácora)

A human-readable record of *why* things in this repo are the way they are:
decisions taken and non-obvious problems solved, so future sessions inherit the
reasoning instead of rediscovering it.

This is a memory aid, **not** a substitute for deterministic guards. Whenever a
lesson can be enforced (linter, test, `go vet`, pre-commit gate), do that too —
this file only explains the *why*, it never replaces the *how*.

## How to append

- One lesson per line, kept to a single short sentence.
- Format: `- [YYYY-MM-DD]: text`
- Newest entries at the bottom. Never rewrite past entries; add a new line if
  something changes.

## Entries

- [2026-07-16]: Editor read DTOs (`AnimeEditorNullable*DTO`) must never use JSON `omitempty` on their value field — the `kind` discriminator already encodes missing/null, and `omitempty` silently drops a legit zero (tipo=0 "Anime (TV)"), which emptied the Type field and forced an endless no_op save loop.
- [2026-07-16]: Go↔JS zero-value/`omitempty` bugs pass per-side unit tests because each side is correct in isolation; catch this class with a contract test at the serialization boundary, not with more unit tests per layer.
- [2026-07-16]: Reply in the language the user actually typed this turn; do not default to Spanish from project config or stored memory when the user is writing in English.
- [2026-07-16]: In the Anime Editor, `props.initialAnimeId` is test-only scaffolding — the route mounts the workspace with no props, so production deep-link selection flows through `useParams().id` in `use-anime-editor-transitions.ts`, not the prop.
- [2026-07-16]: The editor rail's filter default is route-derived: a fresh `/editor/:id` mount opens on "All anime" so a non-watching deep-linked anime (e.g. "No me gusto") is visible in the rail, while the generic `/editor` entry keeps "Watching first"; a lazy `useState` initializer reads the param once so in-app clicks never reset the user's toggle.
- [2026-07-16]: When the Fallow changed-code gate blocks a commit on duplication/complexity, prefer the real fix — extract a generic `shared/ui` component (e.g. `LabeledTextField` collapsing repeated Label/Input/Description rows) and pull dense inline logic into a pure helper — over suppressing; reserve `fallow-ignore`/baseline for genuine false positives like structurally-similar but semantically-distinct interface shapes across bounded contexts.

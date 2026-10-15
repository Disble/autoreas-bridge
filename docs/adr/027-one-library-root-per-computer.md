# ADR-027: One library root per computer; the relative folder is computed, never stored

- **Status**: Accepted.
- **Date**: 2026-10-15.
- **Supersedes**: nothing. It renames the setting ADR-014 calls the "global downloads root" and widens its
  scope from the download context to the whole application.
- **Related**: `odd/tasks/library-root.md` (the feature record), `docs/openapi.yaml` (`MobileAnime.folderRelative`),
  `docs/adr/014-anime-creation-download-readiness-boundary.md`, `docs/adr/021-portable-keymap-and-importer-footprints.md`
  (the root stays machine-local and out of backup bundles).

## Context

`app_settings["downloads.root"]` was introduced for one job: default the download folder of a newly created
season anime to the root plus a sanitized anime name. Over time season intake, manual creation, readiness and
download execution all came to read it, so in practice it already was the place where the library lives.
Mobile now needs the part of an anime's folder below that place, so it can open the same folder on a device
whose library sits somewhere else (for example `SD/Videos/Anime`).

Every anime stores its folder as an **absolute** path, inherited from ten years of Legacy data and still how
Bridge writes it today. A read-only measurement of the live database on 2026-10-15 found 838 of 839 animes
with a folder: 744 under `D:\Anime` (created 2015 → 2026-10, 12 active) and 94 under `E:\Anime` (created
2023-07 → 2025-04, none active). `E:` is history from another computer, not a second live root. Below the
root, 667 folders are one level deep, 47 two, 23 three and 7 four (sequels, side stories, films and OVAs
nested under their parent show).

## Decision

### D1 — One library root per computer

The setting becomes the **library root**: the single folder on this computer where the anime library lives.
Key `library.root`; Go `LibraryRoot`/`SetLibraryRoot`; Wails `GetLibraryRoot`/`SetLibraryRoot`; Options tab
"Library". A bootstrap migration copies an existing `downloads.root` value to `library.root` and deletes the
old key, so a database restored from an older restore point converges on its next start.

| Rejected | Why |
|---|---|
| A list of library roots (Steam "Storage" style) | The drive prefixes in the data are history from earlier computers, not live roots; a list adds UI, validation and a mapping problem for no current use |
| Keeping the name `downloads.root` | The value is no longer a download-only concern; the old name invites a second, competing "library" setting later |

### D2 — The absolute folder stays the source of truth

No anime folder is migrated to a relative form. Desktop opens, downloads into and validates the absolute
path exactly as before.

### D3 — `folderRelative` is computed on read

Mobile receives `folderRelative`: the stored folder with the library root removed, `/`-separated, computed
whenever an anime is serialized for mobile (list, detail, and every snapshot of the changes feed). It is
omitted when the root is unset, the folder is empty, equal to the root, or outside it. Matching is
case-insensitive, treats `\` and `/` as the same separator, and cuts only at a path-segment boundary, so
`D:\Anime` never matches `D:\Anime2\X`.

| Rejected | Why |
|---|---|
| A stored relative field | Two values that must agree, kept in sync by every writer (editor, intake, creation, mobile patches) plus a backfill of every row |
| Mobile derives it alone | Mobile does not know the root; it would hard-code "everything lives under `X:\Anime`" |

### D4 — Changing the root rebases active animes only, after confirmation

Saving a different root lists the **active** animes whose folder is under the old root and, once the user
confirms, rewrites their absolute folder from the old root to the new one through the normal write path.
Each is an ordinary `folder` update that mobile already applies; `folderRelative` does not change because
the folder's position inside the library is the same. Active animes outside the old root are listed and left
alone. Inactive history is never rewritten. Files on disk are never moved.

| Rejected | Why |
|---|---|
| One `folderRelative`-only changelog event per affected row | ~840 synthetic events, a new event shape, and rejections on older mobile builds, to update history nobody opens |
| A forced full resync over the WebSocket | The signal is ephemeral: an offline device misses it |

## Consequences

- Inactive animes stored under a previous root lose `folderRelative` on a later full fetch. This is accepted
  and documented in `docs/openapi.yaml`.
- The library root remains machine-local (ADR-021): it does not travel in a backup bundle.
- Any new consumer of "where the library lives" reads the library root; it never re-derives one from anime
  folders.

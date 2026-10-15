# `LookupModal`

`frontend/src/shared/ui/LookupModal/` is the presentation shell of a search-and-pick lookup: a
trigger, a dialog with its own search field, a candidate list, and Cancel plus a primary confirm
action. It owns markup only. Each lookup owns its own search, selection and wording, and hands the
shell one `LookupModalCopy` constant.

## Parts

| Part | Use |
|---|---|
| `LookupModal` | The dialog. Renders exactly one list state from `state`: `loading` (skeleton rows in a status region named by `copy.loadingLabel`), `failed` (danger `Alert` titled `copy.errorTitle`), `resolved` with no rows (`filtered` empty state from `copy.emptyTitle(query)` and `copy.emptyDescription`), or the caller's rows in a scrolling container labelled `copy.listLabel` |
| `LookupTrigger` | The opening button: `variant="text"` for a form, `variant="icon"` for a dense row action group (round tertiary icon button, named and tooltipped with its label) |
| `LookupCandidateRow` | One selectable row: cover slot (placeholder when `image` is absent), title, optional muted subtitle that may wrap. Pressing it only highlights |
| `LookupCandidateSkeleton` | The loading row, matching the candidate row's height |

## Behavior every lookup keeps

- The search field is seeded from the owner's name on the first open only; a reopen keeps what the
  user typed.
- Searches fire after `METADATA_LOOKUP_DEBOUNCE_MS` (300 ms) once the query clears
  `meetsMinimumQueryLength`; only the newest request may land.
- Results are re-ranked for display with `rankLookupCandidates`; ranking never adds or drops a row.
- Selecting highlights; only the primary action applies, and Cancel writes nothing.

## Lookups built on it

| Lookup | Where | Copy | Confirm |
|---|---|---|---|
| Fetch metadata (MyAnimeList) | `shared/metadata-lookup/ui/AnimeMetadataLookupModal/` | `METADATA_LOOKUP_COPY` | "Use this match" fetches the detail page, then maps it |
| Find on provider | `features/season/ui/IntakePanel/IntakeProviderLookup/` | `PROVIDER_LOOKUP_COPY` | "Use this page" resolves the intake row to the page URL |

Find on provider appears beside Fetch metadata only on intake rows whose match is `not_found`,
`ambiguous` or `search_failed`, never in read-only. Its rows have no cover (placeholder), and the
subtitle is `<provider label> · <page URL without scheme>` (`JKAnime` for `jkanime`, otherwise the
raw provider name). A provider search returns one result page, so the list renders whole rather than
through a progressive window.

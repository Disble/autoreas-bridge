# `AwaitingSelectionPane`

`frontend/src/shared/ui/AwaitingSelectionPane/` is the detail pane of a master/detail surface before
a row is selected. It is the filled pane without data, so selecting a row fills the same slots
without anything moving. It is a resting state: not an empty result (no mascot) and not a load (no
skeleton shapes).

## Composition

- A 56px circle (`bg-default text-muted`) holding the surface's own glyph, where the selected item's
  cover or mark will go.
- Beside it, the prompt as `Typography type="h3"` in the slot the item's name will take, and one muted
  line telling the user what to do.
- An optional preview of the filled pane: its REAL field labels in a two-column `dl`, each value an
  em dash (`AWAITING_SELECTION_EMPTY_VALUE = '—'`), and optionally the real label of the next section
  in small uppercase. The preview is dimmed (`opacity-55`) and `aria-hidden`; the heading and its line
  are what a screen reader needs.
- An optional muted footer line, pushed to the bottom with a top divider, naming what opens there.
- Top-anchored and left-aligned.

An em dash reads as "nothing chosen" because the heading says so first; a skeleton bar would read as
loading, which the three-states rule reserves for an unresolved request.

## API

| Prop | Type | Notes |
|---|---|---|
| `icon` | `IconifyIcon` | The surface's own glyph |
| `title` | `string` | The prompt |
| `description` | `string` | One line |
| `fields` | `readonly string[]` (optional) | Real labels of the filled pane only |
| `sectionLabel` | `string` (optional) | Real label of the filled pane's next section |
| `footer` | `string` (optional) | One line |

## Where it is used

| Surface | File | Preview |
|---|---|---|
| History inspector | `features/history/ui/HistoryInspector/HistoryInspector.tsx` | Watched / Last watched / Added, recent-episodes section label, footer |
| Notifications detail | `features/notifications/ui/NotificationDetail/NotificationDetail.tsx` | fields, section label, footer |
| Run history detail | `features/download/ui/RunHistoryPanel/RunHistoryDetailPane.tsx` | fields, section label |
| Transaction detail | `features/network/ui/TransactionDetail/TransactionDetail.tsx` | header only (the filled pane is tabbed) |
| Event detail | `features/network/ui/NetworkDetail/NetworkDetail.tsx` | header only (the filled pane is tabbed) |

The Notifications preview labels are an approved design choice: the filled header shows a level chip
and `source · when` without visible labels, so its preview is not a copy of existing labels. Any
other surface previews only labels its filled pane really shows (`process/mockup-fidelity-and-pricing.md`).

## Never

- The mascot. This pane exists for cases where the mascot does not belong.
- Skeleton shapes or a status region.
- Invented field labels.

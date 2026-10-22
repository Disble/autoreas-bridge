# Iconography

Which icon set Bridge draws from, which variant goes where, and the action-to-icon vocabulary.
Read it before adding an icon or an icon-only button. The button rules themselves (when an action is
icon-only, `aria-label`, `Tooltip`) live in `components/heroui-mapping.md`, "Icon-only buttons with a
tooltip".

## The set

- Icons come from Iconify: `@iconify/react` renders them, and each glyph is imported by path from
  `@iconify-icons/<set>/<name>` (`import restoreIcon from '@iconify-icons/solar/restart-bold'`).
  No icon font, no inline SVG copied into components.
- **Solar is the primary set.** Measured on 2026-10-22 by grepping `@iconify-icons/` imports under
  `frontend/src`: 34 Solar imports against 13 Tabler (`.tsx` files only).
- **Glyph size is 18px** inside every icon-only button (`size-[18px]`, set by `IconActionButton`).
- **Tabler is the exception set** for small glyph controls where Solar has no fitting shape or the
  duotone fill is too heavy at 16px: chevrons, plus/minus steppers, `question-mark`, `refresh`, and the
  inline `pencil` in `EpisodeDurationsTable.tsx`. Do not mix the two sets inside one button group.

## Variants

| Variant | Use it for | Example |
|---|---|---|
| `bold-duotone` | Actions in rows and menus: icon-only buttons and menu items that do something to a record | `solar/copy-bold-duotone`, `solar/trash-bin-2-bold-duotone` |
| `linear` | Navigation and wayfinding, and card toolbars and headers (Anime Detail's toolbar, the Editor's Repeat, Restore and Schedule), which read lighter than row actions | `solar/alt-arrow-left-linear` (Back), `solar/rewind-back-linear` |
| `bold` | Small status glyphs inside text or chips, and the overflow `menu-dots` | `solar/danger-circle-bold`, `solar/menu-dots-bold` |

One button group uses one variant. A duotone glyph's half-opacity layer carries meaning (the moving
part of the action), so pick the duotone variant rather than recoloring a `bold` one.

## Action vocabulary

One action, one icon, everywhere. Reuse a row here before choosing a new glyph; add a row when a new
action appears. The tooltip is the short action name; the `aria-label` adds the target
(`Repeat Sousou no Frieren`).

| Action | Icon | Tooltip | Meaning and notes |
|---|---|---|---|
| Edit a record | `solar/pen-linear` | `Edit anime` | Opens the editor for the record (`AnimeDetailToolbar.tsx`). In dense table cells, the existing Tabler `pencil` stays |
| Repeat | `solar/rewind-back-linear` | `Repeat` | Starts a new watch cycle: watch it again from the beginning. A media-player rewind, no circle. Anime Detail toolbar and Editor footer |
| Restore | `solar/archive-up-linear` | `Restore` | Reactivates a deleted record (`Anime.Restore()` in `internal/anime/domain/anime.go`) or a discarded intake row (`IntakeDiscardedRow.tsx`): out of the box, the opposite of Delete |
| Delete | `solar/trash-bin-2-bold-duotone` | `Delete` | Destructive; pair with a confirmation |
| Copy | `solar/copy-bold-duotone` | `Copy path`, `Copy this run for AI` | Clipboard copy, confirmed by a toast. Activity's Copy for AI uses it too |
| Duplicate to another day | `solar/copy-bold-duotone` | `Duplicate to another day` | Both ordering boards. Shares the Copy glyph, a known overlap |
| Remove from a day | `solar/trash-bin-2-bold-duotone` | `Remove` | Ordering cards, danger tint. Locked on the last card: `Remove · <reason>` |
| Deactivate anime | `solar/archive-down-linear` | `Deactivate anime` | Editor footer, danger tint; the confirmation dialog keeps the text. The opposite of Restore |
| Edit duration | `tabler/pencil` | `Edit duration` | Episodes table row |
| Set download folder | `solar/folder-with-files-bold-duotone` | `Set download folder` | Intake rows; the folder on the second line |
| Change grade | `solar/star-bold-duotone` | `Change grade` | Warning tint |
| Change status | `solar/menu-dots-bold` | `Change status` | Today rows, opens the status dialog. Warning tint |
| Add / subtract one episode | `tabler/plus`, `tabler/minus` | `Add one episode`, `Subtract one episode` | Today stepper; second line `Right-click adds half` / `subtracts half`. "+" is primary, "−" tertiary |
| Open folder | `solar/folder-open-bold-duotone` | `Open folder` | `AnimeDesktopActions.tsx`; the path on the second line, secondary click copies it |
| Open page | `solar/link-round-bold-duotone` | `Open page` | `OpenPageButton.tsx` |
| Back | `solar/alt-arrow-left-linear` | `Back` | Navigation, so `linear` |
| More actions | `solar/menu-dots-bold` | `More actions` | Overflow menu. Reference: `IntakeRowMoreMenu.tsx` |
| Fetch metadata | `solar/magic-stick-3-bold-duotone` | `Fetch metadata` | Opens the MyAnimeList lookup (`LookupTrigger`'s `icon` variant): Intake rows, Editor, and the Create card header beside Remove |
| Undo autofill | `solar/undo-left-linear` | `Undo autofill` | Create card header, after a metadata lookup. The Editor still shows a text button; align it when that surface is touched |
| Re-analyze folder | `tabler/refresh` | `Re-analyze folder` | Measures the folder's episodes again. The tooltip appends the disabled reason (`Re-analyze folder · Set a folder first`). A circular arrow fits here because nothing nearby is Repeat or Restore |
| Open schedule editor | `solar/calendar-linear` | — | A primary action with its text and the calendar icon, not icon-only (Editor's Schedule card) |

**Repeat is not Restore, and neither is an arrow in a circle.** In most sets both are circular
arrows, and at 18px they cannot be told apart: the Details review rejected `repeat` + `restart` for
exactly that. Each glyph follows its domain meaning instead: Repeat is "watch it again from the
start" (`rewind-back`, a player shape), Restore is "take it back out of the deleted" (`archive-up`,
a box, the opposite of Delete's bin). Do not use `repeat`, `restart`, `refresh`, `history` or any
other circular arrow for either action; the brainstorm of rejected candidates (`clapperboard-play`,
`play`, `ticket`, `calendar-add`, `inbox-out`, `archive-check`, `eye`) is recorded in the changelog.

## Action groups

- **All record actions are icon-only at the same level** (`IconActionButton`, `variant="tertiary"`,
  `size="sm"`) when they sit in a group, as on the anime Details toolbar (Repeat, Restore, Edit). A
  mutation that needs a confirmation dialog is still a secondary action: the dialog's Confirm button is
  where the text and the `primary` variant live.
- **Order: the action that is always present sits at the outer edge**, conditional ones toward the
  inside. In a right-aligned group the always-present action is rightmost, so it never moves when the
  others appear or disappear (Details: Repeat and Restore appear by state, Edit is always rightmost).
- While a mutation is running, every action in the group is disabled (`isDisabled={isMutating}`), not
  only the one that started it.

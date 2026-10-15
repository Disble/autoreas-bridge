# Empty states

Source JSDoc in `shared/ui/AirisEmptyState`, `shared/ui/AwaitingSelectionPane`, the Notifications
empty state and the layout fixture cites this file. Component APIs are in
`components/airis-empty-state.md` and `components/awaiting-selection-pane.md`.

An empty state renders only for a **resolved** request (`loading-empty-error.md`). Loading shows a
skeleton; failure shows an `Alert`.

## The five kinds of emptiness

| Kind | It means | Shows | Action |
|---|---|---|---|
| `first-run` | Nothing exists here yet | The mascot | One primary action that creates the first thing (for example "Create an anime") |
| `waiting-on-step` | An earlier step has not produced anything yet | The mascot, slightly smaller | Primary, opening that step (for example "Go to Season") |
| `filtered` | Rows exist, but the user's search or filters hide all of them | A neutral magnifier icon, never the mascot | Secondary "Clear search and filters", only when the surface already has a reset |
| `caught-up` | Empty means done (nothing unread, a closed season, a finished queue) | A success check icon, never the mascot | Usually none |
| `awaiting-selection` | A detail pane before a row is selected | `AwaitingSelectionPane`: icon circle and dimmed real labels, never the mascot | None |

Split a surface's cases honestly. Catalog and the Editor rail have both an actual-empty case
(`first-run`, mascot, Create) and a criteria-empty case (`filtered`, icon, Clear); they are different
states with different copy, not one message.

## Layout

- **One alignment axis**: art left, copy and action left-aligned on its right; in a narrow container
  the art stacks over the copy and stays on the same left edge. Never a centered tall column floating
  in empty width (the user rejected that as unbalanced).
- **Size by the container**: the artwork size follows the container width; `size` only says where the
  block sits (`card`, `section` inside a wider card, `row` inside a list or board).
- A `row` always uses an icon, so a board or accordion with many empty sections never multiplies the
  mascot.

## At most one mascot per screen

- If several empty blocks can be visible at once, at most one shows the mascot; the rest use `row` or
  an icon kind. Example: an accordion that can open several watches shows per-watch empty lists as
  `row`s, and only the All-episodes list keeps the mascot `section`.
- Inside a modal, prefer an icon kind (the MAL lookup no-match is `filtered`).

## Copy

- **Never repeat the chrome.** The card title, tab name or page heading already says where the user
  is; the empty state says why it is empty and what happens next.
- Copy is fidelity-safe only when it is true for this view. Borrowing another view's wording works
  only when both views group the data the same way (Today's season lens filters the raw `Dias` value
  while the Daily board counts graduated weekday anime as Visto, so the board's Visto copy was false
  on Today). When no true story exists, use neutral copy ("Nothing here right now").
- Feature constants own the copy; shared labels come from `airis-empty-state.constants.ts`.

## The action

- At most one, and it is the **real next step**, wired to a callback the surface already has
  (`navigate('/season')`, an existing create handler, an existing filter reset).
- No action is better than an invented one. If the surface has no reset, a `filtered` state has no
  "Clear" button; adding a reset is new logic and is priced as such
  (`process/mockup-fidelity-and-pricing.md`).

## Mascot catalog

Assets live in `frontend/src/assets/airis-empty-states/`.

| Pose | File | Used by |
|---|---|---|
| Catalog | `catalog.webp` | Catalog panel actual-empty |
| Editor library | `editor-library.webp` | Anime Editor library rail; Editor Episodes section |
| Season | `season.webp` | Season Overview, Intake, Evaluation, Selection, Ordering |
| Today | `today.webp` (calendar and clock: "once something happens") | Today schedule, History timeline, anime watch history, Notifications never-recorded list, Overview final lineup (as a row, so it renders an icon) |

The catalog is open: the Notifications list borrows the Today pose until a notifications pose exists.

### Adding a new pose

1. Draw it against the character contract in `docs/design/airis/character.md` (model sheet
   `docs/design/airis/turnaround.webp`); props change per scene, the character does not.
2. Export a **512px square WebP** to `frontend/src/assets/airis-empty-states/<name>.webp`
   (kebab-case name, after the surface or idea it illustrates).
3. Import it in the feature and pass it as `imageSrc` to a mascot kind (`first-run` or
   `waiting-on-step`).
4. Add a composition for it in `frontend/scripts/layout-fixtures/airis-empty-states-fixture.tsx` with
   its real production copy, and run `bun --cwd="frontend" run layout:smoke`.
5. Add the pose to the table above.

New artwork is a design asset, not a code change; using it on a surface that had no mascot is still
bound by "at most one mascot per screen".

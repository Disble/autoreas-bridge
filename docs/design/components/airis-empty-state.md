# `AirisEmptyState`

`frontend/src/shared/ui/AirisEmptyState/` is the shared shell for a **resolved-empty** result. The
feature keeps ownership of the classification (which kind), the copy and the recovery behavior; the
shell only renders. When to use which kind, and the mascot catalog, are in `patterns/empty-states.md`.

## API

| Prop | Type | Notes |
|---|---|---|
| `title` | `string` | Visible, concise explanation of the empty result |
| `description` | `string` | Supporting guidance |
| `action` | `{ label, onPress }` (optional) | At most one; the real next step through a callback the surface already has |
| `size` | `'card' \| 'section' \| 'row'` (optional, default `card`) | Placement, not art size |
| `kind` | `'first-run' \| 'waiting-on-step' \| 'filtered' \| 'caught-up'` | `first-run` when omitted |
| `imageSrc` | `string` | Required for the mascot kinds; forbidden (`never`) for the icon kinds |

The props are a discriminated union (`airis-empty-state.types.ts`):

- Mascot kinds (`first-run`, `waiting-on-step`) require `imageSrc`, a Vite-imported asset from
  `frontend/src/assets/airis-empty-states/`.
- Icon kinds (`filtered`, `caught-up`) take no `imageSrc`; passing one is a type error. They never
  show the mascot.

## Kinds

| Kind | Artwork in `card` / `section` | Action weight |
|---|---|---|
| `first-run` | the mascot | `primary` |
| `waiting-on-step` | the mascot, one step smaller on a wide container | `primary` |
| `filtered` | magnifier icon on a neutral disc (`bg-default text-muted`) | `secondary` |
| `caught-up` | check icon on a success disc (`bg-success/15 text-success`) | `primary` (usually no action) |

The weight comes from `getAirisEmptyStateActionVariant`: clearing filters undoes something the user
did, so it is secondary; every other action is the next step and is primary.
Icons come from `getAirisEmptyStateIcon`: magnifier for `filtered`, check circle for `caught-up`, and
an inbox for the mascot kinds when they are drawn as a row.

## Sizes (placement)

- **`card`** (default) — its own `Card`; `Card.Content` is the size container (`@container px-2 py-2`).
- **`section`** — no card of its own: it fills a section of a wider card on the secondary surface
  (`@container rounded-3xl bg-surface-secondary py-4 pr-6 pl-4`). Card vs section is about the
  surface, not size.
- **`row`** — one line inside its host card: a 32px icon disc, a small `h3` title and the description,
  and the action (if any) as a small button pushed right. A row **always shows an icon**, even for a
  mascot kind (which still has to pass `imageSrc` to satisfy the type, as Overview's lineup does).

Retired: the old `default` / `compact` / `inline` sizes, and the "future third size" plan. Callers
were renamed `inline` → `section`, `compact` → `row`.

## Container sizing

`card` and `section` share one split layout (`AIRIS_SPLIT_CLASS`) whose geometry and artwork size
follow the **container width** through Tailwind v4 container queries, not a prop:

| Container | Layout | `first-run` art | `waiting-on-step` art |
|---|---|---|---|
| below `@xs` (20rem) | stacked: art over copy, left-aligned | 88px (`size-22`) | 88px |
| `@xs` to `@xl` (36rem) | split: art in an `auto` column, copy in `minmax(0,1fr)` | 104px (`size-26`) | 104px |
| `@xl` and up | split | 144px (`size-36`) | 120px (`size-30`) |

- One alignment axis: art left, copy and action left-aligned beside it; the stacked fallback is
  left-aligned too.
- The copy column is pinned to the second track (`@xs:col-start-2`), so a failed artwork leaves the
  copy where it was. The icon kinds show a 48px disc in the art column.
- Assets are authored at 512px square for high-DPI panels. 512 is a source size, never a display
  size; `object-contain` keeps the art undistorted and `shrink-0` stops long copy squeezing it.
- The description is capped at `max-w-xl`.

## Artwork failure

`useAirisEmptyState` drops the `<img>` on `onError`, so a failed asset degrades to nothing instead of
a broken-image glyph. It happens in the dev loop: under `wails dev` the shell proxies asset requests
to Vite (`frontend:dev:serverUrl: "auto"`), and requests made while Vite restarts fail with
`connectex`. A built binary embeds the assets, so it cannot happen there.

## Shared labels

`airis-empty-state.constants.ts` exports `AIRIS_CREATE_ANIME_LABEL` ("Create an anime") and
`AIRIS_CLEAR_CRITERIA_LABEL` ("Clear search and filters"). Use them rather than retyping the words.

## Verification

`frontend/scripts/layout-fixtures/airis-empty-states-fixture.tsx` mounts the production shell with
production copy and real asset bytes in headless Edge and measures, per placement: the decoded
512px intrinsic size, the display size per container width (88 / 104 / 144px for `first-run`,
120px wide and 88px in a rail for `waiting-on-step`), square aspect, art inside the card, copy beside
the art (split) or on the art's left axis (stacked), and a height budget (240px split, 480px
stacked). It covers the Today, Editor Library and Catalog compositions, the Editor Episodes
`section`, and Season Evaluation as the `waiting-on-step` reference. Setting the waiting class to
the first-run `@xl:size-36` makes the Evaluation check fail at 144px, so the 120px step is guarded.

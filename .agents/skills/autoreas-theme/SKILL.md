---
name: autoreas-theme
description: "Living design-system guide for the autoreas-bridge frontend. Use BEFORE building or refactoring ANY UI under frontend/src — it tells you which HeroUI v3 component to use instead of hand-rolling divs/buttons/tables, the project's semantic color tokens, and the domain/level color conventions. Keywords: theme, design system, UI, rebrand, restyle, frontend component, HeroUI, Tailwind, styling, feature UI."
metadata:
  author: autoreas-bridge
  version: "1.0.9"
  scope: project
  updates: living
---

# autoreas-bridge — Theme & Design System (living)

This is the project's UI source of truth. **The mandate: never hand-roll a `<div>`/`<button>`/`<table>`/`<input>` when a HeroUI v3 primitive exists.** HeroUI runs on React Aria — you get focus management, keyboard nav, and ARIA for free. Rebuilding that by hand is a regression, not a redesign.

> Cautionary tale: the `network` feature was originally built with raw HTML and had **1/8** components on HeroUI while the rest of the app used it in 18 files. It was migrated to **8/8**. Do NOT recreate that drift. If you find a feature on raw HTML, prefer migrating it to HeroUI.

## Stack (verified)

- **HeroUI v3** (`@heroui/react`, `@heroui/styles` — `^3.2.x`) on **Tailwind CSS v4** + **React Aria**.
- `frontend/src/style.css` is just: `@import "tailwindcss";` then `@import "@heroui/styles";` (order matters). **No theme overrides** — tokens are HeroUI defaults.
- **No provider** needed (v3). Use **compound components** (`Card.Content`, `Tabs.Tab`, `Table.Row`). Use **`onPress`**, not `onClick`, on HeroUI interactive components.
- For exact component APIs, fetch live docs via the `heroui-react` skill (`node scripts/get_component_docs.mjs <Component>`). The repo version may be ahead of that skill's cache — **code/docs of the installed version win**.

## Component mapping — what to reach for

| Need | Use (HeroUI v3) | Do NOT |
|------|-----------------|--------|
| Heading / body text | Installed `@heroui/react@3.2.1` exports `Typography` (`type="h1".."h6" \| "body" \| "body-sm" \| "code"`, `color="muted"`). Verify `node_modules` exports when package versions drift. | raw `<h1>/<p>` or unverified stale-node_modules imports |
| Text / search filter | `SearchField` (`.Group/.SearchIcon/.Input/.ClearButton`) or `Input` | raw `<input>` |
| Single-select filter row | `ToggleButtonGroup` + `ToggleButton` (renders a **radiogroup** → `role="radio"`, `disallowEmptySelection`) | rows of `<button>` pills |
| Dropdown select | `Select` + `ListBox` + `ListBox.Item` | raw `<select>` |
| Tabbed sections | `Tabs` (`.ListContainer/.List/.Tab/.Panel`, `selectedKey`/`onSelectionChange`) | `<button>` tab strip |
| Data grid / log table | `Table` (`.ScrollContainer/.Content/.Header/.Column/.Body/.Row/.Cell`) | raw `<table>` |
| Card / panel container | `Card` (`.Content`) or `Surface` (`variant="default\|secondary\|tertiary"`) | bordered `<div>` |
| Inline status banner | `Alert` (`status="default\|accent\|success\|warning\|danger"`, `.Indicator/.Content/.Title/.Description`) | colored `<div>` |
| Dismiss / close | `CloseButton` (`onPress`, `aria-label`) | `<button>×` |
| Tag / badge | `Chip` (`color=... size="sm" variant="soft\|tertiary"`, plain text child) | styled `<span>` |
| Scrollable region | `ScrollShadow` or `Table.ScrollContainer` | `overflow-auto` div (unless you need raw scroll control) |

## Color conventions (semantic, NOT raw colors)

Semantic tokens in use: `accent`, `success`, `warning`, `danger`, `default`, plus `foreground`, `muted`, `default-400/500`, `content1`, `divider`. Soft variants exist (`*-soft`). Always pass `color="success"` etc. to HeroUI components — never hardcode hex/oklch. White-alpha utilities (`bg-white/[0.03]`) are used for subtle hover/surfaces.

**Log LEVEL → color** (mirror across the app — `ObservabilityPanel` and `network`):
`info → success` · `warn → warning` · `error → danger` · `debug → accent` · default → `default`.

**Runtime DOMAIN → color**:
`anime → success` · `sync → accent` · `websocket → warning` · `api → danger` · `bus → default` · default → `default`.

These mappings live in `*-panel.helpers.ts` (`getNetworkLevelColor`, `getNetworkDomainColor`, etc.). Reuse the helper; don't re-derive the switch.

**Anime `estado` → canonical LABELS** (Legacy domain vocabulary, Spanish data literals like "Sin ver"/"Ver hoy"/"Visto"): `0 → Viendo · 1 → Finalizado · 2 → No me gusto · 3 → En pausa`. The wording lives in ONE place — `frontend/src/shared/constants/anime-estado.ts` (`ANIME_ESTADO_LABELS`, `getAnimeEstadoLabel`, `ANIME_ESTADO_FILTER_ENTRIES`). Import labels from there; **never re-hardcode estado wording in a feature** (History, Catalog, AnimeDetail, Chapters all consume this module — a deliberate, scoped exception to per-feature colocation so a rewording is a one-file change). This corrected a three-way drift where estado 2/3 were mislabeled "Abandonado"/"Pendiente" (ES) and "Dropped"/"Paused" (EN). **Estado COLORS stay feature-local** (presentation, not vocabulary): the established mapping is `Viendo → accent · Finalizado → success · No me gusto → danger · En pausa → warning`.

## Brand & action hierarchy (bridge's OWN theme — never Legacy's colors)

The bridge's brand colors are HeroUI's token pair, NOT Legacy's Materialize red/blue:

- **Primary action** = `Button variant="primary"` → `--accent` (oklch(0.6204 0.195 253.83), the brand blue). One per action cluster: the action the user came to perform (e.g. Chapters "+").
- **Secondary action** = `Button variant="secondary"` → `--default` surface with `--accent-soft-foreground` text. The counterpart of the primary in a paired control (e.g. Chapters "−").
- **Utility actions** = `variant="tertiary"` icons that TINT with intent on hover via Tailwind semantic utilities: folder → `hover:text-success`, page/link → `hover:text-accent`, status → `hover:text-warning`. Color-on-interaction is a UX signal (Legacy did this with green/blue/yellow); port the *pattern* with bridge tokens, never Legacy's literal hues.
- Rule of thumb when porting Legacy UI: ask "what ROLE does this color play?" and map the role to a bridge token. Copying Legacy hex/danger-for-red is a regression (user-rejected in the SDD-38→hotfix cycle).

## Chart palette (nivo, literal hex)

`@nivo/bar` (the only charting dependency, SDD-47) cannot consume Tailwind classes or HeroUI `color` props — it needs literal color strings, because HeroUI v3 exposes no readable CSS variable for it. Every chart color below is a literal hex constant in `frontend/src/features/season/ui/OverviewPanel/overview-panel.constants.ts`, sourced from the HeroUI dark tokens actually in effect and validated against the active dark surface (`--surface #18181B`).

**Surface & ink (chart chrome):**

| Role | hex | source |
|---|---|---|
| Chart surface (Card bg) | `#18181B` | `--surface` (dark) |
| Page plane behind cards | `#09090B` | `--background` (dark) |
| Primary ink (labels/values) | `#FCFCFC` | `--foreground`/`--snow` |
| Muted ink (axis/ticks) | `#9F9FA9` | `--muted` |
| Gridline / hairline | `#27272A` | `--border` |

**Semantic status set** (effective dark tokens): accent `#0385F7` · success `#17C964` · warning `#F7B750` · danger `#DB3B3E`.

**Chart-tuned neutrals** — the HeroUI `--default` dark token (`#27272A`) is only one lightness step off the `#18181B` card surface and is **invisible as a chart bar fill**; charts use lifted zinc-hue grays instead (same hue, snapped into the dark lightness band): neutral/in-progress `#71717A` (zinc-500) · de-emphasis `#62626C`.

**Categorical set — intake health** (5-segment stacked bar, workflow order; HeroUI chip tokens FAILED the dark-mode lightness band as bar fills — these are chart-grade steps of the same hues, hold hue / move lightness):

| segment | role | hex |
|---|---|---|
| pending | neutral in-progress | `#71717A` |
| matched | chart-success | `#17AB55` |
| ambiguous | chart-warning | `#C58703` |
| not_found | danger | `#DB3B3E` |
| discarded | de-emphasis | `#62626C` |

Colors resolve through `getIntakeHealthSegmentColor` (`overview-panel.helpers.ts`), which delegates the semantic role to `getMatchStatusColor` (`intake-panel.helpers.ts`) and never re-derives it — `discarded` is the one exception, since `getMatchStatusColor('discarded')` resolves to the same `default` role as `pending` but the validated palette gives it its own de-emphasis gray. The `discarded` segment's contrast lands at 2.94:1 (WARN) — relief is the legend + per-segment tooltip counts, which are OBLIGATORY on this chart (never drop them).

**Ordinal set — watching pipeline** (Sin ver → Ver hoy → Visto; a light→dark single-hue ramp of the accent blue, NOT the estado status mapping — these are conveyor *stages*, not good/bad statuses): Sin ver `#5CA7FF` → Ver hoy `#0385F7` (the accent) → Visto `#0061C0`.

**Emphasis pair — grade histogram** (at/above `minApprovalGrade` vs below it — emphasis highlights the relevant side rather than implying pass/fail per bar): emphasis `#0385F7` · de-emphasis `#62626C` · threshold hairline + "Min N" label ink `#9F9FA9` (muted), drawn as a custom nivo layer at the band boundary.

## Card cover slot pattern (full-bleed edge image)

`.card` (HeroUI) has `p-4` and `border-radius: min(32px, var(--radius-3xl))`. For an edge-flowing image column inside a Card (Chapters schedule): give the Card `overflow-hidden`, and the slot `relative -my-4 -ml-4 w-24 shrink-0 self-stretch overflow-hidden` — the negative margins bleed through the padding and the Card clips the corners. Put the art `absolute inset-0 size-full object-cover` (or an SVG with `preserveAspectRatio="xMidYMid slice"`) so the source aspect ratio can NEVER change the card height. Add `gap-4 min-h-24` on the flex row for breathing room and consistent card presence. Default cover art is `shared/ui/CoverPlaceholderScene.tsx` (night bridge scene) — full-bleed, not an icon centered in a gray box.

## Toast feedback

`toast` from `@heroui/react` (`toast.success/danger/warning/info`). Backend notifications flow through `use-notification-toasts` (the only `notification.push` subscriber). For LOCAL imperative feedback (e.g. clipboard copy confirmations), hooks call `toast.success(...)` directly in the mutation callback — English copy, e.g. "Folder path copied to clipboard". Mock pattern for hook tests: `vi.hoisted` toast object + `vi.mock('@heroui/react', () => ({ toast: toastMock }))` (see `use-chapter-schedule-panel.test.ts`).

## Architecture constraints (from CLAUDE.md — enforced)

- `.tsx` under `features/` are **dumb UI only**: no Wails calls, no `useEffect`, no business logic. Logic goes in `use-*.ts` hooks (strict anatomy) and pure `*.helpers.ts` (every exported helper has JSDoc).
- Every prop in `*Props` interfaces is `readonly`. Routes/`app/**` are composition-only.
- **TDD is mandatory** for helpers and hooks (colocated `__tests__/`). Files over 500 lines get refactored.

## Testing notes (React Aria in jsdom)

- React Aria `usePress` **responds to native `.click()` / `fireEvent.click`** (virtual press) — selection, tab change, and `CloseButton.onPress` fire without `@testing-library/user-event` (not installed).
- A single-select `ToggleButtonGroup` exposes its options as **`role="radio"`**, not `role="button"`. Query accordingly.
### HeroUI Table sizing & scrolling — verified facts

- **App shell uses PAGE-level scroll.** `AppLayout`'s `<main>` has no `overflow`; the root is `min-h-screen`, so the window scrolls. No app-level internal scroll container.
- **`.table-root` is `display:grid` with `grid-template-columns: minmax(0,1fr)` — a hard width boundary.** If table content is wider than the boundary it overflows; `Table.ScrollContainer` (`overflow-x-auto`) then shows a horizontal scrollbar. **Setting `overflow-x-clip` on it instead CLIPS the last column (data loss) — verified, do NOT do that.**
  - **Fix: make the table fit.** `Table.Content` → `className="w-full table-fixed"` and give each `Table.Column` an explicit width (e.g. `w-[92px]`), leaving the one flexible column (Message) widthless to take the remainder. Cells truncate with `block truncate` (no `max-w` needed under `table-fixed`). Result: no horizontal scrollbar, no clipping.
- **`Table.ScrollContainer` scrolls HORIZONTALLY only** (`@apply overflow-x-auto`) and is a plain function component (no `forwardRef`). For a vertical/live feed, wrap `Table` in your own `max-h-… overflow-y-auto` div and keep `scrollRef` on THAT div (it is the vertical scroller — confirmed by an internal scrollbar in the running app).
- **Stick-to-bottom (CURRENT approach, pending final runtime confirmation):** in a `useLayoutEffect` on `[rows]`, set `wrapper.scrollTop = wrapper.scrollHeight` both synchronously and inside one `requestAnimationFrame` (to survive any post-render scroll reset). A jsdom regression test mocks geometry via `Object.defineProperty(node,'scrollHeight'|'clientHeight'|'scrollTop', …)` and asserts `scrollTop` reaches `scrollHeight`.
- **What did NOT work (do NOT retry):** `scrollTop` on the wrapper **while guarded by a `pinned` flag updated from `onScroll`** (the guard was false when entries arrived, blocking every scroll — this was the real cause of the failures, not the scroll mechanism); `bottom sentinel + scrollIntoView({block:'nearest'})`; `overflow-x-hidden` on `ScrollContainer` (CSS promotes Y to `auto`, creating a competing scroller); `overflow-x-clip` (clips the last column); `[scrollbar-gutter:stable]` alone for the header-corner overlap; resolving the scroll node via `querySelector('[data-slot="table-scroll-container"]')`.

## Keeping this skill alive

This is a **living** document. When you establish a new UI convention, adopt a new HeroUI component, change a token mapping, or hit a non-obvious React-Aria gotcha — **update this file** and bump `version`. Add a line to the changelog.

### Changelog
- `1.0.9` — Added the "Chart palette (nivo, literal hex)" section (SDD-47, `OverviewPanel`'s watching-pipeline/intake-health/grade-histogram charts): the surface/ink neutrals, the semantic status set, the chart-tuned neutrals, the validated categorical intake set (with its `getMatchStatusColor`-role mapping and the `discarded`-gray exception), the ordinal pipeline ramp, and the histogram emphasis pair. Documented the `--default`-dark-invisible-as-bar gotcha: HeroUI's `--default` dark token (`#27272A`) is one lightness step off the `#18181B` card surface and disappears as a bar fill, so charts use lifted zinc-hue grays (`#71717A`/`#62626C`) instead.
- `1.0.8` — Added the canonical anime `estado` vocabulary rule (SDD-40): labels live in `shared/constants/anime-estado.ts`, imported everywhere (scoped exception to per-feature colocation); colors stay feature-local. Fixed the three-way label drift (2/3 were "Abandonado"/"Pendiente" and "Dropped"/"Paused"; Legacy truth is "No me gusto"/"En pausa").
- `1.0.7` — Added the brand & action hierarchy section (primary=accent / secondary=default+accent-soft; hover intent tints for utility icons), the full-bleed card cover slot pattern (negative-margin bleed + absolute art, aspect-ratio-proof), and the toast feedback convention — all from the Chapters card hotfix after the user rejected Legacy-literal red/blue.
- `1.0.6` — Corrected the main-worktree package reality: `@heroui/react@3.2.1` exports `Typography`. A stale Codex worktree had `3.0.2` exports (`Text`), which broke `wails dev` on real `main`; always verify against the target worktree's installed package.
- `1.0.5` — Corrected the text primitive for the installed package: `@heroui/react@3.0.2` exports `Text`, not `Typography`. Newer docs mention `Typography`, but installed code wins; verify exports before importing docs-only components.
- `1.0.4` — Root-caused the scroll failures: the `pinned` guard (updated from `onScroll`) was false when entries arrived, blocking every auto-scroll regardless of mechanism. Removed the guard (feed always sticks to bottom for now) and reverted to `scrollTop` (sync + rAF). Fixed column clipping with `table-fixed` + per-column widths (replacing the harmful `overflow-x-clip`). Removed the sentinel/`scrollIntoView` approach and its jsdom stub. Autoscroll pending final user confirmation.
- `1.0.3` — (superseded) Claimed a bottom sentinel + `scrollIntoView` fixed stick-to-bottom. It did NOT; see 1.0.4.
- `1.0.2` — (superseded) Claimed `overflow-x-clip` + `[scrollbar-gutter:stable]` fixed stick-to-bottom. It did NOT; see 1.0.3.
- `1.0.1` — (superseded) Claimed an `overflow-y-auto` wrapper with `scrollTop` fixed stick-to-bottom. It did NOT; see 1.0.3.
- `1.0.0` — Initial guide. Captured stack, component mapping, level/domain color conventions, and React-Aria-in-jsdom testing notes after the `network` feature migration to HeroUI (1/8 → 8/8).

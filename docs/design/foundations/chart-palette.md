# Chart palette (nivo, literal hex)

`@nivo/bar` (the only charting dependency, SDD-47) cannot consume Tailwind classes or HeroUI `color`
props; it needs literal color strings, and HeroUI v3 exposes no readable CSS variable for it. Every
chart color below is a literal hex constant in
`frontend/src/features/season/ui/OverviewPanel/overview-panel.constants.ts`, sourced from the HeroUI
dark tokens in effect and validated against the active dark surface (`--surface #18181B`).

## Surface and ink (chart chrome)

| Role | Hex | Source |
|---|---|---|
| Chart surface (Card background) | `#18181B` | `--surface` (dark) |
| Page plane behind cards | `#09090B` | `--background` (dark) |
| Primary ink (labels, values) | `#FCFCFC` | `--foreground` / `--snow` |
| Muted ink (axis, ticks) | `#9F9FA9` | `--muted` |
| Gridline, hairline | `#27272A` | `--border` |

## Semantic status set

Effective dark tokens: accent `#0385F7` · success `#17C964` · warning `#F7B750` · danger `#DB3B3E`.

## Chart-tuned neutrals

HeroUI's `--default` dark token (`#27272A`) is one lightness step off the `#18181B` card surface and
is **invisible as a bar fill**. Charts use lifted zinc-hue grays instead (same hue, snapped into the
dark lightness band): neutral / in-progress `#71717A` (zinc-500) · de-emphasis `#62626C`.

## Categorical set — intake health

A five-segment stacked bar in workflow order. HeroUI chip tokens FAILED the dark-mode lightness band
as bar fills; these are chart-grade steps of the same hues (hold hue, move lightness).

| Segment | Role | Hex |
|---|---|---|
| pending | neutral in-progress | `#71717A` |
| matched | chart-success | `#17AB55` |
| ambiguous | chart-warning | `#C58703` |
| not_found | danger | `#DB3B3E` |
| discarded | de-emphasis | `#62626C` |

Colors resolve through `getIntakeHealthSegmentColor` (`overview-panel.helpers.ts`), which delegates
the semantic role to `getMatchStatusColor` (`intake-panel.helpers.ts`) and never re-derives it.
`discarded` is the one exception: `getMatchStatusColor('discarded')` resolves to the same `default`
role as `pending`, but the validated palette gives it its own de-emphasis gray. Its contrast lands at
2.94:1 (WARN); the relief is the legend plus per-segment tooltip counts, which are OBLIGATORY on this
chart. Never drop them.

## Ordinal set — watching pipeline

Sin ver → Ver hoy → Visto is a light-to-dark single-hue ramp of the accent blue, NOT the estado
status mapping: these are conveyor stages, not good or bad statuses.
Sin ver `#5CA7FF` → Ver hoy `#0385F7` (the accent) → Visto `#0061C0`.

## Emphasis pair — grade histogram

At or above `minApprovalGrade` versus below it; emphasis highlights the relevant side rather than
implying pass or fail per bar. Emphasis `#0385F7` · de-emphasis `#62626C` · threshold hairline and
"Min N" label ink `#9F9FA9` (muted), drawn as a custom nivo layer at the band boundary.

## Bucket set — selection outcome

Approved / rejected / no grade, the three buckets that confirming the season applies
(`SelectionOutcomeChart`): approved `#17AB55` · rejected `#DB3B3E` · no grade `#71717A`.

- No new hex: the trio reuses the intake-health success/danger literals and the chart-tuned neutral,
  the one gray that stays visible as a fill on `#18181B`.
- Resolved by the literal lookup `SELECTION_OUTCOME_CHART_COLORS` (`overview-panel.constants.ts`),
  not by a semantic-role helper: the buckets are keyed by display label, not by a backend status.
- The legend is the second identification channel for the neutral segment.
- The backend applies an ungraded created candidate as rejected, so the card states that in visible
  copy, and a candidate with no grade must never be folded into approved. The bucket is "No grade",
  not "Not yet graded", because the same card renders a closed season where nothing is pending.

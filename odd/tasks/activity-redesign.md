# Activity redesign

Objective: rebuild the Activity screen as the single feed of `docs/observability/activity-ui-design-v2.md` (approved mockup `docs/observability/activity-ui-v2.mockup.html`, a byte copy of the OpenDesign project `activity-v2.html`). Branch `feat/activity-redesign` off `dev`, worktree `autoreas-bridge-worktrees/activity-redesign`.
Delivery: `ask-on-risk`. Runners: Go `go test ./internal/observability/activityread/ ./internal/desktop/`, mutation `ditto staged`; frontend Bun/Vitest (`bun --cwd="frontend" run test -- <path>`), `bun --cwd="frontend" run test:mutation:staged`, `render:smoke`.
Scope (L3): the Go side may only add read queries and bindings. No writes, no new events, no schema change.

## Specs

- S1 The design doc v2 is the behaviour contract: Feed, Time chart and range, Filters, Failure button, Detail drawer, Technical view, Event presentation model, Rejected. Each section is implemented as written there, except where S9 records a gap the data cannot back.
- S2 Rule (design doc): "no text states anything that is not in the stored data." Every row, chip, count and sentence comes from a stored field named in S3–S8. The mockup's sample data never ships ("Invented in the mockup").
- S3 Feed read (new binding `SearchActivityFeed`): one newest-first page over `[from, to]` (epoch ms, clamped to the 90-day `LedgerSpan`), origin (`all`, `phone`, `bridge`), the set of selected types, a failures-only switch with its failure types, cursor and limit. Filtering is done in SQL so paging never hides or invents rows ("A filter never lies").
- S4 Feed types and their sources (assumption A1, measured on a bridge.db copy, 2026-10-23):
  - Changes: `activity_log` rows with source `mobile` (origin phone).
  - Edits: `activity_log` rows with source `desktop` (origin bridge).
  - Traffic: one line per rollup hour from `request_rollup_hourly`, every route and device summed (`request_count`, failed = rows with `status_class >= 4`, slowest = `max_duration_ms`), plus failed phone reports (`device_telemetry_events` whose outcome is `failed`; see L6). Origin phone. WebSocket connects and disconnects are not feed lines.
  - Downloads: one line per `download_runs` row (trigger, status, counts). Download-domain runtime events are not feed lines; they are the run story. Origin bridge.
  - Tasks: runtime events of domains `schedule` and `season` (the existing `WhereSchedule` / `WhereSeason` scopes). Origin bridge.
  - Bridge: every other non-noise runtime event, including `api.listening` (shown as "Bridge started") and `frontend.error` (window errors). Not hidden by type filters. Origin bridge.
  - Incident occurrences mark the line they belong to as failed instead of being separate rows when they share its source; otherwise they are lines of the type of their source (`request` → Traffic, `mobile` → Traffic, `event` → the type of that event's domain).
- S5 Failed: a line fails when it is an incident, an `error` event, a run whose `status` is `error` or `episodes_failed > 0`, a traffic hour with any `status_class >= 4` row, or a phone report whose outcome is `failed`. Slow (amber): a `slow` incident or a warn event.
- S6 Overview read (new binding `GetActivityOverview`): for one range and origin, the chart slots (hourly for 24 h, daily for 7/30/90 days) with activity count and failed count, and per type the line count and failure count. The counts use the same classification as S3–S5, so "Every count follows the current range and origin".
- S7 Drawer details read through existing bindings where they exist (`GetActivityRunStory`, `GetActivityIncident`, `GetActivityRequest`, `ListActivityRecorder`) and through new read-only bindings only where none exists (one traffic hour's totals by route; one download run row).
- S8 Live: the feed keeps its progressive window when `activity.recorder` events arrive (ADR-012 live variant) and refreshes the overview counts.
- S9 Gaps the stored data cannot back, shown as nothing rather than invented: "Bridge stopped" rows and "Bridge off" bands and hatched bars (no stop or shutdown event is stored); "Pin this moment" stays only if `PinActivityMoment` keeps its current behaviour. Each gap is listed in the design doc under its own heading.
- S10 The old Now, Incidents, History tabs and the recorder overlay are removed together with their unused code; reusable pure helpers (`activity-source`, `history-source`, `change-words`, `activity-time.helpers.ts`, request/body helpers) are kept.
- S11 Frontend rules of CLAUDE.md apply: dumb `.tsx`, hook ordering, colocated folders, JSDoc, `readonly` props, ≤ 500 lines, HeroUI components, shortcuts through the keyboard registry (↑/↓/Esc of the drawer use a keyboard scope), loading/empty/failure exclusive.

## Tasks

| ID | Specs | Route | Status | Commit / evidence |
|---|---|---|---|---|
| T1 | S3, S4, S5 | inline | done | `Reader.Feed` + `SearchActivityFeed`; RED observed (`r.Feed undefined`), 12 feed tests GREEN; mutation see L9 |
| T2 | S6 | inline | done | `Reader.Overview` + `GetActivityOverview`; RED not run separately (would not compile), 4 overview tests GREEN; mutation see L9 |
| T3 | S7 | inline | pending | Go traffic-hour and run-row reads + bindings |
| T4 | S3, S6, S8 | inline | pending | frontend source, mappers, feed/overview hooks |
| T5 | S1, S2, S11 | inline | pending | screen: chart, range field, toolbar, failure menu, feed rows |
| T6 | S1, S2, S7 | inline | pending | drawer summary presenters, generic layer, cause catalog |
| T7 | S1, S7 | inline | pending | technical view: Requests, Events, Data |
| T8 | S9, S10 | inline | pending | remove old tabs, design doc gaps, render smoke |

Route evidence: no Writer trigger. The frontend units depend on the T1–T3 contract, so they are not independent parallel units.

## Log

- L1 (2026-10-23, user): "Vas a encargarte del aplicar el resideño a Activity en un worktree, ya te paso el prompt". Then the OpenDesign handoff: "Continue from this local OpenDesign project folder: C:\Users\User\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\d81b7101-7082-4363-bfce-6530b419f124 … Target: React … 1. Enter or read this directory first. Prioritize DESIGN.md, README, existing HTML/CSS/JS, assets, and package.json if present. 2. Preserve the current visual design, layout, interactions, and assets. Do not stop at a plan. 3. Generate or modify real runnable React code. If the project already has a clearer stack, call out the conflict and keep the result runnable. 4. Finish by telling me the run, preview, and verification commands. … Project: Bridge Redesign".
- L2 (2026-10-23, user): "Debes hacer lo del bloque 1. El segundo bloque solo debió haber referencia a dónde está documentación complementaria, pero se ha hecho bolas el agente". The complementary documentation is `docs/observability/activity-ui-design-v2.md`.
- L3 (2026-10-23, user, on adding Go time-range and aggregate reads): "Si es solo para queries, puedes modificar el backebd".
- L4 Stack conflict: the handoff says React; the repo stack is React + HeroUI v3 + Tailwind in Wails, so the mockup's hand CSS is mapped to HeroUI components and tokens, not copied.
- L5 Measurements on a bridge.db copy (2026-10-23): no bound read takes from/to; `request_rollup_hourly` holds hourly totals by route, status class and device; `download_runs` holds one row per run with `trigger` (`manual_anime`, `season-availability`, empty on older rows; the scheduler writes `scheduled`); domains `schedule` and `season` hold only `notification.forwarded` warnings ("Missed selected day …", "Past today's download window …"); `api.listening` is logged once per bridge start; no stop or shutdown event exists.
- L6 Decision (probe on the bridge.db copy): each phone episode press stores three phone reports (outcomes `ok`, `committed`, empty) next to its change line, which floods the feed like "Traffic as one line per request" (Rejected). A phone report is a feed line only when its outcome is `failed`; Feed and Overview apply the same rule.
- L7 Probe on the bridge.db copy (read-only, 2026-10-23): first feed page 5 ms, failures-only 4 ms, overview 24 h 1.6 ms, 90 d 9 ms. 90-day counts: changes 407, traffic 394 (72 failed), downloads 107 (5 failed), tasks 18, edits 61, bridge 68 (14 failed). Incident ids attach to traffic hours, failed phone reports and error events.
- L8 Incident links (measured): `mobile` source_id = `device_telemetry_events.event_id`; `event` occurrences have an empty source_id and match by `occurred_at_ms` + fingerprint `error_event|domain|event_type`; `request` source_id = `request_captures.request_id`, matched to its hour by `occurred_at_ms`.
- L9 Mutation, T1+T2 (`ditto staged`, scope activityread minus `feed_types.go` (INFRASTRUCTURE) and `history.go` (pure extraction, covered by the History suite)): run 1 hit the 15 min box with no report; run 2 (10 min, `-run Feed|Overview|History`) evaluated 111 of 151 mutants: 90 killed, 21 survived, 40 unevaluated (rest of `feed_sources.go`, all of `overview.go`; some mutants hang ~220 s on an unclosed query). Survivors: equivalent — `feed.go:106` `>`→`>=`, `:110` `<`→`<=`, `0`→`1`, `ToMS < toMS`→true (no row after now), `:31` fetch increment (over-fetch), `:13` `iota - 1` (traffic shares the event rank, both integer keys; the run takes the incident rank, not a feed source), `feed_counts.go:140` slice capacity. Killed with new tests and proven by hand mutation: rank order flip, fetch decrement, one-day grouping, hour overlap boundary, `episodes_failed >= 0`, both count loops `continue`→`break`. Unevaluated mutants are ledgered, not claimed.

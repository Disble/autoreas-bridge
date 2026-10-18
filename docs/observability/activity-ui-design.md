# Activity UI design (approved)

Approved by the owner on 2026-10-17. Source of truth for the visuals: the canvas "Activity 2026"
(https://claude.ai/artifact/7jLTYCTy8WUFqCUrKkD1X8, version 8). This page turns that canvas into a build
specification. The performance and data requirements are in `activity-ui.md`. Where this page and the
canvas disagree, update both together.

## Principles

- **Answer first, detail on demand.** Each view opens on one answer; raw rows are one step deeper.
- **Calm by default.** Healthy is quiet. Color is spent only on what needs attention: danger for errors,
  warning for slow or recovered, accent for new and interactive.
- **Gaps are drawn as gaps.** Missing data is never rendered as "nothing happened".
- **Internal work is first-class.** Downloads, editor, schedule and season sit beside phone and sync, behind
  one "where it happened" filter, not in a separate section.
- **Built from the design system** (`autoreas-theme`): HeroUI v3, soft chips, semantic colors, no raw hex.

## Navigation

```
Activity ── Tabs: Now · Incidents · History        [Pin this moment]
                    │          │            │
                    │          │            └─ filter: All · Phone and sync · Downloads · Editor · Schedule · Season
                    │          └─ same filter; an internal item opens its run story
                    └─ links into Incidents, History and the 2-hour recorder
```

The Activity route stays. The three tabs replace Overview, Transactions and Runtime Events, and the old
screen is deleted entirely: no code, tests, stores or bindings of it remain ("No legacy" in `rollout.md`).
The new UI is built fresh. It does not adapt the old components. "Pin this
moment" is a secondary `Button` with an icon. The tab strip is HeroUI `Tabs`, and each filter is a
`ToggleButtonGroup`.

## 1. Now: "is everything fine?"

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ● Phone and bridge are in sync              Requests today  Open  Changes │
│   Last contact 14 s ago · up 3 h 26 min        1,912         1      7     │
├───────────────────────────────────────────────────────────────────────────┤
│ Last 24 hours   ▁▂▃█▂▂▃▁▁▁ ┊┊┊┊┊┊┊┊ ▂▆▅▇▃   (red top = failed share,     │
│                                              dashed = bridge off)         │
├────────────────────────────────────┬──────────────────────────────────────┤
│ Needs a look                       │ Recent changes                       │
│ ! Sync failed for 5 requests [New] │ Date A Live IV · episode 10 → 11     │
│ ◷ The anime list is slow           │ Ao Ashi Season 2nd · episode 0 → 1   │
└────────────────────────────────────┴──────────────────────────────────────┘
  [Recording] See every request from the last 2 hours
```

| Element | Data | Component |
|---|---|---|
| Status sentence and dot | last phone contact, bridge session start, failures in the last hour | `Card`, `Typography` |
| Three figures | rollup (requests today), open incidents, write journal (changes today) | `Typography` with tabular numbers |
| 24-hour bars | hourly rollup; failed share per hour; bridge-off spans from lifecycle events | bar chart, `role="img"` with a text summary |
| Needs a look | open incidents, newest first, at most 3; errors and new first | list of links, soft `Chip` "New" |
| Recent changes | write journal, latest 5, in plain words ("episode 10 → 11 · from the phone") | list |
| Recorder link | the 2-hour recorder view (Live) | link with a success `Chip` "Recording" |

The status sentence has three wordings: in sync; "the phone has been quiet for N min" (neutral, not an
error); and "N problems need a look" (warning). The sentence is computed in Go, not in the component.

## 2. Incidents: "what went wrong, and why?"

```
┌──────────────────┬────────────────────────────────────────────────────────┐
│ Last 7 days      │ [Errors] [New]                                         │
│ ● Sync failed…   │ Sync failed for 5 requests at once        [Copy for AI]│
│ ● Write failed…  │ ┌ Cause: the bridge could not read its list of changes ┐│
│ ● List is slow   │ └ list_changes_failed · <stored error text>            ┘│
│ …                │ Phone    ─────────────────●──────                       │
│                  │ Requests ·  ·  ·  ·  ·  · ●●◐●● ·                       │
│                  │ Bridge   ─────────────────●───·──                       │
│                  │          −2 min                      +30 s              │
│                  ├────────────────────────────────────────────────────────┤
│                  │ Requests in this window (polls folded)                 │
│                  │ 17:31:04.120 POST /api/sync/reconcile  500   41 ms ◀    │
│                  │ { "error": "list_changes_failed", … }  (body on demand) │
└──────────────────┴────────────────────────────────────────────────────────┘
```

| Element | Data | Component |
|---|---|---|
| Incident list | incidents by fingerprint, last 7 days, newest first, one progressive batch | list, colored dot, soft `Chip` "New" |
| Header | fingerprint title in plain words, time span, context ("the phone was syncing") | `Typography`, soft `Chip`s |
| Cause | P1 error cause of the triggering record | danger `Alert` |
| Window lanes | the pinned window: phone reports, requests, bridge events; failures marked | positioned markers, `role="img"` with a text summary |
| Requests in this window | the window's requests, with polling folded into one row | `Table` |
| Selected request | **one row read by id**; the body shows its first lines, then a virtual viewer | code block, "Show full body" |
| Footer | earlier occurrences of the fingerprint, and when this one expires | `Typography` muted |
| Copy for AI | the incident as an MCP-ready reference | icon `Button` in a `Tooltip` |

An internal incident opens the run story (section 5) instead of the request window.

## 3. History: "what changed, and when?"

| Element | Data | Component |
|---|---|---|
| 90-day calendar | daily totals from the rollup; red ring on days with an incident; outlined empty squares before recording began | grid, `role="img"` with a text summary |
| Where filter | All · Phone and sync · Downloads · Editor · Schedule · Season | `ToggleButtonGroup` |
| Day groups | the ledger, one line per fact: writes, connections, lifecycle, recovered warnings, incidents | list grouped by day, progressive |
| Line chips | "Arrived late" (phone time ≠ bridge time), "Unclean stop", "Recovered", "Incident" | soft `Chip` |

Polling never appears line by line in History; it exists only as hourly totals. Older days load near the
bottom through a cursor.

## 4. States

| State | Render |
|---|---|
| Loading | a skeleton mirroring the Now layout, in `role="status"`, `aria-live="polite"`, with an `sr-only` label |
| First run | `AirisEmptyState` kind `first-run`: "Nothing recorded yet", primary action "Pair a phone" |
| Failure | danger `Alert`: "Activity could not read its history"; the rest of the app keeps working; "Try again" |
| Gap | a dashed block "No data · from … to …", with the reason when it is known (bridge off) and a note that phone changes may still arrive late |

Loading, empty and failure are exclusive. Each one has a test of the negative case: no real rows while
loading.

## 5. Inside the bridge: a run story

| Element | Data | Component |
|---|---|---|
| Run list | runs or saves of the chosen domain, last 7 days, with their outcome | list, soft `Chip` "Recovered" / outcome |
| Header | run kind, result in plain words, trigger, time span | `Typography`, soft `Chip`s |
| Steps | every event sharing the run's correlation id, in order; warnings and successes emphasized | vertical step list |
| Recorded detail | the selected event's metadata as labelled fields; probes or retries drawn as a sequence | field grid; "Show raw metadata" opens the JSON |
| Copy for AI | the run as an MCP-ready reference | `Button` |

## Rules

- **Only errors open an incident** (owner decision, 2026-10-17). A warning that recovers on its own appears
  in History as "Recovered" and never raises an alarm.
- Times show in the owner's local time. Phone facts show both times when they arrived more than 10 minutes
  late.
- All copy is English; anime titles and other data values stay as stored.

## Tests this design adds

- DOM count: each list renders one progressive batch.
- Detail read: opening an item issues one read by primary key (Go test on the query).
- Live cap: the recorder list holds at most 500 rows after 10,000 pushes.
- States: loading, empty, failure and gap render exclusively, each with its negative assertion.
- Filter: "where it happened" narrows Incidents and History to that domain's correlation ids.
- Status sentence: the three wordings follow last contact and open incidents (Go, table-driven).

# Archive Report: Activity DevTools Network View

**Archived:** 2026-08-30 (applied 2026-07-24)
**Applied by:** `e47e38e` — "feat(activity): turn Activity into a real DevTools Network tab over captured transactions"
**Archived by:** SDD-65 Slice 0 (close the SDD debt) — documents only, no runtime change.

## What shipped

The Activity route stopped rendering `ObservabilityLogEntry` rows as if they were HTTP
transactions and started reading captured transactions through in-process Wails bindings
(`App.ListCaptureTransactions` / `App.GetCaptureTransaction`, `app_captures.go:12,26`).

## Specs merged into `openspec/specs/`

| Domain | Action | Detail |
| --- | --- | --- |
| `activity-network-transactions` | **Created** | Full spec: In-Process Transaction Read Binding, Transaction List Filtering, Transaction List View, Transaction Detail Inspector, Read-Only Sanitized Data Only. The two middle requirements were later replaced by `capture-middleware-realtime` and `activity-transaction-inspect-ui`. |
| `observability` | Updated | 1 MODIFIED: Dashboard Feed Stays Live. |

## Drift corrected, not tidied away

Four `[x]` tasks describe artefacts the code no longer has. They stay ticked — the work was
performed — with an inline **DRIFT** note naming the commit that removed each result:

| Task | Claimed | What actually happened |
| --- | --- | --- |
| 4.3 | `__tests__/EventsRoute.test.tsx` | Added by `e47e38e`, deleted by `e92c236` (2026-08-03). |
| 4.4 | `EventsRoute.tsx` + `/events` route | Added by `e47e38e`, deleted by `e92c236` as a dead route. `/events` is now `<Navigate replace to="/activity/runtime-events" />` (`frontend/src/App.tsx:37`). |
| 4.5 | "Events" nav entry | Added by `e47e38e`, removed by `7acb738` (2026-07-25), which folded the event log into Activity as a tab. The `system` group has one Activity entry (`app-layout.constants.ts:41`). |
| 4.6 | leave `NetworkRoute.tsx` untouched | Left untouched as instructed; the file was later deleted by `e92c236`. `/network` is now `<Navigate replace to="/activity" />`. |

The same drift is recorded against the live spec: `openspec/specs/observability/spec.md`
"Dashboard Feed Stays Live" carries a drift note, because the requirement text merged here
mandates a separate "Events" route that no longer exists. Slice 0 merged the baseline **as
it stands** and did not pre-amend it; amending is SDD-65 Slice A's job.

## Tasks

30/30 complete.

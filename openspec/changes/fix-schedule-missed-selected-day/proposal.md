# Proposal: Fix schedule missed selected day

## Intent
Extend the already-implemented missed-notice backend + Downloads inline alert into a global HeroUI Toast decision/failure flow, so startup on a missed selected day surfaces one clear decision notice immediately without changing scheduler timing rules or adding auto-download.

## Scope
### In scope
- Make the app shell the primary missed-schedule decision surface via a persistent HeroUI Toast on app open.
- Keep Downloads SchedulePanel as a synchronized mirror of the same backend-owned `missedNotice`.
- Synchronize Run now / Ignore outcomes, rejection handling, settlement, and terminal-failure follow-up across both surfaces.
- Reuse the existing download Notifier for run start/completion.

### Out of scope
- Replacing the inline Downloads alert.
- Automatic catch-up, Windows login startup work, or new scheduler timing rules.
- A duplicate global success/completion card.

## Capabilities
### New Capabilities
- None.

### Modified Capabilities
- `download/scheduler`: extend missed selected-day presentation/lifecycle so one backend notice drives a global Toast as the primary decision surface, Downloads as a mirror, date-scoped ignore settlement, immediate Run now dismissal, and session-deduplicated terminal failure follow-up.

## Approach
Keep scheduler authority in backend `missedNotice` evaluation and settlement. Extend the shared frontend download runtime flow so the global Toast and Downloads read the same notice model, both surfaces resolve together, accepted Run now hides decision UI immediately, successful completion settles the date, and terminal failure swaps to one global failure Toast with `Open Downloads` + `Ignore this date`.

## Affected Areas
| Area | Impact | Description |
|---|---|---|
| `internal/schedule` | Modified | Preserve strict-future, process-start, stale-date, and settlement rules |
| `app_download.go` | Modified | Reuse existing missed-notice actions across global Toast + Downloads |
| `frontend/src/shared/store/download-runtime-store` | Modified | Fan out one notice/lifecycle state to multiple surfaces |
| `frontend/src/features/download/ui/SchedulePanel` | Modified | Keep inline mirror behavior synchronized |
| `frontend/src/features/notifications/ui` | Modified | Add global Toast decision/failure delivery |
| existing download Notifier flow | Reused | Start/completion messaging only; no duplicate success card |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Global Toast and Downloads drift into conflicting states | Med | Drive both from one backend notice + shared runtime refresh |
| Ignore or success corrupts factual last-run fields | Med | Settle only local date; preserve factual run history fields |
| Failure Toast repeats noisily within a session | Low | Deduplicate by missed local date and keep Run now off failure UI |

## Rollback Plan
Remove the `MissedScheduleToasts` surface from `NotificationToasts`, keep the existing backend notice plus Downloads inline alert, and restore current single-surface behavior.

## Dependencies
- Existing backend missed-notice state and actions
- Existing download Notifier lifecycle messaging
- HeroUI ToastProvider

## Success Criteria
- [x] App open on an eligible missed selected day shows a global Toast first and Downloads mirrors the same notice.
- [x] Run now or Ignore from either surface updates/removes both surfaces consistently.
- [x] Ignore settles only the current ISO local date and allows a separately eligible selected date tomorrow.
- [x] Successful Run now closes decision Toasts and relies on the existing Notifier for completion.
- [x] Terminal failure keeps the date unresolved and shows one session-deduplicated global failure Toast with `Open Downloads` and `Ignore this date`.
- [x] Unselected days, exact-boundary startup, already-running process, settled dates, and stale earlier dates remain suppressed.

# Tasks: Fix schedule missed selected day

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 560-800 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |
| Reviewer budget | 800 lines |
| Approved exception | Yes |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Frontend-only global Toast missed-alert delivery plus regression coverage | PR 1 | Approved single PR; preserve backend timing/settlement code and leave unrelated worktree changes untouched |

## Phase 1: Shared controller/store
- [x] 1.1 RED: extend `frontend/src/shared/store/__tests__/download-runtime-store.test.ts` for session reset, hidden-decision restore, failure-date dedupe, initial connection load, and run-event refresh from one backend `missedNotice`.
- [x] 1.2 GREEN: extend `frontend/src/shared/store/download-runtime-store/download-runtime-store.{types,helpers}.ts` with missed-notice session state/selectors; make `connectDownloadRuntimeStore` load schedule/run history on first connection.
- [x] 1.3 RED/GREEN: create `frontend/src/shared/hooks/use-missed-schedule-notice/{use-missed-schedule-notice.ts,missed-schedule-notice.helpers.ts,__tests__/*}` for optimistic hide, rejection restore, safe feedback, and negative runtime-unavailable/rejected-action cases.

## Phase 2: Global Toast + Downloads decision UI
- [x] 2.1 RED: add `frontend/src/features/notifications/ui/MissedScheduleToasts/__tests__/*` for global Toast render, persistence, deduplication, no Run now on failure, and Open Downloads navigation.
- [x] 2.2 GREEN: create `frontend/src/features/notifications/ui/MissedScheduleToasts/*` and compose `MissedScheduleToasts` inside `NotificationToasts`.
- [x] 2.3 RED/GREEN: refactor `frontend/src/features/download/ui/SchedulePanel/{use-schedule-panel.ts,SchedulePanel.tsx,schedule-panel.types.ts,__tests__/*}` to consume the shared controller as a synchronized mirror; acceptance Run now/Ignore converge, negative unresolved failures keep the notice.

## Phase 3: Shell + route cleanup
- [x] 3.1 RED: add `frontend/src/app/AppLayout/__tests__/*` and `frontend/src/app/routes/__tests__/*` ensuring the Toast host is rendered and Today no longer carries an inline alert.
- [x] 3.2 GREEN: remove `TodayMissedScheduleAlert` and `MissedScheduleFailureAlert` inline features; update `EpisodesRoute` and `AppLayout`.
- [x] 3.3 REFACTOR: keep `frontend/src/app/routes/{EpisodesRoute.tsx,DownloadsRoute.tsx}` and `AppLayout` composition-only; do not touch backend timing/settlement files or unrelated worktree edits.

## Phase 4: Shared runtime + contract regression
- [x] 4.1 RED/GREEN: extend `frontend/src/infrastructure/__tests__/download-runtime-source.test.ts` and `frontend/src/shared/contracts/download.types.ts` guards so shared refresh/events keep the global Toast, Downloads, and the failure surface synchronized from existing Wails bindings.
- [x] 4.2 RED/GREEN: extend `app_download_test.go` only for additive getter/action parity regression coverage; preserve current backend action semantics and settlement facts.
- [x] 4.3 Verify focused vitest suites plus `bun --cwd="frontend" run typecheck`, `bun --cwd="frontend" run lint`, `bun --cwd="frontend" run test`, and `bun --cwd="frontend" run fallow audit --quiet`; cover acceptance and negative spec cases in test names.
- [x] 4.4 Produce OpenSpec artifacts for the active SDD change so the pre-commit `checksdd` gate passes.

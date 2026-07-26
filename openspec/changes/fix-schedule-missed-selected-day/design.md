# Design: Fix schedule missed selected day

## Technical Approach
Keep backend eligibility, timing, settlement, and `missedNotice` persistence exactly as implemented. Extend delivery only: the app shell renders a global HeroUI Toast as the primary decision surface, Downloads keeps the inline mirror, and a shared frontend controller drives both from the existing backend-owned `ScheduleConfig.missedNotice`, `RunMissedScheduleNow`, `IgnoreMissedSchedule`, run-history events, and `running` state. Accepted `Run now` hides decision UI locally right away, waits for existing lifecycle/progress UI while the scheduler runs, and promotes only terminal failure into one session-deduplicated global failure Toast.

## Architecture Decisions
| Decision | Choice | Rationale |
|---|---|---|
| Global surface | Render `MissedScheduleToasts` inside the existing `NotificationToasts` / `ToastProvider` shell. | Reuses the existing HeroUI toast host; no new inline cards; visible from every route. |
| Shared ownership | Reuse `download-runtime-store` for backend schedule truth and add a small frontend-only missed-notice session controller/hook consumed by the Toast surface and Downloads. | Both surfaces must refetch the same backend state without duplicating Wails calls or action logic. |
| Accepted Run now UX | Optimistically hide decision UI for the clicked local date, keep backend unresolved until the existing action promise reaches terminal status, restore the decision on rejection, and rely on `running` + run history while active. | This satisfies the approved flow without changing scheduler persistence or timing. |
| Terminal failure UX | Render one global failure Toast per local ISO date per renderer session, with `Open Downloads` and `Ignore this date`; never show `Run now`. | Failure follow-up is global, deduplicated, and loop-safe while Downloads still exposes detailed progress/history. |
| Success delivery | Reuse the current notifier only. | `internal/download/service.go` already emits success only for `ok` runs with `EpisodesDownloaded > 0`; a second success card would duplicate that signal. |

## Data Flow
```text
AppLayout
  -> NotificationToasts
    -> ToastProvider
      -> MissedScheduleToasts (global decision/failure toasts)
DownloadsRoute
  -> SchedulePanel (inline mirror)
Both surfaces
  -> useMissedScheduleNotice
  -> download-runtime-store.refreshSchedule()
  -> App.GetScheduleConfig / RunMissedScheduleNow / IgnoreMissedSchedule
  -> existing run events refresh schedule + run history
```

## File Changes
| File | Action | Description |
|---|---|---|
| `frontend/src/app/AppLayout/AppLayout.tsx` | Modify | Compose `NotificationToasts` (unchanged). |
| `frontend/src/features/notifications/ui/NotificationToasts/NotificationToasts.tsx` | Modify | Mount `MissedScheduleToasts` inside `ToastProvider`. |
| `frontend/src/features/notifications/ui/MissedScheduleToasts/*` | Create | Dumb side-effect component, hook, helpers, types, and tests for global decision/failure toasts. |
| `frontend/src/shared/hooks/use-missed-schedule-notice/*` | Create | Shared controller for refetch, optimistic hide, rejection restore, failure dedupe, and Downloads navigation callback wiring. |
| `frontend/src/features/download/ui/SchedulePanel/use-schedule-panel.ts` | Modify | Delegate missed-notice actions/state to the shared controller and pass `decisionNotice` to the view model. |
| `frontend/src/features/download/ui/SchedulePanel/SchedulePanel.tsx` and `schedule-panel.types.ts` | Modify | Keep inline mirror semantics and remove duplicated local action state. |
| `frontend/src/shared/store/download-runtime-store/download-runtime-store.{helpers,types}.ts` | Modify | Add ephemeral session selectors/state for hidden decision date and shown failure dates; `connectDownloadRuntimeStore` loads schedule/run history on first connection. |
| `frontend/src/shared/store/__tests__/download-runtime-store.test.ts` | Modify | Cover initial load, session reset, and run-event refresh interactions. |
| `frontend/src/app/routes/EpisodesRoute.tsx` | Modify | Remove inline Today alert; global Toast replaces it. |

## Interfaces / Contracts
```ts
type MissedScheduleSessionState = {
  readonly hiddenDecisionDate?: string;
  readonly activeFailureDate?: string;
  readonly shownFailureDates: readonly string[];
  readonly actionMessage?: string;
};

type MissedScheduleNoticeController = {
  readonly decisionNotice?: ScheduleMissedNotice;
  readonly failureNotice?: ScheduleMissedNotice;
  readonly isResolving: boolean;
  readonly actionMessage?: string;
  runNow(localDate: string): Promise<void>;
  ignore(localDate: string): Promise<void>;
};
```
Existing backend DTOs stay unchanged: `ScheduleMissedNotice` and `ScheduleMissedActionResult` remain additive-only and continue to come from the current Wails bindings.

## Testing Strategy
| Layer | What to Test | Approach |
|---|---|---|
| Unit TS | controller reducer/helpers: optimistic hide, rejection restore, failure dedupe, reset | colocated helper/hook tests |
| Integration TS | Toast surface + Downloads consume one controller/store and converge after actions/run events | hook tests with mocked runtime source + shared store assertions + `MemoryRouter` for navigation |
| UI TS | Global Toast rendering, Downloads mirror, Open Downloads navigation, no Run now on failure | component tests |
| App Go | schedule getters still expose the same backend notice | extend `app_download_test.go` |

## Migration / Rollout
No migration required. Backend schema, timing rules, and settlement behavior stay untouched. Rollback removes `MissedScheduleToasts` from `NotificationToasts` and keeps the existing Downloads inline alert.

## Open Questions
- None.

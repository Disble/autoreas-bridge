# ADR 006: Frontend Runtime Read Models

## Status
Accepted

## Context
The Downloads UI receives backend state through Wails bindings and lifecycle events. Several panels render different slices of the same process: schedule metadata, run history, and selected run detail. Keeping those panels synchronized through panel-local `useEffect` reloads made freshness depend on every panel knowing every event that could make it stale.

## Decision
Frontend runtime screens that render shared backend process state use a central Zustand read-model under `frontend/src/shared/store/`.

1. Wails bindings stay behind an infrastructure source such as `DownloadRuntimeSource`.
2. The Zustand store owns shared snapshots, selection, load flags, and error state.
3. Feature hooks connect the store to the runtime source and select the state they render.
4. Backend lifecycle events invalidate the loaded store slices in one bridge, then the store re-fetches authoritative snapshots through the source.
5. Feature `.tsx` files stay dumb: they render hook outputs only.

## Current application
`frontend/src/shared/store/download-runtime-store/download-runtime-store.ts` is the read-model for Downloads. It owns:

- `scheduleConfig`
- `runHistory`
- `selectedRunId`
- load/error state for schedule and run history
- the single lifecycle-event bridge from `DownloadRuntimeSource.subscribeRunEvents`

`SchedulePanel` and `RunHistoryPanel` consume this store through their hooks. They no longer maintain independent schedule/run snapshots.

## Consequences
* **Positive:** run lifecycle events refresh every loaded Downloads panel through one invalidation path.
* **Positive:** new Downloads panels can consume the same read-model without adding another Wails event subscription.
* **Positive:** Wails remains an adapter; the store is a frontend read-model, not a transport layer.
* **Negative:** hooks must reset the shared store in tests to avoid state leakage between cases.

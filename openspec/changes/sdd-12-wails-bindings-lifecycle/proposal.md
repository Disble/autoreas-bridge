# Proposal: SDD-12 Wails Bindings & Lifecycle

## Intent
The application currently terminates the background Go process when the UI window is closed, breaking the core requirement of a persistent bridge. This change ensures the process stays alive in the background and establishes the initial React-to-Go communication layer by exposing the first functional bindings.

## Scope

### In Scope
- Configure Wails to hide the window instead of killing the process on close (`HideWindowOnClose: true`).
- Store necessary service references (`TriggerService`, `api.Server`) on the `App` composition root.
- Expose minimal Wails bindings for React: `TriggerReconcile()`, `GetEffectiveAddress()`, and `GetBridgeStatus()`.
- Update the React frontend to prove the new bindings work (replacing the starter `Greet` demo).

### Out of Scope
- System Tray menu and the ability to reopen the window (deferred to SDD-13).
- Full React UI implementation for the bridge dashboard (deferred to SDD-14).
- Direct binding of internal Go infrastructure objects (we will use a facade approach on `App`).

## Approach
We will modify `main.go` to set `HideWindowOnClose: true` in the Wails options. To expose the requested "SyncService" methods cleanly, we will use the `App` struct in `app.go` as a facade. During `startup()`, `App` will save references to `internal/sync.TriggerService` and `api.Server`. We will then add public methods to `App` (e.g., `TriggerReconcile`, `GetEffectiveAddress`) that delegate to these internal services, allowing Wails to generate safe, serializable bindings for the frontend.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `main.go` | Modified | Add `HideWindowOnClose: true` to Wails options |
| `app.go` | Modified | Store service refs; add public methods for bindings |
| `frontend/src/App.tsx` | Modified | Consume new bindings instead of `Greet` |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| App "disappears" on close with no way to reopen | High | Acceptable temporary state until SDD-13 (Tray) is implemented. |
| Binding internal types directly | Medium | Use `App` as a facade that returns only primitive/serializable DTOs. |

## Rollback Plan
Revert changes in `main.go` and `app.go` to their previous state, restoring the default close behavior and the `Greet` binding.

## Success Criteria
- Closing the Wails window hides it but leaves the Go process running.
- React can successfully trigger a sync reconciliation via the new binding.
- React can retrieve and display the bridge's effective LAN address.

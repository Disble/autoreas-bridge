# Design: SDD-12 Wails Bindings & Lifecycle

## Technical Approach

Add `HideWindowOnClose: true` to `main.go` Wails options, store `syncTrigger *bridgeSync.TriggerService` as a new field on `App`, and add three public methods (`TriggerReconcile`, `GetEffectiveAddress`, `GetBridgeStatus`) on `App` that delegate to existing services. Update the generated Wails binding stubs manually and replace the starter React UI with a minimal bridge status panel. No new packages are created — `App` acts as the Wails facade.

## Architecture Decisions

### Decision: App as Wails Facade (no new adapter package)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `App` exposes public methods directly | Simpler, keeps `app.go` as single composition root | ✅ Chosen |
| Separate Wails adapter package | Cleaner separation, more boilerplate | ❌ Deferred — overkill for 3 methods |
| Bind internal services directly | Violates hexagonal boundary | ❌ Rejected |

### Decision: Return `string` from bindings (not DTO structs)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `string` return | Zero serialization surface, Wails safe | ✅ Chosen |
| Custom DTO struct | More typesafe but risks binding surface issues | ❌ Deferred to SDD-14 |

**Rationale**: Wails only serializes exported types. Using `string` avoids any risk of Wails failing to generate valid TypeScript bindings for custom structs at this stage.

### Decision: Manual binding file update (no `wails generate module`)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Update `.d.ts`/`.js` by hand | Keeps consistent with no-build rule | ✅ Chosen |
| Run `wails generate module` | Requires full Wails dev build | ❌ AGENTS.md: Never build after changes |

## Data Flow

```
React (App.tsx)
    │
    ├── GetBridgeStatus()  ──→ a.startupErr → "ok" | err.Error()
    ├── GetEffectiveAddress() ──→ a.httpServer.EffectiveAddress()
    └── TriggerReconcile() ──→ a.syncTrigger.TriggerReconcile(a.ctx)
                                    └──→ events.SyncRequestedEvent → EventBus
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `main.go` | Modify | Add `HideWindowOnClose: true` to `options.App` |
| `app.go` | Modify | Add `syncTrigger` field; save it in `startup()`; add 3 public methods; remove `Greet` |
| `frontend/wailsjs/go/main/App.d.ts` | Modify | Add `TriggerReconcile`, `GetEffectiveAddress`, `GetBridgeStatus`; remove `Greet` |
| `frontend/wailsjs/go/main/App.js` | Modify | Same — add 3 function wrappers, remove `Greet` |
| `frontend/src/App.tsx` | Modify | Replace Greet demo with bridge status panel using new bindings |

## Interfaces / Contracts

```go
// New field on App struct
syncTrigger *bridgeSync.TriggerService

// New public methods on App (Wails-bound)
func (a *App) GetBridgeStatus() string
func (a *App) GetEffectiveAddress() string
func (a *App) TriggerReconcile() string  // returns "ok" or error string
```

```typescript
// frontend/wailsjs/go/main/App.d.ts
export function GetBridgeStatus(): Promise<string>;
export function GetEffectiveAddress(): Promise<string>;
export function TriggerReconcile(): Promise<string>;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `GetBridgeStatus` returns startupErr when set | `app_test.go`: set `startupErr`, assert non-empty |
| Unit | `GetBridgeStatus` returns "ok" when no error | `app_test.go`: nil startupErr |
| Unit | `GetEffectiveAddress` returns "" when httpServer nil | nil guard test |
| Unit | `TriggerReconcile` returns "ok" when syncTrigger set | stub bus, assert "ok" |
| Unit | `TriggerReconcile` returns error string when syncTrigger nil | nil guard test |
| Unit | `TriggerReconcile` propagates error from TriggerService | mock returning error |
| Frontend | No Go tests for React — bindings are manually verified | Manual / compile-time TypeScript |

> Strict TDD: RED → GREEN → REFACTOR for every Go method.

## Migration / Rollout

No migration required. `HideWindowOnClose` is a pure config addition. Existing `shutdown()` is not modified — it already handles process-level teardown correctly. The tray reopen affordance is deferred to SDD-13.

## Open Questions

- None.

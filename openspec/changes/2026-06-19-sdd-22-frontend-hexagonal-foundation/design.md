# Design: Network-Tab UI (sdd-22)

Change: `2026-06-19-sdd-22-network-tab-ui` | Project: `autoreas-bridge` | Phase: design
Reference patterns: `D:\dev\disble\ollama-telemetry\frontend\src`
Backend truth: `internal/api/middleware.go:23-43` emits complete `http.request` rows; `GetRecentLogs()` + `observability.log` stream already provide every field. ZERO backend work.

---

## 1. Executive summary

Install a hexagonal frontend (Ports & Adapters / ACL + Dependency Inversion + Read-Model store) by formalizing the proven `ollama-telemetry` pattern set, then build the Network tab on top of it. The KEY ADAPTATION vs the reference repo: the reference ingests **snapshots (REPLACE)**; we ingest an **event STREAM (append + cap) folded by `correlationId` into request rows** via a PURE reducer — structurally the same as the `animes.dat` "effective-state-per-`_id`" parser (SDD-03).

---

## 2. Architecture decisions (ADR-style)

### ADR-1 — TWO infrastructure ports, not one

**Decision.** Create exactly two ports under `frontend/src/infrastructure/`:

- `ObservabilityLogSource` — the STREAM port: live event subscription + recent-log fetch. Consumed by the Network store and `use-observability-panel`.
- `BridgeRuntimeSource` — the request/response port: the remaining four Wails bindings (`getSQLiteStatus`, `getEffectiveAddress`, `getPairingToken`, `triggerReconcile`) plus the pairing-consumed event subscription. Consumed by `use-bridge-status-card`, `use-pairing-panel`, `use-bridge-dashboard`.

**Rationale.** Interface Segregation. The two ports have genuinely different cardinalities and lifecycles:
- The log source is a **hot stream** (push, unbounded, append+cap, fold). The Network store is its only stateful consumer.
- The runtime source is **request/reply** (`Promise<T>` per call) plus one rarely-firing event. Mixing the hot stream into it would force pairing/status hooks to depend on a `subscribe(log)` method they never call, and would couple the Network store to reconcile/pairing methods it never calls. A fat single port violates ISP and makes fakes noisy (every test stubs methods it does not exercise).

**Rejected — single `BridgeSource` god-port.** Simpler import surface, but every fake must implement 7+ unrelated members; the Network store would import a type carrying `triggerReconcile`; ISP violation. Rejected.

**Port interface signatures.**

```ts
// infrastructure/observability-log-source.ts
import type { ObservabilityLogEntry } from '../shared/contracts/observability.types';

export interface ObservabilityLogSource {
  /** Live runtime log stream. Returns an unsubscribe fn. No-op degrade in a plain browser. */
  readonly subscribe: (listener: (entry: ObservabilityLogEntry) => void) => () => void;
  /** Replay of the backend's retained recent log buffer. Resolves [] when the runtime is absent. */
  readonly getRecentLogs: () => Promise<readonly ObservabilityLogEntry[]>;
}

export function createObservabilityLogSource(): ObservabilityLogSource; // singleton
export const observabilityLogSource: ObservabilityLogSource;            // shared default

// infrastructure/bridge-runtime-source.ts
export interface BridgeRuntimeSource {
  readonly getSQLiteStatus: () => Promise<string>;
  readonly getEffectiveAddress: () => Promise<string>;
  readonly getPairingToken: () => Promise<string>;
  readonly triggerReconcile: () => Promise<string>;
  /** Fires when the active pairing token is consumed. Returns an unsubscribe fn. */
  readonly onPairingTokenConsumed: (listener: () => void) => () => void;
}

export function createBridgeRuntimeSource(): BridgeRuntimeSource; // singleton
export const bridgeRuntimeSource: BridgeRuntimeSource;           // shared default
```

Both adapters are the ONLY files allowed to import `wailsjs/*` / touch `window.go` / `window.runtime`. The `waitForBindings` polling guard (currently in `dashboard.bindings.ts`) moves verbatim into a private helper shared by both adapters (or duplicated per adapter — apply decides; behavior must be identical). Browser-without-runtime path returns the same degraded values as today (`'runtime unavailable'`, `''`, `[]`, no-op unsubscribe).

### ADR-2 — STREAM ingest: append+cap buffer + PURE correlationId fold

**Decision.** The Zustand store holds the raw capped event buffer as the single source of truth. A PURE selector folds that buffer into request rows on read. Cap = **200** (reuse the existing `MAX_LOG_ENTRIES = 200` value, promoted into the store's constants so the Network view and the legacy ObservabilityPanel agree).

**Ingest reducer (buffer side) — append + cap, NOT replace.**
```
ingest(buffer: readonly ObservabilityLogEntry[], entry): readonly ObservabilityLogEntry[]
  = keepRecent([...buffer, entry], 200)   // slice(-200), order-stable, newest last
```
Seeding from `getRecentLogs()` is `keepRecent(recent, 200)` — same cap.

**Contrast with the reference (explicit).** `inference-store.ts.ingest` does `events: ingestSnapshotEvents(state.events, snapshot)` where each snapshot REPLACES / upserts the whole event set (the backend owns the aggregate; the store mirrors it). OURS is the opposite: the backend emits **independent events**; the store ACCUMULATES them (append+cap) and the CLIENT owns the aggregation. That aggregation is the fold below.

**Fold reducer (selector side) — pure, dedup, order-stable, last-write-wins.**

Row data model:
```ts
// shared/store/network-store.types.ts
export interface NetworkRequestRow {
  readonly correlationId: string;        // dedup key
  readonly method: string;               // from metadata.method (http.request)
  readonly path: string;                 // from metadata.path
  readonly status: number | null;        // last-write-wins; null until a status event arrives
  readonly durationMs: number | null;    // last-write-wins
  readonly domain: string;               // 'api' for http.request
  readonly startedAt: string;            // FIRST event timestamp for this correlationId (order anchor)
  readonly updatedAt: string;            // LAST event timestamp
  readonly events: readonly ObservabilityLogEntry[]; // backing events for the detail panel
}
```

Fold contract `foldByCorrelationId(buffer): readonly NetworkRequestRow[]`:
- **Input.** The ordered event buffer (oldest→newest).
- **Group key.** `entry.correlationId`. Entries WITHOUT a `correlationId` are excluded from the request table (they remain visible only in the raw log panel).
- **Dedup.** One row per distinct `correlationId` (deduplicating).
- **Last-write-wins per field.** Iterating oldest→newest, each event overwrites `status`/`durationMs`/`path`/`method`/`domain` when that event carries a defined value (`?? previous`). So a later "response" event finalizes `status`/`durationMs` started by an earlier "request" event.
- **Order-stable.** Output ordering is by `startedAt` (first-seen timestamp per correlationId), so a row never jumps when later events update it — analogous to SDD-03 keeping the first occurrence position while folding effective state per `_id`.
- **Output.** `readonly NetworkRequestRow[]`, deterministic for a given buffer (referentially safe to memoize on `buffer`).

Worked example (input→output):
```
buffer = [
  { correlationId:'c1', timestamp:'…01', domain:'api', metadata:{method:'GET',  path:'/sync'} },
  { correlationId:'c2', timestamp:'…02', domain:'api', metadata:{method:'POST', path:'/pair'} },
  { correlationId:'c1', timestamp:'…03', domain:'api', durationMs:42, metadata:{status:200} },
]
foldByCorrelationId(buffer) = [
  { correlationId:'c1', method:'GET',  path:'/sync', status:200, durationMs:42, startedAt:'…01', updatedAt:'…03', events:[e1,e3] },
  { correlationId:'c2', method:'POST', path:'/pair', status:null, durationMs:null, startedAt:'…02', updatedAt:'…02', events:[e2] },
]
```
`c1` is ONE row (dedup), status filled by the later event (last-write-wins), positioned before `c2` (order-stable by startedAt). The exact `metadata` field names (`method`/`path`/`status`) are read from the backend payload; apply MUST confirm them against a real `http.request` payload (`middleware.go:23-43`) before finalizing — drift wins per project rule 2.

The fold lives in `network-store.helpers.ts` as PURE exported functions with JSDoc (selector pattern). It is NOT in the store object and NOT in any `.tsx`.

### ADR-3 — zustand on React 19.2.5

**Decision.** Add `zustand@^5` via `bun --cwd="frontend" add zustand` (NOT by editing `package.json` — auto-memory norm). zustand is NOT currently a dependency.

**Rationale / compatibility.** zustand v5 binds React via `useSyncExternalStore` exported from `react` directly (it dropped the `use-sync-external-store` shim that v4 needed for React 17). React 19.2.5 exports `useSyncExternalStore` natively, so v5 is the correct major. The reference repo (`inference-store.ts`) already uses the v5 `create<T>()` API surface we mirror.

**Apply-time compatibility check (mandatory, in this order):**
1. `bun --cwd="frontend" add zustand` then confirm the resolved version is `5.x` in `bun.lockb` / `package.json`.
2. `bun --cwd="frontend" run typecheck` — proves the `create<NetworkStoreState>()` generic type-checks against `@types/react@19.2.14`.
3. `bun --cwd="frontend" run test` — the store + reducer + connect/reset tests must pass under jsdom (vitest 4) BEFORE wiring any view.
If v5 surfaces a peer warning against React 19, record it as drift and stop (hard blocker) rather than downgrading silently.

### ADR-4 — Index redirect repoint + Network as primary nav

**Decision.**
- `App.tsx`: change `<Route index element={<Navigate replace to="/dashboard" />} />` → `to="/network"`, and add `<Route path="/network" element={<NetworkRoute />} />`. App.tsx stays composition-only (routing JSX, no state/effects/bindings) — unchanged in nature.
- `app/AppLayout.tsx`: prepend a `Network` entry as the FIRST element of `NAV_ITEMS` (lines 109-114) and add a `NetworkIcon` SVG component alongside the existing icon factories. NAV_ITEMS becomes `[Network, Dashboard, Status, Pairing, Logs]`. AppLayout stays composition-only.
- New thin route wrapper `app/routes/NetworkRoute.tsx` rendering the Network container (mirrors existing `ObservabilityRoute`/`PairingRoute` wrappers), keeping `app/**` delivery-only.

**Rationale.** The proposal mandates Network as first/primary nav + index landing. Repointing the redirect (not deleting `/dashboard`) preserves the dashboard route and is user-visible by intent (risk #4 — verify in verify phase). Adding a dedicated route wrapper keeps the feature container free of routing concerns and keeps `app/**` composition-only per frontend constraint 4.

**Rejected — make `/dashboard` an alias of `/network`.** Would erase the still-valid dashboard panels. Rejected; both routes coexist.

---

## 3. Target layering & dependency direction

```
frontend/src/
├─ infrastructure/                      ← ACL: ONLY layer touching wailsjs/* + window.runtime
│  ├─ observability-log-source.ts       (ObservabilityLogSource port + createXSource singleton + no-op degrade)
│  ├─ bridge-runtime-source.ts          (BridgeRuntimeSource port + createXSource singleton + no-op degrade)
│  └─ __tests__/                        (adapter degrade + singleton/refcount tests)
├─ shared/
│  ├─ contracts/
│  │  └─ observability.types.ts         (ObservabilityLogEntry DTO — mirrors internal/logger/logger.go)
│  └─ store/
│     ├─ network-store.ts               (Zustand read-model: buffer + selection + filter; connect/reset seams)
│     ├─ network-store.types.ts         (NetworkStoreState, NetworkRequestRow)
│     ├─ network-store.constants.ts     (MAX_LOG_ENTRIES = 200, EMPTY_* null objects)
│     ├─ network-store.helpers.ts       (PURE: keepRecent, foldByCorrelationId, selectFilteredRows, selectRowById)
│     └─ __tests__/                     (fold dedup/order/LWW; cap; connect idempotency; reset)
├─ features/
│  ├─ dashboard/                        ← STAYS PUT; only import source changes (4 hooks now take a port)
│  │  └─ ui/{ObservabilityPanel,PairingPanel,BridgeStatusCard,BridgeDashboard}/use-*.ts
│  └─ network/                          ← NEW (scaffold via generate:feature)
│     ├─ index.ts
│     ├─ network-panel-container.tsx    (master: table + filter; reads use-network-panel)
│     ├─ network-detail.tsx             (detail: selected row, dumb)
│     ├─ network-table.tsx / network-filter-bar.tsx (dumb)
│     ├─ use-network-panel.ts           (orchestration hook, optional source param)
│     ├─ network-panel.types.ts / .constants.ts / .helpers.ts
│     └─ __tests__/
└─ app/
   ├─ App.tsx                           (routes; index → /network; + /network route) — composition only
   ├─ AppLayout.tsx                     (NAV_ITEMS: Network first; NetworkIcon) — composition only
   └─ routes/NetworkRoute.tsx           (thin wrapper) — delivery only
```

**Dependency direction (never reversed):**
```
features/* ──depends-on──▶ shared/store (port type + store) ──depends-on──▶ shared/contracts (DTO)
features/* ──depends-on──▶ infrastructure (port TYPE only, default singleton)
infrastructure/* ──depends-on──▶ wailsjs/* + window.runtime  (transport)
shared/contracts/* ──depends-on──▶ NOTHING (pure DTO; mirrors Go logger, no backward feature import)
```
This fixes the current inverted edge (today `dashboard.bindings.ts:9` imports `ObservabilityLogEntry` BACKWARDS from a feature types file). After migration the DTO lives in `shared/contracts/observability.types.ts`; the feature file re-exports or imports it forward.

---

## 4. Network store: state shape + contract

```ts
// shared/store/network-store.types.ts
export type NetworkStatusFilter = 'all' | 'success' | 'error' | 'pending';

export interface NetworkStoreState {
  readonly buffer: readonly ObservabilityLogEntry[]; // append+cap raw events (source of truth)
  readonly selectedId: string | null;               // selected correlationId
  readonly query: string;                            // free-text filter (method/path)
  readonly statusFilter: NetworkStatusFilter;
  readonly ingest: (entry: ObservabilityLogEntry) => void;        // append+cap
  readonly seed: (entries: readonly ObservabilityLogEntry[]) => void; // replace buffer with capped recent
  readonly select: (id: string | null) => void;
  readonly setQuery: (query: string) => void;
  readonly setStatusFilter: (f: NetworkStatusFilter) => void;
}
```

Bridge seams (mirror reference `connect`/`reset`):
```ts
export function connectNetworkStore(source: ObservabilityLogSource = observabilityLogSource): () => void;
// idempotent: getRecentLogs() → seed(); subscribe(ingest); single bridge guarded by module-level unsubscribe.
export function resetNetworkStore(): void; // test-only: teardown bridge + clear state
```

Selectors (pure, in `.helpers.ts`):
```ts
foldByCorrelationId(buffer)                      → NetworkRequestRow[]      (ADR-2)
selectFilteredRows(buffer, query, statusFilter)  → NetworkRequestRow[]      (fold then filter)
selectRowById(buffer, id)                        → NetworkRequestRow | null (detail lookup)
```

`use-network-panel.ts` reads slices via `useNetworkStore((s) => s.buffer)` etc., derives rows with the pure selectors (derived-state step), exposes handlers, and runs `connectNetworkStore(source)` in the single `useEffect` (effects step) — exactly the reference `use-inference-explorer.ts` anatomy, satisfying the 10-step hook rule.

---

## 5. Sequence diagrams

### (a) Boot → singleton → connect → seed → live stream → render
```
App boot       useNetworkStore   connectNetworkStore   observabilityLogSource   window.runtime/wailsjs
(NetworkRoute)      (Zustand)          (bridge)              (singleton ACL)         (transport)
   │ render container                                          │                        │
   │── use-network-panel ─▶ subscribe slices (buffer/query…)    │                        │
   │   useEffect ───────────────────▶ connectNetworkStore(src)  │                        │
   │                                   │── getRecentLogs() ─────▶│── GetRecentLogs() ────▶│
   │                                   │◀──── recent[] ──────────│◀──── entries[] ────────│
   │                                   │── store.seed(recent) (keepRecent 200)            │
   │                                   │── source.subscribe(ingest) ─▶ ensureRuntimeListener
   │                                   │                          │── EventsOn('observability.log') ▶
   │  (no runtime → getRecentLogs resolves [], subscribe is a no-op: passive mount)       │
   │                                                              │◀ event ── entry ───────│
   │                                   │◀── ingest(entry) ────────│
   │   store.ingest → buffer = keepRecent([...buffer, entry],200) │
   │◀ Zustand notifies subscribed slices                          │
   │ use-network-panel re-derives selectFilteredRows(buffer,…) → table re-renders (dumb)  │
```

### (b) Row select → detail render
```
NetworkTable(dumb)   use-network-panel   useNetworkStore        NetworkDetail(dumb)
   │ onRowClick(id) ─▶ onSelect(id) ──────▶ select(id) → selectedId=id
   │                                          │ Zustand notifies selectedId subscribers
   │                  ◀── selectedId ─────────│
   │  detailRow = selectRowById(buffer, selectedId)  (pure, derived)
   │  ────────────────────────────────────────────────────▶ render(detailRow)
   │  (detailRow === null when selectedId is null → EMPTY_DETAIL null object)
```

---

## 6. Migration plan — 4 hooks (test-first DI, behavior-parity)

For EACH hook the move is mechanical: replace the concrete `dashboard.bindings` import with an injected port, defaulting to the singleton. TDD order per hook: (1) rewrite the test to inject a FAKE port (delete the `vi.mock('../../dashboard.bindings')`), assert SAME observable behavior, watch it fail; (2) refactor the hook to take the port; (3) green.

| Hook | Today | After | Port used | Parity assertion |
|------|-------|-------|-----------|------------------|
| `use-observability-panel.ts` | imports `getRecentLogs`, `subscribeToEvent`; local `useState` buffer | `useObservabilityPanel(source?: ObservabilityLogSource = observabilityLogSource)`; same local-buffer behavior OR delegate to store (apply may keep local to minimize risk) | `ObservabilityLogSource` | same capped, ordered `entries` view models given same event sequence |
| `use-pairing-panel.ts` | `getEffectiveAddress`, `getPairingToken`, `subscribeToEvent(PAIRING_…)` | `usePairingPanel(source?: BridgeRuntimeSource = bridgeRuntimeSource)` | `BridgeRuntimeSource` | same `token/ip/port/qrImageUrl/copied`; refresh fires on `onPairingTokenConsumed` |
| `use-bridge-status-card.ts` | `getSQLiteStatus` | `useBridgeStatusCard(source?: BridgeRuntimeSource = bridgeRuntimeSource)` | `BridgeRuntimeSource` | same `sqliteStatus/isLoading/statusTone` |
| `use-bridge-dashboard.ts` | `triggerReconcile` | `useBridgeDashboard(source?: BridgeRuntimeSource = bridgeRuntimeSource)` | `BridgeRuntimeSource` | same `syncResult/isSyncing` + reconcile call |

**Behavior-parity guarantee.** Tests assert OUTPUTS not implementation. The injected fake replaces `vi.mock` of a relative path with a real object satisfying the port interface — this is the seam the proposal demands. The `.tsx` views call hooks with NO argument (default singleton), so production wiring is unchanged and panels render identically. `dashboard.bindings.ts` is deleted ONLY after all four rewritten tests pass with fakes. The `waitForBindings`/timeout/poll constants migrate into the adapters with identical values.

---

## 7. Slice sequencing & dependencies

```
Slice A (foundation) ──blocks──▶ Slice B (network + nav) ──optional──▶ Slice C (waterfall, deferred)
```

- **Slice A — hexagonal foundation + 4-hook migration (depends on nothing).** Create `infrastructure/` (both ports + adapters + tests, no-op degrade, singleton/refcount), promote `ObservabilityLogEntry` to `shared/contracts/observability.types.ts` (fix inverted edge), add `zustand@^5` (ADR-3), stand up `shared/store/` (state + connect/reset + PURE fold/cap reducer + tests), port-inject all 4 hooks with test-first fakes, DELETE `dashboard.bindings.ts`. MECHANICAL, runtime-non-breaking. Gate: `bun --cwd="frontend" run test && bun --cwd="frontend" run validate` green; panels visually unchanged.
- **Slice B — Network feature + nav (depends on A).** Scaffold `bun --cwd="frontend" run generate:feature network NetworkPanel`; build `use-network-panel.ts` (optional `source`), dumb table/filter/detail `.tsx`, selector helpers; wire `connectNetworkStore`; add `NetworkRoute`, repoint index redirect, Network-first NAV_ITEMS + NetworkIcon (ADR-4). Gate: same as A + Network is index landing + master/detail works via fake in tests.
- **Slice C — multi-phase waterfall (optional, deferred).** Only if backend later emits start/end timing for non-HTTP domains. Clone reference `waterfall-bar.tsx`. NOT in this change's scope.

Rollback granularity = slice granularity (git revert A or B independently; `bun remove zustand` + delete `shared/store/**` reverts the zustand addition).

---

## 8. Risks (architectural)

1. **Metadata field-name drift.** The fold reads `method`/`path`/`status` from `metadata`. Apply MUST verify exact keys against a real `http.request` payload (`middleware.go:23-43`); code wins per project rule 2. — HIGH until confirmed.
2. **Local-vs-store buffer for the legacy ObservabilityPanel.** Keeping its local buffer minimizes Slice A risk but duplicates the cap logic; sharing the store couples it earlier. Default: keep local in A, share later only if needed. — MEDIUM.
3. **zustand v5 / React 19 peer.** Mitigated by ADR-3 apply-time check; hard-stop on peer error. — LOW.
4. **Index-redirect is user-visible.** Intentional; flagged for verify. — LOW.
5. **Frontend lint gates** (500-line cap, hook anatomy, readonly Props, JSDoc helpers, dumb .tsx). Mitigated by `generate:feature` scaffold + selectors-in-helpers. — LOW.

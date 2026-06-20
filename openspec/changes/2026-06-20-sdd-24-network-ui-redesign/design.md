# Design: Network UI redesign (sdd-24)

Builds on the sdd-22 foundation (port + Zustand store) and sdd-23 feature.
The mental model: **Network = Observability, redesigned as a DevTools-Network
table + inspector**. Each bridge log entry is a row; the message and level are
first-class.

## 1. Data → row mapping (per ENTRY, not folded)

Source: the store's raw `buffer: readonly ObservabilityLogEntry[]`. Each entry →
one `NetworkEntryViewModel`:

| Column | Source | Notes |
|---|---|---|
| TIME | `timestamp` | `HH:MM:SS` (monospace) |
| DOMAIN | `domain` | colored tag — reuse ObservabilityPanel's domain palette |
| LEVEL | `level` (default `info`) | colored tag: info=success/green, debug=accent/violet, warn=warning, error=danger |
| MESSAGE | `message`; if `eventType === 'http.request'` → `${metadata.method} ${metadata.path}` | primary, truncates |
| STATUS | `metadata.status` when number | else `—` |
| DURATION | `durationMs` | `{n}ms` or `—` |

Stable per-entry id: prefer `correlationId`+index when present, else a
content+index key (the store already memoizes per-entry identity — expose it).

## 2. Store change (additive, test-first)

- Add a `selectEntryViewRows(buffer, query, levelFilter)` pure selector in
  `network-store.helpers.ts` returning per-entry rows (filtered), and
  `selectEntryById(buffer, id)`.
- Selection state `selectedId` now keys on the per-entry id.
- Add a `levelFilter` ('all' | 'info' | 'debug' | 'warn' | 'error') alongside/replacing the HTTP `statusFilter` in store state.
- `foldByCorrelationId` is retained but used only for the detail **trace** section (entries sharing a correlationId), not for the main table.

## 3. Components (dumb, HeroUI + Tailwind)

- **NetworkTable**: dense table, columns above; sticky header; row hover + selected accent; monospace TIME/DURATION/STATUS; colored DOMAIN/LEVEL chips; truncating MESSAGE. Empty/loading/capture-unavailable Null Object states.
- **NetworkFilterBar**: free-text input (placeholder "Filter by message, domain or path…") + LEVEL select (All/Info/Debug/Warn/Error).
- **NetworkDetail** (inspector): when a row is selected —
  - header: message + DOMAIN + LEVEL chips + timestamp;
  - **Fields** section: timestamp, domain, eventType, level, correlationId, entityId, durationMs (each label + value, `—` when absent);
  - **Metadata** section: key-value table of all `metadata` entries (stringified values);
  - **Trace** section: when `correlationId` present, list sibling entries (same correlationId, time-ordered) as compact lines (time · domain · message), highlighting the selected one.
  - empty prompt when nothing selected.

## 4. Hook (`use-network-panel.ts`, 10-step anatomy)

Exposes `rows` (per-entry view models), `selectedEntry`, `query`,
`levelFilter`, `isLoading`, `captureUnavailable`, and handlers. Single effect
runs `connectNetworkStore(source)`. All derivation via pure selectors/helpers.

## 5. Layout

Master/detail two-column on wide screens (`lg:grid-cols-[1.6fr_1fr]`), stacked
on narrow. Table left, inspector right — matching the reference repo's
explorer/detail split, but with bridge-appropriate columns.

## 6. Notes

- Reuse the real domain/level color tokens from `ObservabilityPanel` so the
  view matches the rest of the app (no invented palette).
- No KPI strip (design from need; Observability has none).
- Strict TDD: helpers + hook tests RED before implementation; `.tsx` stays dumb.

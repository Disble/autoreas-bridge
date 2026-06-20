# Spec: Syncing anime dashboard panel

## Requirement: Dashboard shows current syncing anime items from the pending queue

The dashboard SHALL show anime items derived from the bridge's current pending
changelog queue, not from raw logs.

### Scenario: one visible item per anime
- **Given** pending changelog rows for `anime-1`, `anime-1`, and `anime-2`
- **When** the syncing panel loads
- **Then** it MUST show exactly two visible anime items
- **And** the `anime-1` item MUST expose that it has more than one pending change

### Scenario: recognizable anime title and progress
- **Given** a pending changelog row whose snapshot contains `_id = "anime-7"`, `nombre = "Dungeon Meshi"`, `nrocapvisto = 18`, and `totalcap = 24`
- **When** the syncing panel renders
- **Then** it MUST show `Dungeon Meshi` as the primary label
- **And** it MUST show progress metadata derived from that snapshot

### Scenario: truthful fallback when snapshot is sparse
- **Given** a pending changelog row without a usable title in its snapshot
- **When** the syncing panel renders
- **Then** it MUST fall back to the anime id
- **And** it MUST NOT invent progress data

## Requirement: Empty state is explicit

The dashboard SHALL handle an empty syncing queue gracefully.

### Scenario: no pending rows
- **Given** the changelog has no rows with `status = pending`
- **When** the syncing panel loads
- **Then** it MUST show an empty state explaining that no anime is currently syncing

## Requirement: Dashboard composition stays clean

The new section SHALL respect the project's frontend delivery constraints.

### Scenario: no runtime calls in tsx
- **Given** the dashboard and syncing panel components
- **When** they render
- **Then** their `.tsx` files MUST only compose JSX with HeroUI/Tailwind
- **And** all runtime fetching MUST live outside `.tsx`

## Requirement: Existing flows remain intact

The new panel SHALL be additive and SHALL NOT break existing dashboard sync,
pairing, or observability flows.

### Scenario: reconcile action still works
- **Given** the user triggers the dashboard reconcile button
- **When** the action resolves
- **Then** the dashboard MUST still render the reconcile result feedback
- **And** the syncing panel MUST be eligible to refresh from the latest queue snapshot

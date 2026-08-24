# Desktop Navigation Specification

## Purpose

Defines the desktop rail information architecture: grouped nav items, default landing route, redirects for removed/renamed routes, the page-header-equals-nav-label contract, the Season open-state badge, and the sidebar sync-status chip. Frontend-only; no wire (REST/WS) contract is affected.

## Requirements

### Requirement: Grouped Rail Nav Items

The desktop rail MUST render exactly 10 nav items in 3 named groups, in this order: LIBRARY (Today,
Downloads, Editor, Catalog, History, Season), SYNC (Devices), SYSTEM (Activity, Notifications,
Settings). SYSTEM MUST be bottom-pinned below LIBRARY and SYNC.

(Previously: 9 items, with SYSTEM listing only Activity then Settings. This change adds a Notifications
entry to SYSTEM, placed between Activity and Settings — grouped with Activity because both are
retrospective, cross-cutting views over past system events rather than library content or a sync
target, mirroring the existing `internal/observability/eventlog` precedent that Activity already
surfaces. Exact placement within SYSTEM is a design-phase-confirmable choice, not a load-bearing
architectural one; this spec fixes SYSTEM's final membership and order once confirmed.)

#### Scenario: Group order and membership

- GIVEN the desktop rail is rendered
- WHEN the user inspects `APP_LAYOUT_NAV_ITEMS`
- THEN LIBRARY MUST list Today, Downloads, Editor, Catalog, History, Season in that order
- AND SYNC MUST list only Devices
- AND SYSTEM MUST list Activity, then Notifications, then Settings, and MUST render pinned to the
  bottom of the rail

#### Scenario: Item count

- GIVEN the desktop rail is rendered
- WHEN the nav items are counted
- THEN the total MUST be exactly 10 items across the 3 groups

### Requirement: Default Landing and Route Redirects

The application root (`/`) MUST default to `/today`. Every removed or renamed route MUST redirect to its replacement without a dead end.

#### Scenario: Root redirect
- GIVEN a user opens the app with no path
- WHEN the router resolves `/`
- THEN it MUST redirect to `/today`

#### Scenario: Legacy route redirects
- GIVEN a user navigates to a removed or renamed path
- WHEN the router resolves `/episodes`, `/network`, `/status`, `/pairing`, `/dashboard`, or `/preferences`
- THEN it MUST redirect respectively to `/today`, `/activity`, `/activity`, `/devices`, `/today`, `/settings`
- AND `/editor` MUST remain unchanged

### Requirement: Page Header Matches Nav Label

Every routed page's `<h1>` MUST equal its nav item label exactly (1:1). Contextual information (current weekday, season name/state) MUST render in the page subtitle, never in the `<h1>`.

#### Scenario: Header equals label
- GIVEN a page is reachable from a nav item with label `{label}`
- WHEN the page renders
- THEN its `<h1>` text MUST equal `{label}` exactly

#### Scenario: Contextual info in subtitle
- GIVEN the Today page is rendered on a given weekday
- WHEN the page displays weekday context
- THEN the weekday MUST appear in the subtitle, not in the `<h1>`

### Requirement: Season Nav Badge

The Season nav item MUST display a state badge while a season is open, and MUST NOT display a badge while no season is open.

#### Scenario: Open season badge
- GIVEN a season is currently open
- WHEN the desktop rail renders the Season nav item
- THEN it MUST show an open-state badge

#### Scenario: No badge when closed
- GIVEN no season is currently open
- WHEN the desktop rail renders the Season nav item
- THEN it MUST NOT show a badge

### Requirement: Notifications Nav Unread Badge

The Notifications nav item MUST display an unread-count badge while one or more notification records
are unread, and MUST NOT display a badge while the unread count is zero. This mirrors the existing
`SeasonNavBadge` render seam (`AppLayout.tsx:77`: `{to === '/season' ? <SeasonNavBadge /> : null}`),
except the badge carries a COUNT rather than a bare open/closed state, since "unread" is a quantity,
not a binary.

#### Scenario: Badge shows the unread count while unread records exist

- GIVEN one or more notification records are unread
- WHEN the desktop rail renders the Notifications nav item
- THEN it MUST show a badge reflecting the current unread count

#### Scenario: No badge when nothing is unread

- GIVEN zero notification records are unread
- WHEN the desktop rail renders the Notifications nav item
- THEN it MUST NOT show a badge

#### Scenario: The badge count updates as records are read

- GIVEN the Notifications nav item shows a badge with an unread count of N
- WHEN a notification record is marked read
- THEN the badge's count MUST reflect the new unread count (N-1, or no badge at all if it reaches
  zero) without requiring a full page reload

### Requirement: Today Season Banner

WHILE a season is open, the Today page MUST render a slim banner linking to the Season page. The banner MUST NOT render while no season is open.

#### Scenario: Banner shown during open season
- GIVEN a season is currently open
- WHEN the Today page renders
- THEN a slim banner linking to `/season` MUST be visible

#### Scenario: Banner hidden when closed
- GIVEN no season is currently open
- WHEN the Today page renders
- THEN no season banner MUST be visible

### Requirement: Season Page Closed and Open States

The Season page MUST show a last-season summary with a "Start new season" action when no season is open, and MUST show the active season view when one is open.

#### Scenario: Closed-state summary
- GIVEN no season is currently open
- WHEN the user navigates to the Season page
- THEN it MUST display the last-season summary
- AND it MUST display a "Start new season" action

#### Scenario: Open-state view
- GIVEN a season is currently open
- WHEN the user navigates to the Season page
- THEN it MUST display the active season view (not the closed-state summary)

### Requirement: Today Weekday Tabs in English

The Today page weekday tabs MUST use English weekday labels (Monday…Sunday). Spanish data literals defined by ADR-007 (e.g. "Viendo", "Ver hoy") MUST remain unchanged.

#### Scenario: English tab labels
- GIVEN the Today page renders weekday tabs
- WHEN the tabs are inspected
- THEN each tab label MUST be an English weekday name (Monday through Sunday)

#### Scenario: ADR-007 literals unchanged
- GIVEN the Today page renders status literals sourced from ADR-007 data vocabulary
- WHEN the page displays status text such as "Viendo" or "Ver hoy"
- THEN those literals MUST remain in Spanish, unmodified

### Requirement: Sidebar Sync-Status Chip

The rail footer MUST render a live sync-status chip (replacing the static "Desktop ↔ Mobile sync" label) that links to the Devices page.

#### Scenario: Chip reflects live status
- GIVEN the desktop rail footer is rendered
- WHEN sync status changes
- THEN the footer chip MUST reflect the current sync status
- AND activating the chip MUST navigate to `/devices`

### Requirement: No Wire Contract Change

This restructure MUST NOT alter any REST or WebSocket endpoint, payload shape, or field name. All navigation, routing, and composition changes MUST be presentation-only.

#### Scenario: Wire surface untouched
- GIVEN the navigation restructure is applied
- WHEN the REST and WebSocket API surfaces are compared before and after
- THEN no endpoint, payload field, or contract MUST differ

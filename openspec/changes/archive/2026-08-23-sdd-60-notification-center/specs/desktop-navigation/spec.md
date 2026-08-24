# Delta for Desktop Navigation

## MODIFIED Requirements

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

## ADDED Requirements

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

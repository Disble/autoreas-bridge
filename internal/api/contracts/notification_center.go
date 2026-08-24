package contracts

// NotificationListRequest is the ListNotifications query DTO (design.md §10):
// a keyset page request plus the archive/read filters and the search/source/
// level filters the filter bar wires (Slice 3b). Search matches title OR
// body, case-insensitively, as an escaped substring; Sources and Levels each
// filter to an IN (...) set. An empty Search/Sources/Levels means that
// filter is simply not applied -- never "match nothing." All three combine
// with the archive/read filters as a conjunction (AND).
type NotificationListRequest struct {
	View       string   `json:"view"` // "active" | "archived"
	UnreadOnly bool     `json:"unreadOnly"`
	Search     string   `json:"search"`
	Sources    []string `json:"sources"`
	Levels     []string `json:"levels"`
	Cursor     string   `json:"cursor"`
	Limit      int      `json:"limit"`
}

// NotificationRow is one list/detail-embedded row. ActionCount is 0 for
// ListNotifications' rows (the store's List query deliberately does not
// load per-row actions) and the real count for GetNotification's detail row
// (Store.Record loads the full action set).
type NotificationRow struct {
	ID            int64  `json:"id"`
	CreatedAtMs   int64  `json:"createdAtMs"`
	Title         string `json:"title"`
	Body          string `json:"body"`
	Level         string `json:"level"`
	Source        string `json:"source"`
	CorrelationID string `json:"correlationId,omitempty"`
	ReadAtMs      int64  `json:"readAtMs,omitempty"`
	ArchivedAtMs  int64  `json:"archivedAtMs,omitempty"`
	ActionCount   int    `json:"actionCount"`
}

// NotificationPage is one ListNotifications keyset page. TotalEver counts
// every record ever recorded, independent of the current view/filter --
// it is what distinguishes the empty states "nothing has ever been
// recorded" from "records exist but none match the current filter" (design
// §9.3). Degraded is true when the store is unavailable or the query
// failed; Items is then an empty, never-nil slice.
type NotificationPage struct {
	Items        []NotificationRow `json:"items"`
	NextCursor   string            `json:"nextCursor,omitempty"`
	AppliedLimit int               `json:"appliedLimit"`
	TotalEver    int               `json:"totalEver"`
	Degraded     bool              `json:"degraded"`
}

// NotificationDetailRow is one row of a notification's single bounded
// row-list detail block.
type NotificationDetailRow struct {
	RefType        string   `json:"refType"`
	RefID          string   `json:"refId"`
	Name           string   `json:"name"`
	Status         string   `json:"status"`
	Detail         string   `json:"detail"`
	ActionIDs      []string `json:"actionIds,omitempty"`
	CollapsedCount int      `json:"collapsedCount,omitempty"`
}

// NotificationAction is one persisted PendingIntent token, as exposed on the
// wire. Frozen args are deliberately NOT included: the frontend presses a
// token by id and never sees, and therefore can never propose, the
// arguments.
type NotificationAction struct {
	ID            string `json:"id"`
	RowRef        string `json:"rowRef,omitempty"`
	Label         string `json:"label"`
	Intent        string `json:"intent"`
	ExecutedAtMs  int64  `json:"executedAtMs,omitempty"`
	RefusedReason string `json:"refusedReason,omitempty"`
}

// NotificationDetail is the single-record detail read: the list row fields
// plus the full detail rows and actions.
type NotificationDetail struct {
	NotificationRow
	Rows    []NotificationDetailRow `json:"rows"`
	Actions []NotificationAction    `json:"actions"`
}

// NotificationDetailResult is the GetNotification result envelope. Found
// distinguishes "no such id" from a populated Item; Degraded marks a
// store-unavailable or query-error outcome, never a panic.
type NotificationDetailResult struct {
	Found    bool               `json:"found"`
	Item     NotificationDetail `json:"item"`
	Degraded bool               `json:"degraded"`
}

// NotificationMutationResult is the result envelope for the lifecycle
// mutations (MarkNotificationsRead, ArchiveNotifications,
// RestoreNotifications): how many records the mutation actually affected,
// and the fresh unread count after it, so the rail badge can update without
// a second round trip.
type NotificationMutationResult struct {
	Affected    int  `json:"affected"`
	UnreadCount int  `json:"unreadCount"`
	Degraded    bool `json:"degraded"`
}

// Package center persists notification.Notification values into bridge
// SQLite (the notification center) and exposes the read model, lifecycle
// mutations, and press-time action execution built on top of that store.
// It is a child package of internal/notification, never the reverse: center
// imports notification for the Notifier/Notification port it decorates, and
// nothing in internal/notification imports center back.
package center

// Level mirrors notification.Level as a stored string.
type Level = string

// EntityRef is a row's reference to the entity it concerns. A row NEVER
// embeds image bytes; cover art resolves at render time via the existing
// GetAnimeCover binding (app_runtime.go:206).
type EntityRef struct {
	Type string `json:"type"` // "anime" | "episode" | "link"
	ID   string `json:"id"`
}

// DetailRow is one row of the single bounded row-list block: cover+name
// (which one), a status word (what happened), the specific detail (which
// episodes or hoster), and the ids of its per-row actions (what to do next).
type DetailRow struct {
	Ref            EntityRef `json:"ref"`
	Name           string    `json:"name"`
	Status         string    `json:"status"`
	Detail         string    `json:"detail"`
	ActionIDs      []string  `json:"actionIds,omitempty"`
	CollapsedCount int       `json:"collapsedCount,omitempty"` // >0 renders "N other anime finished without incident"
}

// RefusalReason is the CLOSED set of press-time refusals. No other value is
// ever produced (notification-actions spec, "A refusal is always one of
// exactly four reasons").
type RefusalReason string

// The four refusals, plus the empty value meaning the press was not refused at
// all. A refused press is a first-class outcome the row renders inline -- never
// an error and never a silent no-op.
const (
	// RefusalNone means the press was accepted; it is the zero value.
	RefusalNone RefusalReason = ""
	// RefusalIntentUnregistered means no handler claims that intent key, so the
	// stored string never reaches a shell, a URL, or a method by name.
	RefusalIntentUnregistered RefusalReason = "intent_unregistered"
	// RefusalTargetMissing means the entity the frozen args point at is gone.
	RefusalTargetMissing RefusalReason = "target_missing"
	// RefusalAlreadyExecuted means the action already fired and its intent is
	// not marked repeatable.
	RefusalAlreadyExecuted RefusalReason = "already_executed"
	// RefusalForeignAction means the action does not belong to this record.
	RefusalForeignAction RefusalReason = "foreign_action"
)

// Action is a persisted PendingIntent token. Args are frozen at creation: the
// store exposes no statement that updates args_json.
type Action struct {
	ID             string
	NotificationID int64
	RowRef         string
	Ordinal        int
	Label          string
	Intent         string
	Args           map[string]string
	ExecutedAtMS   int64         // 0 = never executed
	RefusedReason  RefusalReason // "" = not refused
}

// Record is one persisted notification.
type Record struct {
	ID          int64
	CreatedAtMS int64
	Title       string
	Body        string
	Level       Level
	Source      string
	// Kind is the specific event this record is, WITHIN its Source: Source is the bounded
	// context that raised it ("download"), Kind is what happened there
	// ("download.run_stopped_early"). Empty for a record written before the column existed,
	// and for any producer that has not adopted the vocabulary yet -- an absent kind renders
	// as absent, never as an empty labelled row.
	Kind          string
	CorrelationID string
	ReadAtMS      int64 // 0 = unread
	ArchivedAtMS  int64 // 0 = active
	Rows          []DetailRow
	Actions       []Action
	// ActionCount is how many action tokens this record carries. It is read from SQL on BOTH
	// read paths, so the master list -- which deliberately never loads action bodies -- still
	// reports the real number. It is not derived from len(Actions): on a List read that slice
	// is legitimately empty while the count is not.
	ActionCount int
}

// View selects the list's archive axis.
type View string

const (
	// ViewActive is the default inbox: everything not archived, read or not.
	ViewActive View = "active"
	// ViewArchived is the shelf. Archiving never deletes, so these rows stay
	// searchable until retention prunes them.
	ViewArchived View = "archived"
)

// ListQuery is the keyset-paginated read-model request.
type ListQuery struct {
	View       View
	UnreadOnly bool
	Search     string
	Sources    []string
	Levels     []Level
	Cursor     string // opaque; empty means "first page"
	Limit      int
}

// Page is one keyset page. NextCursor is empty when no further page exists.
type Page struct {
	Items      []Record
	NextCursor string
	Limit      int
}

// StoreConfig configures retention. Zero values fall back to
// defaultRowCap = 2000 and defaultPruneEvery = 50.
type StoreConfig struct {
	RowCap     int
	PruneEvery int
}

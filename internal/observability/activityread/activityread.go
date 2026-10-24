// Package activityread answers the questions the Activity screens ask
// (docs/observability/activity-ui-design.md) from the debug-capture tables:
// request_captures, runtime_events, request_rollup_hourly, incidents,
// device_telemetry_events, and the domain history through internal/activity.
//
// It only reads. Every query is bounded by a time predicate on an indexed
// column, a primary key or a small LIMIT, and the summaries read the hourly
// rollup instead of raw rows, so it is safe on the UI path and on a
// read-only handle.
package activityread

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/observability/incident"
)

// ErrNotFound reports that the requested item is not stored.
var ErrNotFound = errors.New("activityread: not found")

const (
	// QuietThreshold is how long the phone may stay silent before Now calls
	// it quiet. On the dev copy (2026-10-14..17) the p99 gap between
	// consecutive phone requests while active (gaps under 10 min, n=4,821)
	// is 105.1 s: the 105 s status poll. 2 min is the smallest whole minute above it.
	QuietThreshold = 2 * time.Minute
	// LateThreshold is the phone/bridge time difference above which a phone
	// fact is marked "Arrived late" (activity-ui-design.md, Rules).
	LateThreshold = 10 * time.Minute
	// OpenSpan is how recent an occurrence must be for its fingerprint to count as open.
	OpenSpan = 24 * time.Hour
	// NewSpan is how recent a fingerprint's first occurrence must be for it to be new.
	NewSpan = 24 * time.Hour
	// IncidentListSpan is how far back the incident list and the run list reach.
	IncidentListSpan = 7 * 24 * time.Hour
	// RecorderSpan is the recorder's reach.
	RecorderSpan = 2 * time.Hour
	// LedgerSpan is the ledger's and the incidents' retention.
	LedgerSpan = 90 * 24 * time.Hour

	// CalendarDays is the number of days in the History calendar.
	CalendarDays = 90
	// NeedsALookLimit caps the Now view's "Needs a look" list.
	NeedsALookLimit = 3
	// RecentChangesLimit caps the Now view's "Recent changes" list.
	RecentChangesLimit = 5
	// DefaultPageLimit is the page size when the caller asks for none.
	DefaultPageLimit = 50
	// MaxPageLimit caps every paged read.
	MaxPageLimit = 100
	// StoryLimit caps the steps of one run story.
	StoryLimit = 500
	// RunListLimit caps the run list.
	RunListLimit = 100
	// windowRowLimit caps each lane of an incident window.
	windowRowLimit = 1000
	// earlierLimit caps the earlier occurrences of a fingerprint.
	earlierLimit = 10
)

// noiseFilter is the SQL predicate of a non-noise runtime event: the event
// ledger excludes the per-poll "triggered reconcile request" events and the
// tracer steps except the startup marker (ADR-028, L15 D-b).
const noiseFilter = `NOT (COALESCE(event_type, '') = 'sync.reconcile'
	OR (COALESCE(event_type, '') = 'tracer.step' AND message <> 'tracer bullet ready'))`

// levelRankSQL orders event levels so MAX picks the worst one.
const levelRankSQL = `CASE level WHEN 'error' THEN 3 WHEN 'warn' THEN 2 WHEN 'info' THEN 1 ELSE 0 END`

// notPhoneContactKind is the request_captures kind that is not phone
// contact: a broadcast is the bridge talking, not the phone.
const notPhoneContactKind = "ws_broadcast"

// Reader answers Activity questions from one bridge database handle.
type Reader struct {
	db      *sql.DB
	changes *activity.Store
}

// New builds a Reader over db, which may be a read-only handle. The domain
// history is read only through internal/activity's public API: that package
// owns its table.
func New(db *sql.DB) *Reader {
	return &Reader{db: db, changes: activity.NewStore(activity.NewSQLiteProvider(db))}
}

// Where is the "where it happened" filter.
type Where string

const (
	// WhereAll reads every source.
	WhereAll Where = "all"
	// WherePhone reads captures, phone reports, phone changes and the api, websocket and sync events.
	WherePhone Where = "phone"
	// WhereDownloads reads the download events.
	WhereDownloads Where = "downloads"
	// WhereEditor reads desktop changes and the anime events: no "editor" event domain exists.
	WhereEditor Where = "editor"
	// WhereSchedule reads the schedule events.
	WhereSchedule Where = "schedule"
	// WhereSeason reads the season events and the season grade changes.
	WhereSeason Where = "season"
	// WhereProviders reads the provider egress events: Cloudflare clearance and the jkanime host
	// fallback (ADR-029, ADR-030).
	WhereProviders Where = "providers"
)

// scope is the SQL reading of one Where value.
type scope struct {
	all           bool
	phone         bool
	eventDomains  []string
	changeSource  string
	changeActions []string
}

// scopeOf resolves w; an empty value means All. The domains are the values
// measured on the dev copy (runtime_events.domain), not the filter labels.
func scopeOf(w Where) (scope, error) {
	switch w {
	case WhereAll, "":
		return scope{all: true}, nil
	case WherePhone:
		return scope{phone: true, eventDomains: []string{"api", "websocket", "sync"}, changeSource: "mobile"}, nil
	case WhereDownloads:
		return scope{eventDomains: []string{"download"}}, nil
	case WhereEditor:
		return scope{eventDomains: []string{"anime"}, changeSource: "desktop"}, nil
	case WhereSchedule:
		return scope{eventDomains: []string{"schedule"}}, nil
	case WhereSeason:
		return scope{eventDomains: []string{"season"}, changeActions: []string{activity.ActionSeasonGradeSet}}, nil
	case WhereProviders:
		return scope{eventDomains: []string{"clearance", "jkanime"}}, nil
	}
	return scope{}, fmt.Errorf("activityread: unknown where filter %q", w)
}

// readsPhone reports whether captures and phone reports are in scope.
func (s scope) readsPhone() bool {
	return s.all || s.phone
}

// eventFilter returns the predicate on runtime_events.domain.
func (s scope) eventFilter() (string, []any) {
	if s.all {
		return "1=1", nil
	}
	if len(s.eventDomains) == 0 {
		return "0=1", nil
	}
	args := make([]any, len(s.eventDomains))
	for i, domain := range s.eventDomains {
		args[i] = domain
	}
	return "domain IN (" + placeholders(len(args)) + ")", args
}

// readsChanges reports whether any domain history change is in scope.
func (s scope) readsChanges() bool {
	return s.all || s.changeSource != "" || len(s.changeActions) > 0
}

// incidentFilter returns the predicate on incidents: request and mobile
// occurrences belong to the phone; an event occurrence belongs to the domain
// its fingerprint names (incident.ClassifyEvent: error_event|domain|type).
func (s scope) incidentFilter() (string, []any) {
	if s.all {
		return "1=1", nil
	}
	var terms []string
	var args []any
	if s.phone {
		// No pin writer exists yet, so a pin's source kind is not settled: pins
		// belong to no single place and show under All only.
		terms = append(terms, "(source_kind IN (?, ?) AND reason <> ?)")
		args = append(args, string(incident.SourceRequest), string(incident.SourceMobile), string(incident.ReasonManualPin))
	}
	for _, domain := range s.eventDomains {
		prefix := string(incident.ReasonErrorEvent) + "|" + domain + "|"
		terms = append(terms, "substr(fingerprint, 1, ?) = ?")
		args = append(args, len(prefix), prefix)
	}
	if len(terms) == 0 {
		return "0=1", nil
	}
	return "(" + strings.Join(terms, " OR ") + ")", args
}

// placeholders returns n comma-separated SQL placeholders.
func placeholders(n int) string {
	return strings.TrimSuffix(strings.Repeat("?, ", n), ", ")
}

// nullableInt64 converts a scanned nullable integer to a pointer.
func nullableInt64(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	v := value.Int64
	return &v
}

// nullableInt converts a scanned nullable integer to an int pointer.
func nullableInt(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	v := int(value.Int64)
	return &v
}

// isLate reports whether a phone time and a bridge time differ by more than LateThreshold.
func isLate(bridgeMS int64, phoneMS *int64) bool {
	if phoneMS == nil {
		return false
	}
	diff := bridgeMS - *phoneMS
	if diff < 0 {
		diff = -diff
	}
	return diff > LateThreshold.Milliseconds()
}

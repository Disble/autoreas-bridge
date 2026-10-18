package activityread

import "time"

// NowInput carries the clock readings the Now view needs. The caller owns
// the clock, so every answer is reproducible from its inputs.
type NowInput struct {
	Now              time.Time
	LocalMidnight    time.Time
	ProcessStartedAt time.Time
}

// StatusKind names which of the three status sentences applies.
type StatusKind string

const (
	// StatusInSync means the phone talked to the bridge recently and nothing is open.
	StatusInSync StatusKind = "in_sync"
	// StatusQuiet means the phone has not contacted the bridge for QuietThreshold or longer.
	StatusQuiet StatusKind = "quiet"
	// StatusProblems means at least one incident is open.
	StatusProblems StatusKind = "problems"
)

// Status is the computed status sentence of the Now view.
type Status struct {
	Kind         StatusKind
	Sentence     string
	QuietMinutes int
	Problems     int
}

// HourBar is one bar of the 24-hour chart. HasData is false when the rollup
// holds no row for the hour, which the UI draws as a gap, not as zero.
type HourBar struct {
	HourStartMS int64
	Count       int64
	Failed      int64
	FailedShare float64
	HasData     bool
}

// IncidentSummary is one fingerprint in the incident list.
type IncidentSummary struct {
	LatestID      int64
	Fingerprint   string
	Reason        string
	Title         string
	LatestAtMS    int64
	FirstSeenAtMS int64
	Occurrences   int
	IsNew         bool
	IsError       bool
}

// Change is one row of the domain history (internal/activity), returned as stored:
// before and after are the raw snapshot JSON the writer recorded.
type Change struct {
	ID            int64
	AtMS          int64
	ReportedAtMS  *int64
	Source        string
	ActionType    string
	AnimeID       string
	AnimeName     string
	CorrelationID string
	BeforeJSON    string
	AfterJSON     string
}

// NowView answers "is everything fine right now?".
type NowView struct {
	Status             Status
	LastPhoneContactMS *int64
	UptimeMS           int64
	RequestsToday      int64
	OpenIncidents      int
	ChangesToday       int64
	Hours              []HourBar
	NeedsALook         []IncidentSummary
	RecentChanges      []Change
}

// IncidentsInput selects the incident list.
type IncidentsInput struct {
	Now   time.Time
	Where Where
}

// IncidentOccurrence is one stored incidents row with its plain-words title.
type IncidentOccurrence struct {
	ID            int64
	Fingerprint   string
	Reason        string
	Title         string
	OccurredAtMS  int64
	WindowStartMS int64
	WindowEndMS   int64
	SourceKind    string
	SourceID      string
}

// Cause is the recorded reason of the triggering fact. Known is false when
// the fact recorded no cause or is no longer stored.
type Cause struct {
	Known     bool
	ErrorCode string
	Message   string
}

// FoldedRequest is one row of the window's request table: every request
// sharing a route template and status folds into one row with a count.
type FoldedRequest struct {
	RouteTemplate   string
	HTTPStatus      *int
	Count           int
	FirstAtMS       int64
	LastAtMS        int64
	LatestRequestID string
	Kind            string
	Outcome         string
	MaxDurationMS   *int64
	ContainsTrigger bool
}

// EventSummary is one runtime event without its metadata.
type EventSummary struct {
	ID            int64
	AtMS          int64
	Domain        string
	Level         string
	EventType     string
	Message       string
	CorrelationID string
}

// PhoneReport is one stored mobile telemetry fact. PhoneAtMS is the phone's
// own observation time, nil when the report carried none.
type PhoneReport struct {
	ID        int64
	AtMS      int64
	PhoneAtMS *int64
	DeviceID  string
	Kind      string
	Outcome   string
}

// EarlierOccurrence is another retained occurrence of the same fingerprint.
type EarlierOccurrence struct {
	ID           int64
	OccurredAtMS int64
}

// IncidentDetail answers "what went wrong, and why?" for one occurrence.
type IncidentDetail struct {
	Incident     IncidentOccurrence
	Cause        Cause
	Requests     []FoldedRequest
	Events       []EventSummary
	PhoneReports []PhoneReport
	Earlier      []EarlierOccurrence
	ExpiresAtMS  int64
}

// HistoryInput selects one History page. Cursor is empty for the first page.
type HistoryInput struct {
	Now    time.Time
	Where  Where
	Cursor string
	Limit  int
}

// CalendarDay is one square of the 90-day calendar, in Now's location.
type CalendarDay struct {
	DayStartMS  int64
	Total       int64
	HasData     bool
	HasIncident bool
}

// LineKind names the source of one ledger line.
type LineKind string

const (
	// LineChange is a domain history write (internal/activity).
	LineChange LineKind = "change"
	// LinePhoneReport is a stored mobile telemetry fact.
	LinePhoneReport LineKind = "phone_report"
	// LineConnection is a WebSocket connect or disconnect.
	LineConnection LineKind = "connection"
	// LineEvent is a non-noise runtime event.
	LineEvent LineKind = "event"
	// LineIncident is one incident occurrence.
	LineIncident LineKind = "incident"
)

// Mark is a chip on a ledger line.
type Mark string

const (
	// MarkRecovered flags a warning no error event shares a correlation id with.
	MarkRecovered Mark = "recovered"
	// MarkArrivedLate flags a phone fact whose phone and bridge times differ by more than LateThreshold.
	MarkArrivedLate Mark = "arrived_late"
	// MarkIncident flags an incident line.
	MarkIncident Mark = "incident"
)

// LedgerLine is one fact in History. Fields a kind does not use stay empty.
type LedgerLine struct {
	Kind          LineKind
	ID            string
	AtMS          int64
	PhoneAtMS     *int64
	Domain        string
	Source        string
	Level         string
	Title         string
	Detail        string
	CorrelationID string
	BeforeJSON    string
	AfterJSON     string
	Marks         []Mark
}

// LedgerDay groups one local day's lines, newest first.
type LedgerDay struct {
	DayStartMS int64
	Lines      []LedgerLine
}

// HistoryView is one History page. Calendar is filled on the first page
// only; NextCursor is empty when no older line remains.
type HistoryView struct {
	Calendar   []CalendarDay
	Days       []LedgerDay
	NextCursor string
}

// RunsInput selects the run list of one "where it happened" filter.
type RunsInput struct {
	Now   time.Time
	Where Where
}

// Run is the events sharing one non-empty correlation id. Outcome is the
// worst level among them.
type Run struct {
	CorrelationID  string
	FirstAtMS      int64
	LastAtMS       int64
	Steps          int
	Outcome        string
	FirstEventType string
	FirstMessage   string
}

// RunStep is one event of a run story, with its raw metadata JSON.
type RunStep struct {
	EventSummary
	DurationMS   *int64
	MetadataJSON string
}

// RunStory is the ordered steps of one correlation id. Truncated is true
// when more than StoryLimit steps exist.
type RunStory struct {
	CorrelationID string
	Steps         []RunStep
	Truncated     bool
}

// RecorderInput selects one page of the 2-hour recorder.
type RecorderInput struct {
	Now    time.Time
	Cursor string
	Limit  int
}

// RecorderEntry is one recorder row, request or event, summary fields only.
type RecorderEntry struct {
	Source        string
	ID            string
	AtMS          int64
	Kind          string
	Route         string
	HTTPStatus    *int
	Outcome       string
	DurationMS    *int64
	DeviceName    string
	ErrorCode     string
	Domain        string
	Level         string
	EventType     string
	Message       string
	CorrelationID string
}

// RecorderPage is one recorder page, newest first.
type RecorderPage struct {
	Entries    []RecorderEntry
	NextCursor string
}

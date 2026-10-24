package activityread

import "time"

// FeedType is one type toggle of the Activity feed (activity-ui-design-v2.md, Filters).
type FeedType string

const (
	// FeedChange is a phone change: a domain history write from the phone.
	FeedChange FeedType = "change"
	// FeedTraffic is phone traffic: hourly request totals and phone reports.
	FeedTraffic FeedType = "traffic"
	// FeedDownload is one download run.
	FeedDownload FeedType = "download"
	// FeedTask is a schedule or season event.
	FeedTask FeedType = "task"
	// FeedEdit is a bridge edit: a domain history write from the desktop.
	FeedEdit FeedType = "edit"
	// FeedSystem is the default section: every bridge event no other section
	// owns that is worth a line (a start, a warning, an error), grouped per
	// hour (docs/adr/031-activity-system-section.md).
	FeedSystem FeedType = "system"
)

// FeedTypes lists every feed type in toolbar order.
var FeedTypes = []FeedType{FeedChange, FeedTraffic, FeedDownload, FeedTask, FeedEdit, FeedSystem}

// FeedOrigin is where a feed line happened.
type FeedOrigin string

const (
	// OriginAll reads both origins; it is a filter value, never a line's origin.
	OriginAll FeedOrigin = "all"
	// OriginPhone is a fact the phone produced.
	OriginPhone FeedOrigin = "phone"
	// OriginBridge is a fact the bridge produced.
	OriginBridge FeedOrigin = "bridge"
)

const (
	// LineTrafficHour is one hour of request totals from the hourly rollup.
	LineTrafficHour LineKind = "traffic_hour"
	// LineDownloadRun is one download_runs row.
	LineDownloadRun LineKind = "download_run"
)

// FeedInput selects one feed page. FromMS and ToMS bound the line time and
// are clamped to the ledger span; zero means the span's edge. Types empty
// means every type; every type, System included, is read only when selected.
// FailuresOnly keeps only failed lines of Types.
type FeedInput struct {
	Now          time.Time
	FromMS       int64
	ToMS         int64
	Origin       FeedOrigin
	Types        []FeedType
	FailuresOnly bool
	Cursor       string
	Limit        int
}

// TrafficHour is one hour of the request rollup, every route and device.
type TrafficHour struct {
	HourStartMS   int64
	Requests      int64
	Failed        int64
	MaxDurationMS int64
}

// DownloadRunLine is one download_runs row as stored.
type DownloadRunLine struct {
	RunID              string
	Trigger            string
	Status             string
	StartedAtMS        int64
	FinishedAtMS       *int64
	AnimesChecked      int
	EpisodesFound      int
	EpisodesDownloaded int
	EpisodesFailed     int
	SkippedCount       int
	UpToDateCount      int
	ErrorSummary       string
}

// SystemGroup is what one System line groups: the events of one hour sharing
// a domain, event type, level and message.
type SystemGroup struct {
	HourStartMS int64
	Count       int64
	FirstAtMS   int64
	LastAtMS    int64
}

// FeedLine is one row of the feed. Line carries the fields every kind has;
// Traffic, Run and System are set only for their own lines. A System line is
// an event line standing for its group: its Line is the group's newest
// recorded event, at the group's last time. IncidentID is the newest incident
// occurrence recorded for this fact, or 0.
type FeedLine struct {
	Type       FeedType
	Origin     FeedOrigin
	Failed     bool
	Slow       bool
	IncidentID int64
	Line       LedgerLine
	Traffic    *TrafficHour
	Run        *DownloadRunLine
	System     *SystemGroup
}

// FeedDay groups one local day's feed lines, newest first.
type FeedDay struct {
	DayStartMS int64
	Lines      []FeedLine
}

// FeedView is one feed page. NextCursor is empty when no older line remains.
type FeedView struct {
	Days       []FeedDay
	NextCursor string
}

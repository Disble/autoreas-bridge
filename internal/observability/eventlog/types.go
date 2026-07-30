package eventlog

const (
	defaultSearchLimit = 25
	maxSearchLimit     = 100
	// maxTimelineItems bounds get_correlation_timeline's per-side event
	// count: one correlation id names one request's worth of work, so an
	// unbounded timeline would be a scan disguised as a lookup.
	maxTimelineItems = 200
	// defaultSummarySampleCap bounds the newest samples returned per summary
	// group, matching the existing summary_requests precedent.
	defaultSummarySampleCap = 5
	// defaultRowCap and defaultPruneEvery are the retention constants:
	// events fire one to two orders of magnitude more often than captured
	// requests, so the row cap is proportionally larger; pruning runs on a
	// write-count cadence rather than a timer so cost scales with traffic.
	defaultRowCap     = 20000
	defaultPruneEvery = 200
	// maxMetadataBytes bounds metadata_json: anything past this is a caller
	// bug and should be visible as one, so overflow stores a marker object
	// rather than truncated (unparseable) JSON.
	maxMetadataBytes = 4 * 1024
)

// EventRecord is one persisted runtime event, mirroring logger.LogEntry plus
// its surrogate id and epoch-millis timestamp.
type EventRecord struct {
	ID            int64          `json:"id"`
	OccurredAtMS  int64          `json:"occurred_at_ms"`
	Domain        string         `json:"domain"`
	Level         string         `json:"level"`
	Message       string         `json:"message"`
	CorrelationID string         `json:"correlation_id,omitempty"`
	EntityID      string         `json:"entity_id,omitempty"`
	EventType     string         `json:"event_type,omitempty"`
	DurationMS    int64          `json:"duration_ms,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// EventSearchParams defines search pagination plus the optional runtime-event filters.
type EventSearchParams struct {
	Limit   int
	Cursor  string
	Filters EventFilters
}

// EventSearchPage is one newest-first results page, matching SearchPage's
// contract field-for-field so a client fluent in one search tool is fluent
// in the other.
type EventSearchPage struct {
	Items                []EventRecord `json:"items"`
	AppliedLimit         int           `json:"applied_limit"`
	NextCursor           string        `json:"next_cursor,omitempty"`
	MalformedRowsSkipped int           `json:"malformed_rows_skipped"`
	WarningCount         int           `json:"warning_count"`
}

// EventCountGroup is one aggregation bucket for a summary grouping dimension.
type EventCountGroup struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

// EventSample is one bounded newest-matching-event sample in a summary result.
type EventSample struct {
	ID           int64  `json:"id"`
	OccurredAtMS int64  `json:"occurred_at_ms"`
	Domain       string `json:"domain"`
	Level        string `json:"level"`
	Message      string `json:"message"`
}

// EventSummaryResult aggregates matching events into counts grouped by
// domain, level, and event type, plus a bounded number of newest samples. An
// empty match returns all three slices non-nil-empty and Samples: [], never
// an error.
type EventSummaryResult struct {
	ByDomain    []EventCountGroup `json:"by_domain"`
	ByLevel     []EventCountGroup `json:"by_level"`
	ByEventType []EventCountGroup `json:"by_event_type"`
	Samples     []EventSample     `json:"samples"`
	Available   bool              `json:"available"`
}

// SinkConfig configures the non-blocking write entry point.
type SinkConfig struct {
	// PersistDebug controls whether debug-level entries are enqueued.
	// Default OFF -- debug is the dominant volume driver and would evict
	// the info/warn/error rows that carry failure signal under retention
	// pressure.
	PersistDebug bool
	// Now overrides the sink's clock for tests; nil uses time.Now.
	Now func() int64
}

// EventStoreConfig defines persistence policy for the event store.
type EventStoreConfig struct {
	RowCap     int
	PruneEvery int
}

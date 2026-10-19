package eventlog

// maxMetadataBytes bounds metadata_json: anything past this is a caller
// bug and should be visible as one, so overflow stores a marker object
// rather than truncated (unparseable) JSON.
const maxMetadataBytes = 4 * 1024

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

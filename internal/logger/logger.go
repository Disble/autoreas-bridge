package logger

import (
	"fmt"
	"time"
)

const (
	// LevelDebug is the debug log level.
	LevelDebug = "debug"
	// LevelInfo is the info log level.
	LevelInfo = "info"
	// LevelWarn is the warning log level.
	LevelWarn = "warn"
	// LevelError is the error log level.
	LevelError = "error"
)

// Fields carries optional structured metadata for a log entry.
type Fields struct {
	CorrelationID string         `json:"correlationId,omitempty"`
	EntityID      string         `json:"entityId,omitempty"`
	EventType     string         `json:"eventType,omitempty"`
	DurationMs    int64          `json:"durationMs,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// LogEntry is the canonical log record emitted by every sink.
type LogEntry struct {
	Timestamp     string         `json:"timestamp"`
	Domain        string         `json:"domain"`
	Level         string         `json:"level,omitempty"`
	Message       string         `json:"message"`
	CorrelationID string         `json:"correlationId,omitempty"`
	EntityID      string         `json:"entityId,omitempty"`
	EventType     string         `json:"eventType,omitempty"`
	DurationMs    int64          `json:"durationMs,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// Logger is the shared logging contract for all bridge domains.
type Logger interface {
	Debugf(domain, format string, args ...any)
	Infof(domain, format string, args ...any)
	Warnf(domain, format string, args ...any)
	Errorf(domain, format string, args ...any)
	Logf(domain, level string, fields Fields, format string, args ...any)
}

type entrySink interface {
	WriteEntry(entry LogEntry)
}

// newEntry builds a canonical structured log entry.
func newEntry(domain, level string, fields Fields, format string, args ...any) LogEntry {
	return LogEntry{
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		Domain:        domain,
		Level:         level,
		Message:       fmt.Sprintf(format, args...),
		CorrelationID: fields.CorrelationID,
		EntityID:      fields.EntityID,
		EventType:     fields.EventType,
		DurationMs:    fields.DurationMs,
		Metadata:      fields.Metadata,
	}
}

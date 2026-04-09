package logger

import (
	"fmt"
	"time"
)

const (
	LevelInfo  = "info"
	LevelWarn  = "warn"
	LevelError = "error"
)

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Domain    string `json:"domain"`
	Level     string `json:"level,omitempty"`
	Message   string `json:"message"`
}

type Logger interface {
	Infof(domain, format string, args ...any)
	Warnf(domain, format string, args ...any)
	Errorf(domain, format string, args ...any)
}

type entrySink interface {
	WriteEntry(entry LogEntry)
}

func newEntry(domain, level, format string, args ...any) LogEntry {
	return LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Domain:    domain,
		Level:     level,
		Message:   fmt.Sprintf(format, args...),
	}
}

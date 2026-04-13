package logger

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
)

type StdoutLogger struct {
	mu     sync.Mutex
	writer io.Writer
}

func NewStdoutLogger(writer io.Writer) *StdoutLogger {
	if writer == nil {
		writer = os.Stdout
	}
	return &StdoutLogger{writer: writer}
}

func (l *StdoutLogger) Debugf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelDebug, Fields{}, format, args...))
}

func (l *StdoutLogger) Infof(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelInfo, Fields{}, format, args...))
}

func (l *StdoutLogger) Warnf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelWarn, Fields{}, format, args...))
}

func (l *StdoutLogger) Errorf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelError, Fields{}, format, args...))
}

func (l *StdoutLogger) Logf(domain, level string, fields Fields, format string, args ...any) {
	l.WriteEntry(newEntry(domain, level, fields, format, args...))
}

func (l *StdoutLogger) WriteEntry(entry LogEntry) {
	l.mu.Lock()
	defer l.mu.Unlock()
	_, _ = fmt.Fprintf(l.writer, "%s\n", formatStdoutLine(entry))
}

// formatStdoutLine produces the human-readable stdout format:
// [timestamp] [LEVEL] [domain] message key=value ...
func formatStdoutLine(e LogEntry) string {
	var b strings.Builder

	b.WriteString(e.Timestamp)
	b.WriteString(" [")
	b.WriteString(strings.ToUpper(e.Level))
	b.WriteString("] [")
	b.WriteString(e.Domain)
	b.WriteString("] ")
	b.WriteString(e.Message)

	if e.EntityID != "" {
		b.WriteString(" entityId=")
		b.WriteString(e.EntityID)
	}
	if e.DurationMs != 0 {
		b.WriteString(fmt.Sprintf(" durationMs=%d", e.DurationMs))
	}
	if e.CorrelationID != "" {
		b.WriteString(" correlationId=")
		b.WriteString(e.CorrelationID)
	}
	if e.EventType != "" {
		b.WriteString(" eventType=")
		b.WriteString(e.EventType)
	}

	return b.String()
}

package logger

import "sync"

const defaultMemLoggerCapacity = 500

// MemLoggerConfig configures a bounded in-memory logger.
type MemLoggerConfig struct {
	Capacity  int
	OnWriteFn func(LogEntry)
}

// MemLogger stores recent log entries in memory for tests and diagnostics.
type MemLogger struct {
	mu       sync.Mutex
	capacity int
	entries  []LogEntry
	onWrite  func(LogEntry)
}

// NewMemLogger builds a bounded in-memory logger.
func NewMemLogger(config MemLoggerConfig) *MemLogger {
	capacity := config.Capacity
	if capacity <= 0 {
		capacity = defaultMemLoggerCapacity
	}

	return &MemLogger{
		capacity: capacity,
		entries:  make([]LogEntry, 0, capacity),
		onWrite:  config.OnWriteFn,
	}
}

// Debugf records a debug-level entry.
func (l *MemLogger) Debugf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelDebug, Fields{}, format, args...))
}

// Infof records an info-level entry.
func (l *MemLogger) Infof(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelInfo, Fields{}, format, args...))
}

// Warnf records a warning-level entry.
func (l *MemLogger) Warnf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelWarn, Fields{}, format, args...))
}

// Errorf records an error-level entry.
func (l *MemLogger) Errorf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelError, Fields{}, format, args...))
}

// Logf records a structured entry with an explicit level.
func (l *MemLogger) Logf(domain, level string, fields Fields, format string, args ...any) {
	l.WriteEntry(newEntry(domain, level, fields, format, args...))
}

// WriteEntry stores a fully-formed log entry.
func (l *MemLogger) WriteEntry(entry LogEntry) {
	l.mu.Lock()
	if len(l.entries) == l.capacity {
		copy(l.entries, l.entries[1:])
		l.entries[len(l.entries)-1] = entry
	} else {
		l.entries = append(l.entries, entry)
	}
	onWrite := l.onWrite
	l.mu.Unlock()

	if onWrite != nil {
		onWrite(entry)
	}
}

// Recent returns a snapshot copy of the buffered log entries.
func (l *MemLogger) Recent() []LogEntry {
	l.mu.Lock()
	defer l.mu.Unlock()

	out := make([]LogEntry, len(l.entries))
	copy(out, l.entries)
	return out
}

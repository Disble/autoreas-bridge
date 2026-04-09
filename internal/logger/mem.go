package logger

import "sync"

const defaultMemLoggerCapacity = 200

type MemLoggerConfig struct {
	Capacity  int
	OnWriteFn func(LogEntry)
}

type MemLogger struct {
	mu       sync.Mutex
	capacity int
	entries  []LogEntry
	onWrite  func(LogEntry)
}

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

func (l *MemLogger) Infof(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelInfo, format, args...))
}

func (l *MemLogger) Warnf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelWarn, format, args...))
}

func (l *MemLogger) Errorf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelError, format, args...))
}

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

func (l *MemLogger) Recent() []LogEntry {
	l.mu.Lock()
	defer l.mu.Unlock()

	out := make([]LogEntry, len(l.entries))
	copy(out, l.entries)
	return out
}

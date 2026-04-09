package logger

import (
	"fmt"
	"io"
	"os"
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

func (l *StdoutLogger) Infof(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelInfo, format, args...))
}

func (l *StdoutLogger) Warnf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelWarn, format, args...))
}

func (l *StdoutLogger) Errorf(domain, format string, args ...any) {
	l.WriteEntry(newEntry(domain, LevelError, format, args...))
}

func (l *StdoutLogger) WriteEntry(entry LogEntry) {
	l.mu.Lock()
	defer l.mu.Unlock()
	_, _ = fmt.Fprintf(l.writer, "%s: %s\n", entry.Domain, entry.Message)
}

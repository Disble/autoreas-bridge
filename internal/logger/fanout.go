package logger

// EntrySink is the exported form of the package-private entrySink interface:
// anything that can receive a fully-formed LogEntry. Exported so packages
// outside logger (e.g. eventlog.Sink) can be registered as a fanout target
// without implementing the full five-method Logger interface.
type EntrySink = entrySink

// FanoutLogger duplicates each entry to every sink-backed logger target.
type FanoutLogger struct {
	targets []entrySink
}

// NewFanoutLogger builds a fan-out logger from sink-capable logger targets.
// It keeps its original variadic-Logger signature and delegates to
// NewFanoutLoggerWithSinks with zero additional sinks.
func NewFanoutLogger(loggers ...Logger) *FanoutLogger {
	return NewFanoutLoggerWithSinks(loggers)
}

// NewFanoutLoggerWithSinks builds a fan-out logger from sink-capable logger
// targets plus any number of EntrySink-only targets (e.g. a persistence sink
// that never implements the full Logger interface). Every target is fanned
// out to identically; write's hot path is unchanged either way.
func NewFanoutLoggerWithSinks(loggers []Logger, sinks ...EntrySink) *FanoutLogger {
	targets := make([]entrySink, 0, len(loggers)+len(sinks))
	for _, target := range loggers {
		if sink, ok := target.(entrySink); ok && sink != nil {
			targets = append(targets, sink)
		}
	}
	for _, sink := range sinks {
		if sink != nil {
			targets = append(targets, sink)
		}
	}
	return &FanoutLogger{targets: targets}
}

// Debugf writes a debug-level entry to every target.
func (l *FanoutLogger) Debugf(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelDebug, Fields{}, format, args...))
}

// Infof writes an info-level entry to every target.
func (l *FanoutLogger) Infof(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelInfo, Fields{}, format, args...))
}

// Warnf writes a warning-level entry to every target.
func (l *FanoutLogger) Warnf(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelWarn, Fields{}, format, args...))
}

// Errorf writes an error-level entry to every target.
func (l *FanoutLogger) Errorf(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelError, Fields{}, format, args...))
}

// Logf writes a structured entry with an explicit level to every target.
func (l *FanoutLogger) Logf(domain, level string, fields Fields, format string, args ...any) {
	l.write(newEntry(domain, level, fields, format, args...))
}

// write sends one entry to every configured sink.
func (l *FanoutLogger) write(entry LogEntry) {
	for _, target := range l.targets {
		target.WriteEntry(entry)
	}
}

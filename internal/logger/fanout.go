package logger

type FanoutLogger struct {
	targets []entrySink
}

func NewFanoutLogger(loggers ...Logger) *FanoutLogger {
	targets := make([]entrySink, 0, len(loggers))
	for _, target := range loggers {
		if sink, ok := target.(entrySink); ok && sink != nil {
			targets = append(targets, sink)
		}
	}
	return &FanoutLogger{targets: targets}
}

func (l *FanoutLogger) Debugf(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelDebug, Fields{}, format, args...))
}

func (l *FanoutLogger) Infof(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelInfo, Fields{}, format, args...))
}

func (l *FanoutLogger) Warnf(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelWarn, Fields{}, format, args...))
}

func (l *FanoutLogger) Errorf(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelError, Fields{}, format, args...))
}

func (l *FanoutLogger) Logf(domain, level string, fields Fields, format string, args ...any) {
	l.write(newEntry(domain, level, fields, format, args...))
}

func (l *FanoutLogger) write(entry LogEntry) {
	for _, target := range l.targets {
		target.WriteEntry(entry)
	}
}

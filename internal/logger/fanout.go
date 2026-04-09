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

func (l *FanoutLogger) Infof(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelInfo, format, args...))
}

func (l *FanoutLogger) Warnf(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelWarn, format, args...))
}

func (l *FanoutLogger) Errorf(domain, format string, args ...any) {
	l.write(newEntry(domain, LevelError, format, args...))
}

func (l *FanoutLogger) write(entry LogEntry) {
	for _, target := range l.targets {
		target.WriteEntry(entry)
	}
}

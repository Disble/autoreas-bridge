package anime

import (
	"log"

	sharedlogger "autoreas-bridge/internal/logger"
)

type stdLogger struct{}

type domainLogger struct {
	domain string
	shared sharedlogger.Logger
	warn   WarningLogger
}

// NewStdLogger builds the default warning logger backed by the standard library logger.
func NewStdLogger() WarningLogger {
	return stdLogger{}
}

func (stdLogger) Warnf(format string, args ...any) {
	log.Printf("WARN: "+format, args...)
}

// newDomainLogger constructs a scoped domain logger that delegates to the shared logger
// and passes warning messages to the warning logger.
func newDomainLogger(domain string, shared sharedlogger.Logger, warnings WarningLogger) domainLogger {
	return domainLogger{domain: domain, shared: shared, warn: warnings}
}

func (l domainLogger) Infof(format string, args ...any) {
	if l.shared != nil {
		l.shared.Infof(l.domain, format, args...)
	}
}

func (l domainLogger) Warnf(format string, args ...any) {
	if l.shared != nil {
		l.shared.Warnf(l.domain, format, args...)
	}
	if l.warn != nil {
		l.warn.Warnf(format, args...)
	}
}

func (l domainLogger) Errorf(format string, args ...any) {
	if l.shared != nil {
		l.shared.Errorf(l.domain, format, args...)
	}
	if l.warn != nil {
		l.warn.Warnf(format, args...)
	}
}

func (l domainLogger) Logf(level string, fields sharedlogger.Fields, format string, args ...any) {
	if l.shared != nil {
		l.shared.Logf(l.domain, level, fields, format, args...)
	}
	if level == sharedlogger.LevelWarn || level == sharedlogger.LevelError {
		if l.warn != nil {
			l.warn.Warnf(format, args...)
		}
	}
}

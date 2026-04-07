package anime

import "log"

type stdLogger struct{}

func NewStdLogger() WarningLogger {
	return stdLogger{}
}

func (stdLogger) Warnf(format string, args ...any) {
	log.Printf("WARN: "+format, args...)
}

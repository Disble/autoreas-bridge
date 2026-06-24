package notification

import (
	"context"

	sharedlogger "autoreas-bridge/internal/logger"
)

// logForwardAdapter is a one-way Dispatcher Adapter that mirrors every
// delivered Notification into the shared observability log stream, so the
// in-app log panel keeps a forensic trail of what the user was shown
// (design.md §2.4/§3, ADR-29-3). The data flow is strictly one-directional:
// a Notification is forwarded INTO the log, and the log NEVER calls back
// into Notify -- sharedlogger.MemLogger only emits the observability.log
// Wails event, it has no Notifier dependency, so the graph is acyclic by
// construction.
type logForwardAdapter struct {
	logger sharedlogger.Logger
}

// NewLogForwardAdapter builds a logForwardAdapter around the given shared
// logger. A nil logger is accepted and degrades Deliver to a no-op -- this
// mirrors the nil-degrade convention already used by UIToastAdapter.
func NewLogForwardAdapter(logger sharedlogger.Logger) *logForwardAdapter {
	return &logForwardAdapter{logger: logger}
}

// Deliver maps a Notification onto a single shared-logger write via Logf,
// chosen over the level-specific helpers (Errorf/Warnf/Infof) so that
// CorrelationID survives in the log entry's Fields:
//   - Level: error -> logger error, warning -> logger warn,
//     success/info -> logger info (the logger has no "success" level; it
//     collapses to info, which is acceptable since the log is forensic --
//     the toast itself still carries the real level).
//   - Source -> logger domain.
//   - Title/Body -> the formatted message.
//   - CorrelationID -> Fields.CorrelationID; EventType is fixed to
//     "notification" so forwarded entries are identifiable in the log
//     stream.
func (a *logForwardAdapter) Deliver(ctx context.Context, n Notification) error {
	if a == nil || a.logger == nil {
		return nil
	}

	level := mapNotificationLevelToLogLevel(n.Level)
	message := formatNotificationLogMessage(n)

	a.logger.Logf(n.Source, level, sharedlogger.Fields{
		CorrelationID: n.CorrelationID,
		EventType:     "notification",
	}, "%s", message)

	return nil
}

// mapNotificationLevelToLogLevel maps a Notification Level onto the shared
// logger's level vocabulary. success and info both collapse to the logger's
// info level since sharedlogger has no dedicated success level.
func mapNotificationLevelToLogLevel(level Level) string {
	switch level {
	case LevelError:
		return sharedlogger.LevelError
	case LevelWarning:
		return sharedlogger.LevelWarn
	default:
		return sharedlogger.LevelInfo
	}
}

// formatNotificationLogMessage builds the forwarded log message from
// Title/Body, tolerating either being empty.
func formatNotificationLogMessage(n Notification) string {
	switch {
	case n.Title != "" && n.Body != "":
		return n.Title + ": " + n.Body
	case n.Title != "":
		return n.Title
	default:
		return n.Body
	}
}

var _ Adapter = (*logForwardAdapter)(nil)

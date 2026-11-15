package desktop

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"autoreas-bridge/internal/apperr"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/modules"
)

const (
	// frontendErrorDomain is the runtime_events domain of every frontend report.
	frontendErrorDomain = "frontend"
	// frontendErrorEventType groups frontend reports in the event log.
	frontendErrorEventType = "frontend.error"
	// frontendErrorMessageLimit bounds the message in bytes.
	frontendErrorMessageLimit = 2 * 1024
	// frontendErrorStackLimit bounds the stack trace in bytes.
	frontendErrorStackLimit = 8 * 1024
	// frontendErrorFieldLimit bounds the source and route in bytes.
	frontendErrorFieldLimit = 512
)

// frontendErrorKinds are the report kinds the frontend may send: a window
// error, an unhandled promise rejection, or a React render error.
var frontendErrorKinds = map[string]bool{"error": true, "unhandledrejection": true, "render": true}

// FrontendErrorReport is one frontend or WebView failure the UI reports.
type FrontendErrorReport struct {
	Kind         string `json:"kind"`
	Message      string `json:"message"`
	Stack        string `json:"stack"`
	Source       string `json:"source"`
	Route        string `json:"route"`
	OccurredAtMs int64  `json:"occurredAtMs"`
}

// ReportFrontendError records a frontend or WebView failure as an error event
// in runtime_events (P7, docs/observability/architecture.md): before it, a
// failure inside the WebView left no trace on the bridge. The report is
// validated and every text field bounded, so a runaway caller cannot bloat the
// event log. It goes through the always-ready shell handle, so a report sent
// while the domain modules start is recorded, never refused. An invalid report
// is invalid_argument; a missing logger is internal.
func (a *App) ReportFrontendError(report FrontendErrorReport) error {
	_, err := a.moduleSet().shell.Use(func(services modules.ShellServices) (struct{}, error) {
		return struct{}{}, recordFrontendError(services.Logger, report)
	})
	return err
}

// recordFrontendError validates report and writes it to logger as one error entry.
func recordFrontendError(logger sharedlogger.Logger, report FrontendErrorReport) error {
	if !frontendErrorKinds[report.Kind] {
		return apperr.InvalidArgument(fmt.Sprintf("unknown frontend error kind %q", report.Kind))
	}
	if strings.TrimSpace(report.Message) == "" {
		return apperr.InvalidArgument("frontend error message is required")
	}
	if logger == nil {
		return errors.New("logger unavailable")
	}
	message := truncateUTF8(report.Message, frontendErrorMessageLimit)
	logger.Logf(frontendErrorDomain, sharedlogger.LevelError, sharedlogger.Fields{
		EventType: frontendErrorEventType,
		Metadata: map[string]any{
			"kind":         report.Kind,
			"message":      message,
			"stack":        truncateUTF8(report.Stack, frontendErrorStackLimit),
			"source":       truncateUTF8(report.Source, frontendErrorFieldLimit),
			"route":        truncateUTF8(report.Route, frontendErrorFieldLimit),
			"occurredAtMs": report.OccurredAtMs,
		},
	}, "frontend %s: %s", report.Kind, message)
	return nil
}

// truncateUTF8 cuts value to at most limit bytes without splitting a rune.
func truncateUTF8(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	cut := limit
	for cut > 0 && !utf8.RuneStart(value[cut]) {
		cut--
	}
	return value[:cut]
}

package desktop

import (
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

// newFrontendErrorTestApp builds an App whose shared logger records into memory.
func newFrontendErrorTestApp(t *testing.T) (*App, *sharedlogger.MemLogger) {
	t.Helper()
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app := newAppTestApp(t)
	app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)
	return app, memLogger
}

// A valid report becomes exactly one error entry in the frontend domain, with
// every field of the report in its metadata (P7).
func TestReportFrontendErrorLogsOneErrorEntry(t *testing.T) {
	t.Parallel()

	app, memLogger := newFrontendErrorTestApp(t)
	got := app.ReportFrontendError(FrontendErrorReport{
		Kind:         "unhandledrejection",
		Message:      "boom %d",
		Stack:        "Error: boom\n    at main.tsx:1",
		Source:       "main.tsx:1:2",
		Route:        "/#/catalog",
		OccurredAtMs: 1_700_000_000_123,
	})

	if got != "ok" {
		t.Fatalf("ReportFrontendError = %q, want ok", got)
	}
	entries := memLogger.Recent()
	if len(entries) != 1 {
		t.Fatalf("logged %d entries, want 1: %#v", len(entries), entries)
	}
	entry := entries[0]
	if entry.Level != sharedlogger.LevelError || entry.Domain != frontendErrorDomain {
		t.Fatalf("entry level/domain = %q/%q, want error/%s", entry.Level, entry.Domain, frontendErrorDomain)
	}
	if entry.EventType != frontendErrorEventType {
		t.Fatalf("entry event type = %q, want %s", entry.EventType, frontendErrorEventType)
	}
	// The message is data, never a format string.
	if entry.Message != "frontend unhandledrejection: boom %d" {
		t.Fatalf("entry message = %q", entry.Message)
	}
	want := map[string]any{
		"kind":         "unhandledrejection",
		"message":      "boom %d",
		"stack":        "Error: boom\n    at main.tsx:1",
		"source":       "main.tsx:1:2",
		"route":        "/#/catalog",
		"occurredAtMs": int64(1_700_000_000_123),
	}
	for key, value := range want {
		if entry.Metadata[key] != value {
			t.Fatalf("metadata[%q] = %#v, want %#v (all: %#v)", key, entry.Metadata[key], value, entry.Metadata)
		}
	}
	if len(entry.Metadata) != len(want) {
		t.Fatalf("metadata has %d keys, want %d: %#v", len(entry.Metadata), len(want), entry.Metadata)
	}
}

// Invalid reports are refused with an error string and log nothing, so a
// misbehaving caller cannot flood runtime_events with junk.
func TestReportFrontendErrorRejectsInvalidReports(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		report FrontendErrorReport
		want   string
	}{
		{"unknown kind", FrontendErrorReport{Kind: "warning", Message: "x"}, `unknown frontend error kind "warning"`},
		{"empty kind", FrontendErrorReport{Message: "x"}, `unknown frontend error kind ""`},
		{"blank message", FrontendErrorReport{Kind: "error", Message: "  \n "}, "frontend error message is required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app, memLogger := newFrontendErrorTestApp(t)
			if got := app.ReportFrontendError(tc.report); got != tc.want {
				t.Fatalf("ReportFrontendError = %q, want %q", got, tc.want)
			}
			if entries := memLogger.Recent(); len(entries) != 0 {
				t.Fatalf("a rejected report logged %#v", entries)
			}
		})
	}
}

// Every accepted kind is logged.
func TestReportFrontendErrorAcceptsEveryKind(t *testing.T) {
	t.Parallel()

	for _, kind := range []string{"error", "unhandledrejection", "render"} {
		app, memLogger := newFrontendErrorTestApp(t)
		if got := app.ReportFrontendError(FrontendErrorReport{Kind: kind, Message: "m"}); got != "ok" {
			t.Fatalf("kind %q: ReportFrontendError = %q, want ok", kind, got)
		}
		if entries := memLogger.Recent(); len(entries) != 1 || entries[0].Metadata["kind"] != kind {
			t.Fatalf("kind %q: entries = %#v", kind, entries)
		}
	}
}

// Oversized fields are cut to their bounds on a rune boundary, so one runaway
// stack cannot bloat the event log.
func TestReportFrontendErrorBoundsEveryField(t *testing.T) {
	t.Parallel()

	app, memLogger := newFrontendErrorTestApp(t)
	// "é" is two bytes and the leading "a" puts every one on an odd offset, so a
	// plain byte cut at any of the (even) limits would split a rune.
	huge := "a" + strings.Repeat("é", frontendErrorStackLimit)
	got := app.ReportFrontendError(FrontendErrorReport{
		Kind: "error", Message: huge, Stack: huge, Source: huge, Route: huge,
	})
	if got != "ok" {
		t.Fatalf("ReportFrontendError = %q, want ok", got)
	}
	metadata := memLogger.Recent()[0].Metadata
	limits := map[string]int{
		"message": frontendErrorMessageLimit,
		"stack":   frontendErrorStackLimit,
		"source":  frontendErrorFieldLimit,
		"route":   frontendErrorFieldLimit,
	}
	for key, limit := range limits {
		value, _ := metadata[key].(string)
		if len(value) > limit || len(value) < limit-1 {
			t.Fatalf("metadata[%q] is %d bytes, want within one byte under %d", key, len(value), limit)
		}
		if !strings.HasPrefix(huge, value) || strings.ContainsRune(value, '�') {
			t.Fatalf("metadata[%q] was not cut on a rune boundary", key)
		}
	}
}

// A field already within bounds is kept whole, including at its exact limit.
func TestFrontendErrorTruncateKeepsAValueAtItsLimit(t *testing.T) {
	t.Parallel()

	value := strings.Repeat("a", 8)
	if got := truncateUTF8(value, 8); got != value {
		t.Fatalf("truncateUTF8 at the limit = %q, want %q", got, value)
	}
	if got := truncateUTF8(value, 7); got != value[:7] {
		t.Fatalf("truncateUTF8 over the limit = %q, want %q", got, value[:7])
	}
	// A limit inside the first rune keeps nothing rather than half a rune.
	if got := truncateUTF8("éa", 1); got != "" {
		t.Fatalf("truncateUTF8 inside the first rune = %q, want empty", got)
	}
}

// Without a logger the report cannot be kept; the binding says so instead of
// panicking.
func TestReportFrontendErrorWithoutALogger(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.sharedLogger = nil
	if got := app.ReportFrontendError(FrontendErrorReport{Kind: "error", Message: "m"}); got != "logger unavailable" {
		t.Fatalf("ReportFrontendError = %q, want logger unavailable", got)
	}
}

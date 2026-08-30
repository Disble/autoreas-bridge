package handlers

import (
	"fmt"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

// capturingLogger records the entries a handler emits.
type capturingLogger struct {
	entries []sharedlogger.LogEntry
}

func (l *capturingLogger) Debugf(domain, format string, args ...any) {
	l.Logf(domain, sharedlogger.LevelDebug, sharedlogger.Fields{}, format, args...)
}

func (l *capturingLogger) Infof(domain, format string, args ...any) {
	l.Logf(domain, sharedlogger.LevelInfo, sharedlogger.Fields{}, format, args...)
}

func (l *capturingLogger) Warnf(domain, format string, args ...any) {
	l.Logf(domain, sharedlogger.LevelWarn, sharedlogger.Fields{}, format, args...)
}

func (l *capturingLogger) Errorf(domain, format string, args ...any) {
	l.Logf(domain, sharedlogger.LevelError, sharedlogger.Fields{}, format, args...)
}

func (l *capturingLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entries = append(l.entries, sharedlogger.LogEntry{
		Domain:    domain,
		Level:     level,
		Message:   fmt.Sprintf(format, args...),
		EntityID:  fields.EntityID,
		EventType: fields.EventType,
	})
}

// TestIncomingMessageFailureLogsInTheWebsocketDomain pins a real defect found
// while auditing dimension-carrying log calls.
//
// `Logger.Warnf` takes (domain, format, args...). The incoming-message failure
// site passed its whole sentence as the DOMAIN and the device id as the format
// string, so the entry landed with a prose domain and a message that was just
// an id. Every such row poisons a grouping over `runtime_events.domain` — the
// same defect class as the tracer bullet deriving a domain from prose, and
// invisible because nothing asserts a domain.
func TestIncomingMessageFailureLogsInTheWebsocketDomain(t *testing.T) {
	t.Parallel()

	log := &capturingLogger{}
	logIncomingWebSocketMessageFailure(log, "device-7", fmt.Errorf("boom"))

	if len(log.entries) != 1 {
		t.Fatalf("expected exactly one entry, got %d", len(log.entries))
	}
	entry := log.entries[0]
	if entry.Domain != "websocket" {
		t.Fatalf("expected domain %q, got %q", "websocket", entry.Domain)
	}
	if !strings.Contains(entry.Message, "device-7") || !strings.Contains(entry.Message, "boom") {
		t.Fatalf("expected the message to name the device and the error, got %q", entry.Message)
	}
	if strings.Contains(entry.Message, "%!") {
		t.Fatalf("expected no format-verb residue in the message, got %q", entry.Message)
	}
}

// TestIncomingMessageFailureCarriesItsDimensions proves the entry can be found
// by what happened and to what, rather than only by free-text search.
func TestIncomingMessageFailureCarriesItsDimensions(t *testing.T) {
	t.Parallel()

	log := &capturingLogger{}
	logIncomingWebSocketMessageFailure(log, "device-7", fmt.Errorf("boom"))

	entry := log.entries[0]
	if entry.EntityID != "device-7" {
		t.Fatalf("expected entity id %q, got %q", "device-7", entry.EntityID)
	}
	if entry.EventType != "websocket.message_failed" {
		t.Fatalf("expected event type %q, got %q", "websocket.message_failed", entry.EventType)
	}
}

// TestClientRegistrationLoggingCarriesTheDevice covers the register/failure
// pair, which knows its device id and previously discarded it into prose.
func TestClientRegistrationLoggingCarriesTheDevice(t *testing.T) {
	t.Parallel()

	registered := &capturingLogger{}
	logWebSocketClientRegistered(registered, "device-9")
	if got := registered.entries[0]; got.EntityID != "device-9" || got.EventType != "websocket.register" {
		t.Fatalf("unexpected registration entry: %+v", got)
	}

	failed := &capturingLogger{}
	logWebSocketRegistrationFailed(failed, "device-9", fmt.Errorf("nope"))
	if got := failed.entries[0]; got.EntityID != "device-9" || got.EventType != "websocket.register_failed" {
		t.Fatalf("unexpected registration-failure entry: %+v", got)
	}
	if got := failed.entries[0].Level; got != "error" {
		t.Fatalf("expected level %q, got %q", "error", got)
	}
}

// TestWebSocketLoggingHelpersTolerateNoLogger keeps the nil guard the call
// sites relied on, so extracting them cannot introduce a panic on a config
// without a logger.
func TestWebSocketLoggingHelpersTolerateNoLogger(t *testing.T) {
	t.Parallel()

	logIncomingWebSocketMessageFailure(nil, "device-1", fmt.Errorf("boom"))
	logWebSocketClientRegistered(nil, "device-1")
	logWebSocketRegistrationFailed(nil, "device-1", fmt.Errorf("boom"))
}

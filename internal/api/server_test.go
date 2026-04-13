package api

import (
	"context"
	"strings"
	"testing"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
)

func TestHTTPServerEffectiveAddressUsesResolvedHostAndPort(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	server := NewServer(Config{Addr: "0.0.0.0:0", RealtimeHub: realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}), Logger: logger}).(*HTTPServer)
	server.resolveEffectiveHost = func() (string, error) {
		return "192.168.1.50", nil
	}
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	got := server.EffectiveAddress()
	if !strings.HasPrefix(got, "192.168.1.50:") {
		t.Fatalf("expected effective address to use resolved host, got %q", got)
	}

	if strings.HasSuffix(got, ":0") {
		t.Fatalf("expected effective address to expose bound port, got %q", got)
	}

	entries := logger.entries()
	if len(entries) == 0 || entries[0].Domain != "api" || entries[0].Level != sharedlogger.LevelInfo {
		t.Fatalf("expected api info log on start, got %#v", entries)
	}
}

func TestNewServerDefaultsToLanBinding(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{}).(*HTTPServer)
	if got, want := server.addr, "0.0.0.0:8080"; got != want {
		t.Fatalf("expected default addr %q, got %q", want, got)
	}
}

type recordingAPILogger struct {
	entriesList []sharedlogger.LogEntry
}

func (l *recordingAPILogger) Debugf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelDebug})
}

func (l *recordingAPILogger) Infof(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelInfo})
}

func (l *recordingAPILogger) Warnf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelWarn})
}

func (l *recordingAPILogger) Errorf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelError})
}

func (l *recordingAPILogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{
		Domain:        domain,
		Level:         level,
		CorrelationID: fields.CorrelationID,
		EntityID:      fields.EntityID,
		EventType:     fields.EventType,
		DurationMs:    fields.DurationMs,
		Metadata:      fields.Metadata,
	})
}

func (l *recordingAPILogger) entries() []sharedlogger.LogEntry {
	out := make([]sharedlogger.LogEntry, len(l.entriesList))
	copy(out, l.entriesList)
	return out
}

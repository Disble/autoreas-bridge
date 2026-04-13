package sync

import (
	"context"
	"testing"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

func TestTriggerServicePublishesSyncRequestedEvent(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	logger := &recordingSyncLogger{}
	published := make(chan events.SyncRequestedEvent, 1)
	bus.Subscribe(events.EventNameSyncRequested, func(event events.Event) {
		syncRequested, ok := event.(events.SyncRequestedEvent)
		if ok {
			published <- syncRequested
		}
	})

	service := NewTriggerService(bus, nil, logger)
	if err := service.TriggerReconcile(context.Background()); err != nil {
		t.Fatalf("trigger reconcile: %v", err)
	}

	select {
	case event := <-published:
		if event.Requester == "" {
			t.Fatal("expected requester to be stamped")
		}
	default:
		t.Fatal("expected SyncRequestedEvent to be published")
	}

	entries := logger.entries()
	if len(entries) != 1 || entries[0].Domain != "sync" || entries[0].Level != sharedlogger.LevelInfo {
		t.Fatalf("expected sync info log, got %#v", entries)
	}

	reconcileEntry := entries[0]
	if reconcileEntry.EventType != "sync.reconcile" {
		t.Fatalf("expected EventType 'sync.reconcile', got %q", reconcileEntry.EventType)
	}
	if reconcileEntry.DurationMs <= 0 {
		t.Fatalf("expected DurationMs > 0, got %d", reconcileEntry.DurationMs)
	}
}

type recordingSyncLogger struct {
	entriesList []sharedlogger.LogEntry
}

func (l *recordingSyncLogger) Debugf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelDebug})
}

func (l *recordingSyncLogger) Infof(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelInfo, Message: "reconcile requested"})
}

func (l *recordingSyncLogger) Warnf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelWarn})
}

func (l *recordingSyncLogger) Errorf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelError})
}

func (l *recordingSyncLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
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

func (l *recordingSyncLogger) entries() []sharedlogger.LogEntry {
	out := make([]sharedlogger.LogEntry, len(l.entriesList))
	copy(out, l.entriesList)
	return out
}

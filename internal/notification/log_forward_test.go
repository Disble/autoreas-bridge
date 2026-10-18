package notification

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
)

// fakeForwardLogger is a minimal sharedlogger.Logger test double that
// records every write so Deliver's level/domain/message/fields mapping can
// be asserted without depending on the real FanoutLogger.
type fakeForwardLogger struct {
	debugCalls []fakeForwardLogCall
	infoCalls  []fakeForwardLogCall
	warnCalls  []fakeForwardLogCall
	errorCalls []fakeForwardLogCall
	logCalls   []fakeForwardLogfCall
}

type fakeForwardLogCall struct {
	domain string
	msg    string
}

type fakeForwardLogfCall struct {
	domain string
	level  string
	fields sharedlogger.Fields
	msg    string
}

func (f *fakeForwardLogger) Debugf(domain, format string, args ...any) {
	f.debugCalls = append(f.debugCalls, fakeForwardLogCall{domain: domain, msg: format})
}

func (f *fakeForwardLogger) Infof(domain, format string, args ...any) {
	f.infoCalls = append(f.infoCalls, fakeForwardLogCall{domain: domain, msg: format})
}

func (f *fakeForwardLogger) Warnf(domain, format string, args ...any) {
	f.warnCalls = append(f.warnCalls, fakeForwardLogCall{domain: domain, msg: format})
}

func (f *fakeForwardLogger) Errorf(domain, format string, args ...any) {
	f.errorCalls = append(f.errorCalls, fakeForwardLogCall{domain: domain, msg: format})
}

func (f *fakeForwardLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	f.logCalls = append(f.logCalls, fakeForwardLogfCall{domain: domain, level: level, fields: fields, msg: format})
}

// totalCalls returns the number of structured log writes recorded by the fake.
func (f *fakeForwardLogger) totalCalls() int {
	return len(f.logCalls)
}

func TestLogForwardAdapterMapsErrorLevelToErrorLog(t *testing.T) {
	t.Parallel()

	logger := &fakeForwardLogger{}
	adapter := NewLogForwardAdapter(logger)

	n := Notification{
		Title:         "Watcher stopped",
		Body:          "the bridge stopped tracking changes",
		Level:         LevelError,
		Source:        "anime",
		Kind:          "anime.watcher_stopped",
		CorrelationID: "corr-1",
		Timestamp:     time.Now(),
		Rows:          []DetailItem{{RefType: "anime", RefID: "a-1"}, {CollapsedCount: 3}, {RefType: "anime", RefID: "a-2"}},
	}

	if err := adapter.Deliver(context.Background(), Delivery{Notification: n}); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if got := logger.totalCalls(); got != 1 {
		t.Fatalf("expected exactly 1 log write, got %d", got)
	}

	call := logger.logCalls[0]
	if call.level != sharedlogger.LevelError {
		t.Fatalf("expected level %q, got %q", sharedlogger.LevelError, call.level)
	}
	if call.domain != "anime" {
		t.Fatalf("expected domain %q, got %q", "anime", call.domain)
	}
	if call.fields.CorrelationID != "corr-1" {
		t.Fatalf("expected CorrelationID %q, got %q", "corr-1", call.fields.CorrelationID)
	}
	if call.fields.EventType != "notification.forwarded" {
		t.Fatalf("expected EventType %q, got %q", "notification.forwarded", call.fields.EventType)
	}
	wantMetadata := map[string]any{"kind": "anime.watcher_stopped", "rowRefIds": []string{"a-1", "a-2"}}
	if !reflect.DeepEqual(call.fields.Metadata, wantMetadata) {
		t.Fatalf("expected metadata %#v, got %#v", wantMetadata, call.fields.Metadata)
	}
}

// TestLogForwardAdapterMetadataOmitsAbsentFieldsAndBoundsRowRefIDs pins the edges of the
// forwarded metadata: a notification with no kind and no rows carries none, a run that
// touched more rows than the bound records only the first maxForwardedRowRefIDs ids, and a
// single row is still recorded.
func TestLogForwardAdapterMetadataOmitsAbsentFieldsAndBoundsRowRefIDs(t *testing.T) {
	t.Parallel()

	logger := &fakeForwardLogger{}
	adapter := NewLogForwardAdapter(logger)
	if err := adapter.Deliver(context.Background(), Delivery{Notification: Notification{Title: "t", Source: "sync"}}); err != nil {
		t.Fatalf("Deliver: %v", err)
	}
	if got := logger.logCalls[0].fields.Metadata; got != nil {
		t.Fatalf("expected no metadata for a notification without kind or rows, got %#v", got)
	}

	rows := make([]DetailItem, 0, maxForwardedRowRefIDs+1)
	want := make([]string, 0, maxForwardedRowRefIDs)
	for i := range maxForwardedRowRefIDs + 1 {
		id := fmt.Sprintf("a-%d", i)
		rows = append(rows, DetailItem{RefType: "anime", RefID: id})
		if i < maxForwardedRowRefIDs {
			want = append(want, id)
		}
	}
	if err := adapter.Deliver(context.Background(), Delivery{Notification: Notification{Source: "download", Rows: rows}}); err != nil {
		t.Fatalf("Deliver: %v", err)
	}
	wantMetadata := map[string]any{"rowRefIds": want}
	if got := logger.logCalls[1].fields.Metadata; !reflect.DeepEqual(got, wantMetadata) {
		t.Fatalf("expected metadata %#v, got %#v", wantMetadata, got)
	}

	single := Notification{Source: "download", Rows: []DetailItem{{RefType: "anime", RefID: "only"}}}
	if err := adapter.Deliver(context.Background(), Delivery{Notification: single}); err != nil {
		t.Fatalf("Deliver: %v", err)
	}
	wantSingle := map[string]any{"rowRefIds": []string{"only"}}
	if got := logger.logCalls[2].fields.Metadata; !reflect.DeepEqual(got, wantSingle) {
		t.Fatalf("expected metadata %#v for a single row, got %#v", wantSingle, got)
	}
}

func TestLogForwardAdapterMapsNotificationLevels(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		level  Level
		source string
		want   string
	}{
		{LevelWarning, "sync", sharedlogger.LevelWarn}, {LevelSuccess, "device", sharedlogger.LevelInfo}, {LevelInfo, "download", sharedlogger.LevelInfo},
	} {
		t.Run(test.source, func(t *testing.T) {
			logger := &fakeForwardLogger{}
			if err := NewLogForwardAdapter(logger).Deliver(context.Background(), Delivery{Notification: Notification{Title: "t", Body: "b", Level: test.level, Source: test.source}}); err != nil {
				t.Fatalf("Deliver: %v", err)
			}
			if got := logger.totalCalls(); got != 1 {
				t.Fatalf("expected exactly 1 log write, got %d", got)
			}
			if call := logger.logCalls[0]; call.level != test.want {
				t.Fatalf("expected level %q, got %q", test.want, call.level)
			}
		})
	}
}

func TestLogForwardAdapterCarriesSourceAsDomainAndMessageFromTitleBody(t *testing.T) {
	t.Parallel()

	logger := &fakeForwardLogger{}
	adapter := NewLogForwardAdapter(logger)

	n := Notification{Title: "Pairing succeeded", Body: "device paired", Level: LevelSuccess, Source: "device"}

	if err := adapter.Deliver(context.Background(), Delivery{Notification: n}); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	call := logger.logCalls[0]
	if call.domain != "device" {
		t.Fatalf("expected domain %q, got %q", "device", call.domain)
	}
	if call.msg == "" {
		t.Fatal("expected a non-empty formatted message carrying Title/Body")
	}
}

func TestLogForwardAdapterNilLoggerIsSafeNoOp(t *testing.T) {
	t.Parallel()

	adapter := NewLogForwardAdapter(nil)

	err := adapter.Deliver(context.Background(), Delivery{Notification: Notification{Title: "x", Level: LevelInfo}})
	if err != nil {
		t.Fatalf("expected nil-logger degrade to be a no-op without error, got %v", err)
	}
}

func TestLogForwardAdapterDoesNotReenterNotify(t *testing.T) {
	t.Parallel()

	logger := &fakeForwardLogger{}
	notifyCount := 0
	logForward := NewLogForwardAdapter(logger)

	dispatcher := NewDispatcher(logForward)

	notify := func(ctx context.Context, n Notification) error {
		notifyCount++
		return dispatcher.Notify(ctx, n)
	}

	if err := notify(context.Background(), sampleNotification()); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if notifyCount != 1 {
		t.Fatalf("expected Notify to be invoked exactly once (no re-entry from the log write), got %d", notifyCount)
	}
	if got := logger.totalCalls(); got != 1 {
		t.Fatalf("expected exactly 1 log write, got %d", got)
	}
}

var _ Adapter = (*logForwardAdapter)(nil)

package api

import (
	"context"
	"reflect"
	"testing"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
)

// TestHTTPServerStartLogsTheBoundAddressAsMetadata pins the api.listening entry: the bound
// address rides in the metadata, so a kept ledger row says where the bridge listened without
// parsing the message, and the message keeps its existing text.
func TestHTTPServerStartLogsTheBoundAddressAsMetadata(t *testing.T) {
	t.Parallel()

	mem := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	server := NewServer(Config{Addr: "127.0.0.1:0", RealtimeHub: realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}), Logger: sharedlogger.NewFanoutLogger(mem)}).(*HTTPServer)
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	addr := server.listener.Addr().String()
	entries := mem.Recent()
	if len(entries) != 1 {
		t.Fatalf("expected exactly one start entry, got %#v", entries)
	}
	entry := entries[0]
	if entry.Domain != "api" || entry.Level != sharedlogger.LevelInfo || entry.EventType != "api.listening" {
		t.Fatalf("expected an api info api.listening entry, got %#v", entry)
	}
	if want := "http server listening on " + addr; entry.Message != want {
		t.Fatalf("expected message %q, got %q", want, entry.Message)
	}
	if want := map[string]any{"addr": addr}; !reflect.DeepEqual(entry.Metadata, want) {
		t.Fatalf("expected metadata %#v, got %#v", want, entry.Metadata)
	}
}

// TestHTTPServerStartRecordsEachDeviceLastContact pins the start record of S4: the snapshot the
// composition root read rides in the same metadata, next to the address.
func TestHTTPServerStartRecordsEachDeviceLastContact(t *testing.T) {
	t.Parallel()

	contacts := map[string]int64{"device-1": 1500, "device-2": 2500}
	mem := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	server := NewServer(Config{Addr: "127.0.0.1:0", RealtimeHub: realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
		Logger: sharedlogger.NewFanoutLogger(mem), LastContacts: contacts}).(*HTTPServer)
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	want := map[string]any{"addr": server.listener.Addr().String(), "lastContacts": contacts}
	if got := mem.Recent()[0].Metadata; !reflect.DeepEqual(got, want) {
		t.Fatalf("expected metadata %#v, got %#v", want, got)
	}
}

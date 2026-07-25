package main

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestAppWiresCaptureQueueOnPersistToRuntimeEventEmit exercises the real
// (non-stubbed) default newCaptureQueue wiring end to end: a record handed
// to the HTTP server's Capture func must round-trip through the async queue,
// persist via Store.UpsertCapture, and reach emitFn as "capture.transaction"
// exactly once, carrying the CaptureRow wire shape (English field names).
func TestAppWiresCaptureQueueOnPersistToRuntimeEventEmit(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	app.newCaptureQueue = nil // exercise the real default OnPersist wiring

	var captureFn func(requestcapture.CaptureRecord) bool
	app.newHTTPServer = func(config api.Config) api.Server {
		captureFn = config.Capture
		return &stubAppHTTPServer{}
	}

	emitted := make(chan contracts.CaptureRow, 4)
	app.emitFn = func(_ context.Context, eventName string, optionalData ...interface{}) {
		if eventName != captureTransactionEventName || len(optionalData) == 0 {
			return
		}
		if row, ok := optionalData[0].(contracts.CaptureRow); ok {
			emitted <- row
		}
	}

	app.startup(context.Background())
	t.Cleanup(func() { closeAppCaptureTestResources(t, app) })
	if captureFn == nil {
		t.Fatal("expected startup to wire a capture func into the http server config")
	}
	if !captureFn(requestcapture.NewCaptureRecord("patch", "device-1")) {
		t.Fatal("expected the capture record to be accepted by the queue")
	}

	select {
	case row := <-emitted:
		if row.Kind != "patch" {
			t.Fatalf("unexpected emitted capture.transaction row: %#v", row)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected capture.transaction to be emitted after the record persisted")
	}
}

// TestAppWiresRealtimeHubCaptureSinkToCaptureQueue exercises the real
// default newRealtimeHub wiring: MemoryHubConfig.Capture must be a.capture,
// so a hub-owned lifecycle event (Register) flows through the same capture
// queue and reaches emitFn as "capture.transaction".
func TestAppWiresRealtimeHubCaptureSinkToCaptureQueue(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	app.newCaptureQueue = nil // exercise the real default OnPersist wiring
	app.newRealtimeHub = nil  // exercise the real default Capture sink wiring
	app.newHTTPServer = func(api.Config) api.Server { return &stubAppHTTPServer{} }

	emitted := make(chan contracts.CaptureRow, 4)
	app.emitFn = func(_ context.Context, eventName string, optionalData ...interface{}) {
		if eventName != captureTransactionEventName || len(optionalData) == 0 {
			return
		}
		if row, ok := optionalData[0].(contracts.CaptureRow); ok {
			emitted <- row
		}
	}

	app.startup(context.Background())
	t.Cleanup(func() { closeAppCaptureTestResources(t, app) })

	hub, ok := app.realtimeHub.(*realtime.MemoryHub)
	if !ok {
		t.Fatal("expected startup to wire a real memory hub")
	}
	if err := hub.Register(context.Background(), stubRealtimeCaptureClient{id: "device-9-1"}); err != nil {
		t.Fatalf("register client: %v", err)
	}

	select {
	case row := <-emitted:
		if row.Kind != "ws_connect" || row.Outcome != "opened" {
			t.Fatalf("unexpected emitted capture.transaction row: %#v", row)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected hub register to flow through the capture queue into a runtime event")
	}
}

// closeAppCaptureTestResources drains the capture queue and closes the
// realtime hub and bridge database opened by the real default wiring
// exercised in this file, so the Windows-locked sqlite file releases before
// t.TempDir() cleanup runs.
func closeAppCaptureTestResources(t *testing.T, app *App) {
	t.Helper()
	if app.captureQueue != nil {
		app.captureQueue.Stop(context.Background())
	}
	if closer, ok := app.realtimeHub.(interface{ Close() error }); ok && closer != nil {
		_ = closer.Close()
	}
	if app.bridgeDB != nil {
		_ = app.bridgeDB.Close()
	}
}

// stubRealtimeCaptureClient is a minimal realtime.Client used only to
// exercise MemoryHub.Register in TestAppWiresRealtimeHubCaptureSinkToCaptureQueue.
type stubRealtimeCaptureClient struct{ id string }

func (c stubRealtimeCaptureClient) ID() string { return c.id }

func (c stubRealtimeCaptureClient) Send(context.Context, []byte) error { return nil }

func (c stubRealtimeCaptureClient) Close() error { return nil }

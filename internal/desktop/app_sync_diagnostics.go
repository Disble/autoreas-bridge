package desktop

import (
	"context"

	apiHandlers "autoreas-bridge/internal/api/handlers"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/syncdiag"
)

// syncDiagnosticsEventDomain is the declared domain for the runtime event the
// ingestion seam emits when a diagnostics report is stored. A constant for the
// same reason websocketLogDomain is one: a domain is a grouping dimension, and
// one prose value in it makes a count grouped by domain meaningless. "sync" is
// taken from the domains actually in use because these reports describe device
// sync cycles (trigger source, cycle id, previous-cycle outcome); "api" would
// name the transport, not the subject.
const syncDiagnosticsEventDomain = "sync"

// syncDiagnosticsStoredEventType follows the domain.verb shape the emitted
// event types in this codebase follow (e.g. "websocket.register"): the stored
// verb names what happened to the report, so Duplicate and Shed outcomes have
// no event type to emit under.
const syncDiagnosticsStoredEventType = "sync.diagnostics_stored"

// ingestSyncDiagnostics is the API seam for mobile-sourced device sync
// diagnostics ingestion (POST /api/sync/diagnostics). Returns nil when
// bridge SQLite is unavailable, so the route reports 503 itself.
//
// The returned function emits exactly one runtime event when, and only when,
// the outcome is Stored. Duplicate (a cycle_id retry) is not new information
// and Shed (a write that did not complete) is not a stored report, so neither
// emits anything -- the live store's duplicate deliveries outnumber fresh
// reports, and one event per delivery would amplify the noisiest traffic in
// the system.
func (a *App) ingestSyncDiagnostics() apiHandlers.IngestSyncDiagnosticsFunc {
	if a.bridgeDB == nil {
		return nil
	}
	store := syncdiag.NewStore(a.bridgeDB, syncdiag.StoreConfig{})
	insert := store.InsertReport
	return func(ctx context.Context, record syncdiag.Record) (syncdiag.IngestOutcome, error) {
		outcome, err := insert(ctx, record)
		if outcome == syncdiag.Stored {
			a.logSyncDiagnosticsStored(record)
		}
		return outcome, err
	}
}

// logSyncDiagnosticsStored emits one info-level runtime event for a stored
// diagnostics report, mirroring the shared-logger fanout every other runtime
// event uses: the fanout carries the entry to stdout, the in-memory log (and
// its observability Wails event) and the persisted event log. The message
// identifies the cycle and the device without dumping the payload, and
// EntityID carries the device so the entry is findable by device rather than
// only by free-text search over its message. Nil-safe: App instances that
// never wire a shared logger (e.g. tests) degrade to a no-op.
func (a *App) logSyncDiagnosticsStored(record syncdiag.Record) {
	if a.sharedLogger == nil {
		return
	}
	a.sharedLogger.Logf(syncDiagnosticsEventDomain, sharedlogger.LevelInfo, sharedlogger.Fields{
		EntityID:  record.DeviceID,
		EventType: syncDiagnosticsStoredEventType,
	}, "stored sync diagnostics report for cycle %s from device %s", record.CycleID, record.DeviceID)
}

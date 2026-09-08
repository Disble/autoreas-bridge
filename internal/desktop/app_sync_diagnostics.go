package desktop

import (
	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/observability/syncdiag"
)

// ingestSyncDiagnostics is the API seam for mobile-sourced device sync
// diagnostics ingestion (POST /api/sync/diagnostics). Returns nil when
// bridge SQLite is unavailable, so the route reports 503 itself.
func (a *App) ingestSyncDiagnostics() apiHandlers.IngestSyncDiagnosticsFunc {
	if a.bridgeDB == nil {
		return nil
	}
	store := syncdiag.NewStore(a.bridgeDB, syncdiag.StoreConfig{})
	return store.InsertReport
}

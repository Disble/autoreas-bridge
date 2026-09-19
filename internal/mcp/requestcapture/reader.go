package requestcapture

import (
	"context"

	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/obserr"
	obs "autoreas-bridge/internal/observability/requestcapture"
)

// runtimeEventLogUnavailableMessage is the single wording every unavailable-log error carries.
const runtimeEventLogUnavailableMessage = "runtime event log unavailable"

type sqliteReader struct {
	path   string
	ro     *obs.ReadOnlyDB
	r      *obs.Reader
	events *eventlog.Reader
}

// OpenReader opens a read-only SQLite reader for the request-capture MCP
// sidecar. The event reader is built AFTER OpenReadOnlyDB succeeds, over the
// same already-verified handle (ro.DB()) -- never inside OpenReadOnlyDB
// itself, which fails closed on a capture-schema mismatch. Probing
// runtime_events there would kill the sidecar for every bridge database
// that predates this change.
func OpenReader(path string) (*sqliteReader, error) {
	ro, err := obs.OpenReadOnlyDB(path)
	if err != nil {
		return nil, err
	}
	return &sqliteReader{path: path, ro: ro, r: obs.NewReader(ro.DB()), events: eventlog.NewReader(ro.DB())}, nil
}

// EventsAvailable reports whether runtime_events exists on this handle. A
// nil event reader (e.g. a sqliteReader built directly by an older test
// fixture, bypassing OpenReader) is treated as unavailable rather than
// panicking.
func (r *sqliteReader) EventsAvailable() bool {
	return r.events != nil && r.events.Available()
}

// SearchEvents delegates to eventlog.Reader.Search over the shared handle.
func (r *sqliteReader) SearchEvents(ctx context.Context, params eventlog.EventSearchParams) (eventlog.EventSearchPage, error) {
	if r.events == nil {
		return eventlog.EventSearchPage{}, obserr.Unavailable(runtimeEventLogUnavailableMessage)
	}
	return r.events.Search(ctx, params)
}

// SummaryEvents delegates to eventlog.Reader.Summary over the shared handle.
func (r *sqliteReader) SummaryEvents(ctx context.Context, filters eventlog.EventFilters) (eventlog.EventSummaryResult, error) {
	if r.events == nil {
		return eventlog.EventSummaryResult{}, obserr.Unavailable(runtimeEventLogUnavailableMessage)
	}
	return r.events.Summary(ctx, filters)
}

// EventsByCorrelation delegates to eventlog.Reader.EventsByCorrelation over the shared handle.
func (r *sqliteReader) EventsByCorrelation(ctx context.Context, correlationID string, cap int) ([]eventlog.EventRecord, error) {
	if r.events == nil {
		return nil, obserr.Unavailable(runtimeEventLogUnavailableMessage)
	}
	return r.events.EventsByCorrelation(ctx, correlationID, cap)
}

func (r *sqliteReader) Path() string { return r.path }

func (r *sqliteReader) VerifyQueryOnly(ctx context.Context) error { return r.ro.VerifyQueryOnly(ctx) }

func (r *sqliteReader) Close() error { return r.ro.Close() }

func (r *sqliteReader) Search(ctx context.Context, params obs.SearchParams) (obs.SearchPage, error) {
	return r.r.Search(ctx, params)
}

func (r *sqliteReader) Get(ctx context.Context, requestID string) (obs.GetResult, error) {
	return r.r.Get(ctx, requestID)
}

func (r *sqliteReader) Summary(ctx context.Context, filters obs.SearchFilters) (obs.SummaryResult, error) {
	return r.r.Summary(ctx, filters)
}

// Resolve delegates to the shared core resolver.
func (r *sqliteReader) Resolve(ctx context.Context, reference string) ([]ResolveCandidate, error) {
	return r.r.Resolve(ctx, reference)
}

// mapGetResult sanitizes the raw get result before returning it to the MCP tool.
func mapGetResult(result obs.GetResult) (GetRequestContextResult, error) {
	delete(result.Item.Payload, "authorization")
	delete(result.Item.Payload, "auth_token")
	return result, nil
}

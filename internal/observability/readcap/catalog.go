// Package readcap defines the observability read capabilities offered by the core.
// Capability names are canonical read-surface names, and adapters declare which
// capabilities they expose.
package readcap

// Store identifies the persisted observability store a capability reads.
type Store string

const (
	// StoreRequestCaptures stores captured request data.
	StoreRequestCaptures Store = "request_captures"
	// StoreRuntimeEvents stores emitted runtime events.
	StoreRuntimeEvents Store = "runtime_events"
	// StoreSyncDiagnostics stores device sync diagnostics: the cycle_report
	// kind's events inside the kind-discriminated telemetry store. The store
	// string is the physical table, so it moves with the write path while the
	// capability name above it stays fixed.
	StoreSyncDiagnostics Store = "device_telemetry_events"
)

// Kind classifies the operation a read capability performs.
type Kind string

const (
	// KindQuery reads matching records.
	KindQuery Kind = "query"
	// KindAggregate summarizes matching records.
	KindAggregate Kind = "aggregate"
	// KindResolve resolves a reference to matching records.
	KindResolve Kind = "resolve"
	// KindTimeline reads correlation-ordered records.
	KindTimeline Kind = "timeline"
)

// Capability describes one canonical observability read surface.
type Capability struct {
	// Name is the canonical name adapters use to declare this read surface.
	Name string
	// Store is the observability store this capability reads.
	Store Store
	// Kind classifies the read operation this capability performs.
	Kind Kind
}

// All returns every canonical observability read capability. Capability names
// are canonical read-surface names, and adapters declare which capabilities
// they expose. Each call returns a fresh slice.
func All() []Capability {
	return []Capability{
		{Name: "search_requests", Store: StoreRequestCaptures, Kind: KindQuery},
		{Name: "resolve_request_context", Store: StoreRequestCaptures, Kind: KindResolve},
		{Name: "get_request_context", Store: StoreRequestCaptures, Kind: KindQuery},
		{Name: "summary_requests", Store: StoreRequestCaptures, Kind: KindAggregate},
		{Name: "search_events", Store: StoreRuntimeEvents, Kind: KindQuery},
		{Name: "get_correlation_timeline", Store: StoreRuntimeEvents, Kind: KindTimeline},
		{Name: "summary_events", Store: StoreRuntimeEvents, Kind: KindAggregate},
		// list_device_sync_diagnostics is the only attributed source of a
		// device's own sync reports: device_telemetry_events is the sole store
		// that can attribute a report to a device (the diagnostics capture in
		// request_captures carries the report but not the device), and this
		// capability reads the cycle_report kind inside it.
		{Name: "list_device_sync_diagnostics", Store: StoreSyncDiagnostics, Kind: KindQuery},
	}
}

// Names returns every canonical observability read capability name in catalog order.
func Names() []string {
	capabilities := All()
	names := make([]string, len(capabilities))
	for index, capability := range capabilities {
		names[index] = capability.Name
	}
	return names
}

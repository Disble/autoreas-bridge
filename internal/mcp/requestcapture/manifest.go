package requestcapture

// sidecarToolNames is the MCP adapter's declaration of what it exposes. Its
// membership plus ExcludedCapabilities must partition the core catalog, and
// the shared parity fitness function enforces that; its order is the roster's
// own and is pinned by the MCP manifest test.
var sidecarToolNames = []string{
	"resolve_request_context",
	"search_requests",
	"get_request_context",
	"summary_requests",
	"search_events",
	"get_correlation_timeline",
	"summary_events",
}

// ExposedCapabilities returns a copy of every read capability exposed by the
// MCP sidecar.
func ExposedCapabilities() []string {
	return append([]string(nil), sidecarToolNames...)
}

// ExcludedCapabilities returns catalog capabilities intentionally absent from
// the MCP sidecar, each with its mechanical reason.
func ExcludedCapabilities() map[string]string {
	return map[string]string{
		"list_device_sync_diagnostics": "No MCP tool reads the device_sync_diagnostics table, so the sidecar cannot answer a per-device sync diagnostics question.",
	}
}

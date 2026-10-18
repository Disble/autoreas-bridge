package requestcapture

import "autoreas-bridge/internal/observability/readcap"

// toolNames is the sidecar's tool roster, one tool per Activity question,
// in registration order.
var toolNames = []string{
	"get_status",
	"list_incidents",
	"get_incident",
	"get_request",
	"search_history",
	"list_runs",
	"get_run_story",
	"list_recorder",
	"list_response_versions",
}

// deletedCapabilityReason is why the sidecar serves no catalog capability.
const deletedCapabilityReason = "Deleted from the MCP sidecar (docs/observability/rollout.md, No legacy); the activity tools over internal/observability/activityread replace it."

// ToolNames returns a copy of the sidecar's tool roster.
func ToolNames() []string {
	return append([]string(nil), toolNames...)
}

// ExposedCapabilities returns the readcap catalog capabilities the sidecar
// serves: none, since its tools answer the Activity questions instead.
func ExposedCapabilities() []string {
	return []string{}
}

// ExcludedCapabilities returns every readcap catalog capability with the
// reason the sidecar no longer serves it.
func ExcludedCapabilities() map[string]string {
	excluded := map[string]string{}
	for _, name := range readcap.Names() {
		excluded[name] = deletedCapabilityReason
	}
	return excluded
}

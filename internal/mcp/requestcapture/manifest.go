package requestcapture

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

// ToolNames returns a copy of the sidecar's tool roster.
func ToolNames() []string {
	return append([]string(nil), toolNames...)
}

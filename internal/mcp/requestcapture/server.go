package requestcapture

import (
	"context"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// coverageNote closes every tool description: the answer's coverage object
// is what tells "no data" apart from "nothing happened".
const coverageNote = " The coverage object lists the tables read and the time range they hold; an empty answer only means nothing inside that range."

// Server is the read-only MCP sidecar over the Activity read service.
type Server struct {
	tools []string
	mcp   *mcp.Server
}

// NewServer builds the sidecar with one tool per Activity question. now is
// the clock the time windows are read against; nil means time.Now.
func NewServer(reader *Reader, now func() time.Time) *Server {
	if now == nil {
		now = time.Now
	}
	t := tools{reader: reader, now: now}
	sdk := mcp.NewServer(&mcp.Implementation{Name: "autoreas-request-mcp", Version: "v2.0.0"}, nil)
	add(sdk, "get_status", "Is everything fine right now? The status sentence, last phone contact, today's counts, the 24-hour chart, open incidents and recent changes.", t.status)
	add(sdk, "list_incidents", "Incidents of the last 7 days, one per fingerprint, newest first, filtered by where it happened.", t.incidents)
	add(sdk, "get_incident", "One incident occurrence: its cause, the requests, events and phone reports of its window, and earlier occurrences. found is false when it is no longer stored.", t.incident)
	add(sdk, "get_request", "Captured requests with headers and bodies, by bridge request_id (one row) or by the phone's client_request_id (every row sharing it, newest first). Credentials are stripped.", t.request)
	add(sdk, "search_history", "The 90-day ledger, newest first, grouped by day: changes, phone reports, connections (connects, disconnects and the bridge's ws_broadcast pushes), events and incidents. Pages with cursor.", t.history)
	add(sdk, "list_runs", "Runs of the last 7 days: events sharing one correlation id, with their worst level.", t.runs)
	add(sdk, "get_run_story", "Every event of one run in order, with metadata.", t.runStory)
	add(sdk, "list_recorder", "The 2-hour recorder: requests and events merged newest first, summary fields only. Pages with cursor.", t.recorder)
	add(sdk, "list_response_versions", "The distinct response bodies one route template returned, with first seen, last seen and count: the latest 20, or with at_ms at most 20 whose first-to-last-seen interval holds that time. Intervals of alternating bodies overlap, so several versions can hold one time; only a kept request's response_hash names the exact body.", t.responseVersions)
	add(sdk, "get_hourly_totals", "One local day of the 90-day hourly rollup: per hour, route template, status class (http_status/100, 0 when absent) and device, the request count and the maximum duration in ms.", t.hourlyTotals)
	add(sdk, "count_events", "How many runtime events of one event_type happened over whole local days of the 90-day ledger (default all 90), optionally grouped by one top-level metadata key, e.g. download.episode_downloaded grouped by siteHost. Groups are largest first; value null groups the events without the key, with a null value, or whose metadata was stored truncated. Noise event types (sync.reconcile, tracer.step) are kept only for the 2-hour recorder.", t.countEvents)
	return &Server{tools: ToolNames(), mcp: sdk}
}

// add registers one read-only tool whose description ends with the coverage
// note. The output is untyped on purpose: the answers carry the read
// service's views, whose nil lists encode as null, and the SDK would reject
// them against a schema inferred from the Go types.
func add[In, Out any](sdk *mcp.Server, name, description string, answer func(context.Context, In) (Out, error)) {
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true}
	mcp.AddTool(sdk, &mcp.Tool{Name: name, Description: description + coverageNote, Annotations: readOnly},
		func(ctx context.Context, _ *mcp.CallToolRequest, in In) (*mcp.CallToolResult, any, error) {
			out, err := answer(ctx, in)
			return nil, out, err
		})
}

// ToolNames returns the names of the registered MCP tools.
func (s *Server) ToolNames() []string {
	return append([]string(nil), s.tools...)
}

// Run serves the MCP sidecar over stdio until the context is canceled.
func (s *Server) Run(ctx context.Context) error {
	return s.mcp.Run(ctx, &mcp.StdioTransport{})
}

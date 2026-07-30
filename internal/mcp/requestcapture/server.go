package requestcapture

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Server is the MCP sidecar that exposes request-capture query tools.
type Server struct {
	reader Reader
	tools  []string
	mcp    *mcp.Server
}

// NewServer builds the MCP sidecar server with the seven read-only tools:
// the four request-capture tools plus the three runtime-event tools
// (search_events, get_correlation_timeline, summary_events).
func NewServer(reader Reader) *Server {
	server := &Server{reader: reader, tools: []string{
		"resolve_request_context", "search_requests", "get_request_context", "summary_requests",
		"search_events", "get_correlation_timeline", "summary_events",
	}}
	sdk := mcp.NewServer(&mcp.Implementation{Name: "autoreas-request-mcp", Version: "v1.0.0"}, nil)
	mcp.AddTool(sdk, &mcp.Tool{Name: "search_requests", Description: "Search captured bridge requests"}, func(ctx context.Context, req *mcp.CallToolRequest, input SearchRequestsInput) (*mcp.CallToolResult, SearchRequestsResult, error) {
		result, err := searchRequests(ctx, reader, input)
		return nil, result, err
	})
	mcp.AddTool(sdk, &mcp.Tool{Name: "resolve_request_context", Description: "Resolve an imprecise captured-request reference"}, func(ctx context.Context, req *mcp.CallToolRequest, input ResolveRequestContextInput) (*mcp.CallToolResult, ResolveRequestContextResult, error) {
		result, err := resolveRequestContext(ctx, reader, input)
		return nil, result, err
	})
	mcp.AddTool(sdk, &mcp.Tool{Name: "get_request_context", Description: "Get one exact captured request"}, func(ctx context.Context, req *mcp.CallToolRequest, input GetRequestContextInput) (*mcp.CallToolResult, GetRequestContextResult, error) {
		result, err := getRequestContext(ctx, reader, input)
		return nil, result, err
	})
	mcp.AddTool(sdk, &mcp.Tool{Name: "summary_requests", Description: "Aggregate captured requests into per-route/status/outcome counts and bounded error samples"}, func(ctx context.Context, req *mcp.CallToolRequest, input SummaryRequestsInput) (*mcp.CallToolResult, SummaryRequestsResult, error) {
		result, err := summaryRequests(ctx, reader, input)
		return nil, result, err
	})
	registerEventTools(sdk, reader)
	server.mcp = sdk
	return server
}

// registerEventTools registers the three runtime-event tools when reader
// also implements EventReader (the production sqliteReader does; simple
// test doubles built only against the capture-only Reader interface do
// not, and simply skip registration -- ToolNames() still lists all seven
// names regardless, since it is independent of the underlying mcp.Server).
func registerEventTools(sdk *mcp.Server, reader Reader) {
	events, ok := reader.(EventReader)
	if !ok {
		return
	}
	mcp.AddTool(sdk, &mcp.Tool{Name: "search_events", Description: "Search persisted runtime events"}, func(ctx context.Context, req *mcp.CallToolRequest, input SearchEventsInput) (*mcp.CallToolResult, SearchEventsResult, error) {
		result, err := searchEvents(ctx, events, input)
		return nil, result, err
	})
	mcp.AddTool(sdk, &mcp.Tool{Name: "get_correlation_timeline", Description: "Resolve one correlation id into its captured requests and persisted runtime events"}, func(ctx context.Context, req *mcp.CallToolRequest, input GetCorrelationTimelineInput) (*mcp.CallToolResult, CorrelationTimelineResult, error) {
		result, err := getCorrelationTimeline(ctx, reader, events, input)
		return nil, result, err
	})
	mcp.AddTool(sdk, &mcp.Tool{Name: "summary_events", Description: "Aggregate persisted runtime events into per-domain/level/event-type counts and bounded newest samples"}, func(ctx context.Context, req *mcp.CallToolRequest, input SummaryEventsInput) (*mcp.CallToolResult, SummaryEventsResult, error) {
		result, err := summaryEvents(ctx, events, input)
		return nil, result, err
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

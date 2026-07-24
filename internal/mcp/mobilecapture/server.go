package mobilecapture

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Server is the MCP sidecar that exposes mobile-capture query tools.
type Server struct {
	reader Reader
	tools  []string
	mcp    *mcp.Server
}

// NewServer builds the MCP sidecar server with the three read-only capture tools.
func NewServer(reader Reader) *Server {
	server := &Server{reader: reader, tools: []string{"resolve_mobile_request_context", "search_mobile_requests", "get_mobile_request_context", "summary_mobile_requests"}}
	sdk := mcp.NewServer(&mcp.Implementation{Name: "autoreas-mobile-request-mcp", Version: "v1.0.0"}, nil)
	mcp.AddTool(sdk, &mcp.Tool{Name: "search_mobile_requests", Description: "Search captured mobile requests"}, func(ctx context.Context, req *mcp.CallToolRequest, input SearchMobileRequestsInput) (*mcp.CallToolResult, SearchMobileRequestsResult, error) {
		result, err := searchMobileRequests(ctx, reader, input)
		return nil, result, err
	})
	mcp.AddTool(sdk, &mcp.Tool{Name: "resolve_mobile_request_context", Description: "Resolve an imprecise mobile request reference"}, func(ctx context.Context, req *mcp.CallToolRequest, input ResolveMobileRequestContextInput) (*mcp.CallToolResult, ResolveMobileRequestContextResult, error) {
		result, err := resolveMobileRequestContext(ctx, reader, input)
		return nil, result, err
	})
	mcp.AddTool(sdk, &mcp.Tool{Name: "get_mobile_request_context", Description: "Get one exact captured mobile request"}, func(ctx context.Context, req *mcp.CallToolRequest, input GetMobileRequestContextInput) (*mcp.CallToolResult, GetMobileRequestContextResult, error) {
		result, err := getMobileRequestContext(ctx, reader, input)
		return nil, result, err
	})
	mcp.AddTool(sdk, &mcp.Tool{Name: "summary_mobile_requests", Description: "Aggregate captured mobile requests into per-route/status/outcome counts and bounded error samples"}, func(ctx context.Context, req *mcp.CallToolRequest, input SummaryMobileRequestsInput) (*mcp.CallToolResult, SummaryMobileRequestsResult, error) {
		result, err := summaryMobileRequests(ctx, reader, input)
		return nil, result, err
	})
	server.mcp = sdk
	return server
}

// ToolNames returns the names of the registered MCP tools.
func (s *Server) ToolNames() []string {
	return append([]string(nil), s.tools...)
}

// Run serves the MCP sidecar over stdio until the context is canceled.
func (s *Server) Run(ctx context.Context) error {
	return s.mcp.Run(ctx, &mcp.StdioTransport{})
}

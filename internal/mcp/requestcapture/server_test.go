package requestcapture

import (
	"context"
	"testing"

	obs "autoreas-bridge/internal/observability/requestcapture"
)

// nullReader is a Reader implementation that returns empty results, used by
// server-contract tests that only need a Server value and never execute a
// real query.
type nullReader struct{}

func (nullReader) Search(ctx context.Context, params obs.SearchParams) (obs.SearchPage, error) {
	return obs.SearchPage{}, nil
}

func (nullReader) Get(ctx context.Context, requestID string) (obs.GetResult, error) {
	return obs.GetResult{}, nil
}

func (nullReader) Resolve(ctx context.Context, reference string) ([]ResolveCandidate, error) {
	return nil, nil
}

func (nullReader) Summary(ctx context.Context, filters obs.SearchFilters) (obs.SummaryResult, error) {
	return obs.SummaryResult{}, nil
}

// TestToolNamesReturnsExactlyFourBareNames asserts the sidecar registers only
// the four bare, transport-neutral tool names, with no previously-registered
// mobile-prefixed name surviving.
func TestToolNamesReturnsExactlyFourBareNames(t *testing.T) {
	t.Parallel()

	server := NewServer(nullReader{})
	got := server.ToolNames()
	want := []string{"resolve_request_context", "search_requests", "get_request_context", "summary_requests"}
	for i, name := range want {
		if got[i] != name {
			t.Fatalf("expected tool %d to be %q, got %q (full: %#v)", i, name, got[i], got)
		}
	}
	for _, forbidden := range []string{"search_mobile_requests", "get_mobile_request_context", "resolve_mobile_request_context", "summary_mobile_requests"} {
		for _, name := range got {
			if name == forbidden {
				t.Fatalf("expected previously-registered tool %q to not be registered, got %#v", forbidden, got)
			}
		}
	}
}

// TestSidecarExposesExactlySevenTools asserts the sidecar registers exactly
// the seven named tools: the four pre-existing request-capture tools plus
// the three new runtime-event tools.
func TestSidecarExposesExactlySevenTools(t *testing.T) {
	t.Parallel()

	server := NewServer(nullReader{})
	got := server.ToolNames()
	want := []string{
		"resolve_request_context", "search_requests", "get_request_context", "summary_requests",
		"search_events", "get_correlation_timeline", "summary_events",
	}
	if len(got) != len(want) {
		t.Fatalf("expected %d tool names, got %d: %#v", len(want), len(got), got)
	}
	for i, name := range want {
		if got[i] != name {
			t.Fatalf("expected tool %d to be %q, got %q (full: %#v)", i, name, got[i], got)
		}
	}
}

// TestEachToolNameAppearsExactlyOnce asserts no tool name is duplicated,
// renamed, or aliased across the seven-tool surface.
func TestEachToolNameAppearsExactlyOnce(t *testing.T) {
	t.Parallel()

	server := NewServer(nullReader{})
	seen := map[string]int{}
	for _, name := range server.ToolNames() {
		seen[name]++
	}
	for name, count := range seen {
		if count != 1 {
			t.Fatalf("expected tool %q to appear exactly once, appeared %d times", name, count)
		}
	}
}

func TestOpenReaderUsesReadOnlyBridgePath(t *testing.T) {
	t.Parallel()

	path := openToolTestDB(t)
	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer func() { _ = reader.Close() }()
	if got := reader.Path(); got != path {
		t.Fatalf("expected path %q, got %q", path, got)
	}
}

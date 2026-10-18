package requestcapture

import (
	"context"
	"path/filepath"
	"slices"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"autoreas-bridge/internal/observability/readcap"
)

// newToolRoster is the sidecar's tool list, one tool per question.
var newToolRoster = []string{
	"get_status", "list_incidents", "get_incident", "get_request", "search_history",
	"list_runs", "get_run_story", "list_recorder", "list_response_versions",
}

// TestServerRegistersOnlyTheActivityTools checks the registered tools over
// the protocol: the new roster, and none of the deleted tools.
func TestServerRegistersOnlyTheActivityTools(t *testing.T) {
	h := newHarness(t)
	listed, err := h.session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	var names []string
	for _, tool := range listed.Tools {
		names = append(names, tool.Name)
		if tool.Description == "" {
			t.Fatalf("tool %s has no description", tool.Name)
		}
	}
	slices.Sort(names)
	want := slices.Sorted(slices.Values(newToolRoster))
	if !slices.Equal(names, want) {
		t.Fatalf("registered tools = %v, want %v", names, want)
	}
	for _, deleted := range readcap.Names() {
		if slices.Contains(names, deleted) {
			t.Fatalf("deleted tool %q is still registered", deleted)
		}
		result, err := h.session.CallTool(context.Background(), &mcp.CallToolParams{Name: deleted, Arguments: map[string]any{}})
		if err == nil && !result.IsError {
			t.Fatalf("deleted tool %q answered", deleted)
		}
	}
}

// TestToolNamesMatchesTheRoster checks the declared roster and that callers
// get a copy.
func TestToolNamesMatchesTheRoster(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.db")
	bootstrapDB(t, path)
	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })
	server := NewServer(reader, nil)
	got := server.ToolNames()
	if !slices.Equal(got, newToolRoster) {
		t.Fatalf("tool names = %v, want %v", got, newToolRoster)
	}
	got[0] = "mutated"
	if server.ToolNames()[0] != "get_status" {
		t.Fatal("ToolNames must return a copy")
	}
}

// TestManifestExcludesEveryCatalogCapability checks that the sidecar
// exposes none of the deleted catalog capabilities and gives each a reason.
func TestManifestExcludesEveryCatalogCapability(t *testing.T) {
	if exposed := ExposedCapabilities(); exposed == nil || len(exposed) != 0 {
		t.Fatalf("exposed = %#v, want an empty list", exposed)
	}
	excluded := ExcludedCapabilities()
	for _, name := range readcap.Names() {
		if excluded[name] == "" {
			t.Fatalf("catalog capability %q has no exclusion reason: %#v", name, excluded)
		}
	}
	if len(excluded) != len(readcap.Names()) {
		t.Fatalf("excluded = %#v", excluded)
	}
}

// TestReaderIsQueryOnly checks that the sidecar's handle cannot write and
// that a missing database fails closed.
func TestReaderIsQueryOnly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.db")
	bootstrapDB(t, path)
	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })
	if err := reader.VerifyQueryOnly(context.Background()); err != nil {
		t.Fatalf("verify query_only: %v", err)
	}
	if reader.Path() != path {
		t.Fatalf("path = %q", reader.Path())
	}
	if _, err := OpenReader(filepath.Join(t.TempDir(), "missing.db")); err == nil {
		t.Fatal("expected a missing database to fail closed")
	}
}

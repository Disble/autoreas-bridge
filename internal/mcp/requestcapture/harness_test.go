package requestcapture

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"autoreas-bridge/internal/activity"
	bridgeSync "autoreas-bridge/internal/sync"
)

// testNow is the fixed clock every MCP test serves: 2026-10-17 18:00:00 UTC.
var testNow = time.Date(2026, 10, 17, 18, 0, 0, 0, time.UTC)

// minutesAgo returns the epoch milliseconds n minutes before testNow.
func minutesAgo(n int) int64 {
	return testNow.Add(-time.Duration(n) * time.Minute).UnixMilli()
}

// harness is one bridge database served by the MCP sidecar over an
// in-memory transport. db is a writable handle for seeding; the server reads
// through its own read-only handle, as in production.
type harness struct {
	db      *sql.DB
	session *mcp.ClientSession
}

// newHarness bootstraps a fresh bridge database through the real bootstrap
// and connects an MCP client to a sidecar serving it.
func newHarness(t *testing.T) harness {
	t.Helper()
	path := filepath.Join(t.TempDir(), "bridge.db")
	db := bootstrapDB(t, path)
	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	ctx := context.Background()
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := NewServer(reader, func() time.Time { return testNow }).mcp.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("connect server: %v", err)
	}
	t.Cleanup(func() { _ = serverSession.Close() })
	session, err := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "v0"}, nil).Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("connect client: %v", err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return harness{db: db, session: session}
}

// bootstrapDB creates a bridge database at path through the real bootstrap
// and returns a writable handle closed with the test.
func bootstrapDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// exec runs one seeding statement and fails the test on error.
func (h harness) exec(t *testing.T, statement string, args ...any) {
	t.Helper()
	if _, err := h.db.ExecContext(context.Background(), statement, args...); err != nil {
		t.Fatalf("exec %q: %v", statement, err)
	}
}

// call invokes one tool and decodes its structured result into out. It fails
// the test when the tool reports an error.
func (h harness) call(t *testing.T, name string, args map[string]any, out any) {
	t.Helper()
	result := h.callRaw(t, name, args)
	if result.IsError {
		t.Fatalf("%s returned an error: %s", name, toolText(result))
	}
	raw, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatalf("marshal %s result: %v", name, err)
	}
	if err := json.Unmarshal(raw, out); err != nil {
		t.Fatalf("decode %s result %s: %v", name, raw, err)
	}
}

// callError invokes one tool that must fail and returns its error text.
func (h harness) callError(t *testing.T, name string, args map[string]any) string {
	t.Helper()
	result := h.callRaw(t, name, args)
	if !result.IsError {
		t.Fatalf("%s(%v) succeeded, want an error", name, args)
	}
	return toolText(result)
}

// callRaw invokes one tool and fails the test on a protocol error.
func (h harness) callRaw(t *testing.T, name string, args map[string]any) *mcp.CallToolResult {
	t.Helper()
	if args == nil {
		args = map[string]any{}
	}
	result, err := h.session.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("call %s: %v", name, err)
	}
	return result
}

// toolText joins the text content of a tool result.
func toolText(result *mcp.CallToolResult) string {
	text := ""
	for _, content := range result.Content {
		if part, ok := content.(*mcp.TextContent); ok {
			text += part.Text
		}
	}
	return text
}

// insertCapture stores one request_captures row.
func (h harness) insertCapture(t *testing.T, id, clientID, route string, atMS int64, status int) {
	t.Helper()
	h.exec(t, `INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport, device_id,
		device_name, outcome, http_status, payload_json, correlation_json, response_body, client_request_id)
		VALUES (?, ?, 'get', ?, 'http', 'device-1', 'SM-X800', 'completed', ?, '{"authorization":"Bearer x"}', '{}',
		'{"ok":true}', ?)`, id, atMS, route, status, clientID)
}

// insertEvent stores one runtime_events row.
func (h harness) insertEvent(t *testing.T, atMS int64, domain, level, message, correlationID string) {
	t.Helper()
	h.exec(t, `INSERT INTO runtime_events (occurred_at_ms, domain, level, message, correlation_id, event_type)
		VALUES (?, ?, ?, ?, NULLIF(?, ''), 'download.step')`, atMS, domain, level, message, correlationID)
}

// insertChange records one domain history change through internal/activity, the table's owner.
func (h harness) insertChange(t *testing.T, atMS int64) {
	t.Helper()
	err := activity.NewStore(activity.NewSQLiteProvider(h.db)).RecordActivity(context.Background(), activity.Record{
		Source: "desktop", ActionType: "episode_adjusted", AnimeID: "anime-1", AnimeName: "Anime", OccurredAtMs: atMS,
		BeforeJSON: []byte(`{"Estado":0,"NroCapVisto":10,"Activo":1}`), AfterJSON: []byte(`{"Estado":0,"NroCapVisto":11,"Activo":1}`),
	})
	if err != nil {
		t.Fatalf("record change: %v", err)
	}
}

// insertIncident stores one occurrence with the standard window and returns its id.
func (h harness) insertIncident(t *testing.T, fingerprint string, atMS int64, sourceID string) int64 {
	t.Helper()
	result, err := h.db.Exec(`INSERT INTO incidents (fingerprint, reason, occurred_at_ms, window_start_ms,
		window_end_ms, source_kind, source_id) VALUES (?, 'server_error', ?, ?, ?, 'request', ?)`,
		fingerprint, atMS, atMS-2*60*1000, atMS+30*1000, sourceID)
	if err != nil {
		t.Fatalf("insert incident: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("incident id: %v", err)
	}
	return id
}

// coverageOf returns the range of one named source, failing when absent.
func coverageOf(t *testing.T, coverage Coverage, source string) *TimeRange {
	t.Helper()
	for _, s := range coverage.Sources {
		if s.Source == source {
			return s.Range
		}
	}
	t.Fatalf("coverage has no source %q: %+v", source, coverage.Sources)
	return nil
}

// sourceNames lists the coverage source names in order.
func sourceNames(coverage Coverage) []string {
	names := make([]string, len(coverage.Sources))
	for i, s := range coverage.Sources {
		names[i] = s.Source
	}
	return names
}

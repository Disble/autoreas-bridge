package requestcapture

import (
	"context"
	"testing"

	"autoreas-bridge/internal/observability/retention"
)

// sourceOf returns one named coverage source, failing when absent.
func sourceOf(t *testing.T, coverage Coverage, name string) SourceRange {
	t.Helper()
	for _, s := range coverage.Sources {
		if s.Source == name {
			return s
		}
	}
	t.Fatalf("coverage has no source %q: %+v", name, coverage.Sources)
	return SourceRange{}
}

// TestSweptRequestIsNotReportedAsNeverExisting checks that after a sweep a
// request older than the recorder span is missing, and the coverage says
// every row is held only from complete_from, not from the oldest ledger row.
func TestSweptRequestIsNotReportedAsNeverExisting(t *testing.T) {
	h := newHarness(t)
	h.exec(t, `INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport, device_id,
		device_name, outcome, payload_json, correlation_json) VALUES ('ws-old', ?, 'ws_connect', '/ws', 'websocket',
		'device-1', 'SM-X800', 'completed', '{}', '{}')`, minutesAgo(600))
	h.insertCapture(t, "req-swept", "", "/api/sync/reconcile", minutesAgo(180), 200)
	h.insertCapture(t, "req-new", "", "/api/status", minutesAgo(5), 200)
	if _, err := retention.Sweep(context.Background(), h.db, testNow); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	var got RequestResult
	h.call(t, "get_request", map[string]any{"request_id": "req-swept"}, &got)
	completeFrom := minutesAgo(120)
	if got.Found || got.Coverage.Covered == nil || got.Coverage.Covered.FromMS < completeFrom || got.Coverage.Covered.ToMS != minutesAgo(5) {
		t.Fatalf("swept request = found %v, covered %+v", got.Found, got.Coverage.Covered)
	}
	captures := sourceOf(t, got.Coverage, "request_captures")
	if captures.Range == nil || captures.Range.FromMS != minutesAgo(600) {
		t.Fatalf("captures range must keep the oldest retained row: %+v", captures.Range)
	}
	if captures.CompleteFrom == nil || captures.CompleteFrom.MS != completeFrom || captures.CompleteFrom.ISO != "2026-10-17T16:00:00Z" {
		t.Fatalf("complete_from = %+v", captures.CompleteFrom)
	}
	if captures.BeforeCompleteFrom != "only writes, WebSocket connections, non-noise events and incident windows are kept" {
		t.Fatalf("before_complete_from = %q", captures.BeforeCompleteFrom)
	}

	var history HistoryResult
	h.call(t, "search_history", nil, &history)
	if history.Coverage.Covered == nil || history.Coverage.Covered.FromMS != minutesAgo(600) {
		t.Fatalf("ledger answers keep the oldest row: %+v", history.Coverage.Covered)
	}
}

// TestCompleteFromIsTheOldestRowInsideTheRecorderSpan checks the boundary:
// when every row is newer than the recorder span, complete_from is the oldest row.
func TestCompleteFromIsTheOldestRowInsideTheRecorderSpan(t *testing.T) {
	h := newHarness(t)
	h.insertEvent(t, minutesAgo(30), "download", "info", "started", "run-1")
	h.insertEvent(t, minutesAgo(10), "download", "info", "done", "run-1")

	var story RunStoryResult
	h.call(t, "get_run_story", map[string]any{"correlation_id": "run-1"}, &story)
	events := sourceOf(t, story.Coverage, "runtime_events")
	if events.CompleteFrom == nil || events.CompleteFrom.MS != minutesAgo(30) {
		t.Fatalf("complete_from = %+v", events.CompleteFrom)
	}
	if events.BeforeCompleteFrom != "only non-noise events and incident windows are kept" {
		t.Fatalf("before_complete_from = %q", events.BeforeCompleteFrom)
	}
	if story.Coverage.Covered == nil || story.Coverage.Covered.FromMS != minutesAgo(30) {
		t.Fatalf("covered = %+v", story.Coverage.Covered)
	}
	var versions ResponseVersionsResult
	h.call(t, "list_response_versions", map[string]any{"route_template": "/api/animes"}, &versions)
	if sourceOf(t, versions.Coverage, "response_versions").CompleteFrom != nil {
		t.Fatal("a ledger source has no complete_from")
	}
}

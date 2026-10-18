package requestcapture

import (
	"slices"
	"strconv"
	"strings"
	"testing"

	"autoreas-bridge/internal/observability/activityread"
)

// TestGetStatusAnswersNowWithCoverage checks the Now payload, the startup
// marker as the bridge start, and the coverage of the sources Now reads.
func TestGetStatusAnswersNowWithCoverage(t *testing.T) {
	h := newHarness(t)
	h.insertCapture(t, "req-1", "", "/api/status", minutesAgo(1), 200)
	h.exec(t, `INSERT INTO runtime_events (occurred_at_ms, domain, level, message, event_type)
		VALUES (?, 'system', 'info', 'tracer bullet ready', 'tracer.step')`, minutesAgo(30))
	h.insertChange(t, minutesAgo(50))
	h.insertChange(t, minutesAgo(20))

	var got StatusResult
	h.call(t, "get_status", nil, &got)
	if got.Status.Status.Kind != activityread.StatusInSync || got.Status.LastPhoneContactMS == nil || *got.Status.LastPhoneContactMS != minutesAgo(1) {
		t.Fatalf("status = %+v", got.Status)
	}
	if got.BridgeStartedAtMS == nil || *got.BridgeStartedAtMS != minutesAgo(30) || got.Status.UptimeMS != 30*60*1000 {
		t.Fatalf("bridge start = %v, uptime = %d", got.BridgeStartedAtMS, got.Status.UptimeMS)
	}
	want := []string{"request_captures", "runtime_events", "request_rollup_hourly", "incidents", "domain_history"}
	if names := sourceNames(got.Coverage); !slices.Equal(names, want) {
		t.Fatalf("sources = %v, want %v", names, want)
	}
	captures := coverageOf(t, got.Coverage, "request_captures")
	if captures == nil || captures.FromMS != minutesAgo(1) || captures.ToMS != minutesAgo(1) || captures.FromISO != "2026-10-17T17:59:00Z" {
		t.Fatalf("captures range = %+v", captures)
	}
	if changes := coverageOf(t, got.Coverage, "domain_history"); changes == nil || changes.FromMS != minutesAgo(50) || changes.ToMS != minutesAgo(20) {
		t.Fatalf("domain history range = %+v", changes)
	}
	if coverageOf(t, got.Coverage, "incidents") != nil {
		t.Fatal("an empty source must report no range")
	}
	if got.Coverage.Window == nil || got.Coverage.Window.FromMS != minutesAgo(24*60) || got.Coverage.Window.ToMS != testNow.UnixMilli() {
		t.Fatalf("window = %+v", got.Coverage.Window)
	}
	if got.Coverage.Covered == nil || got.Coverage.Covered.FromMS != minutesAgo(50) || got.Coverage.Covered.ToMS != minutesAgo(1) {
		t.Fatalf("covered = %+v", got.Coverage.Covered)
	}
}

// TestEmptyDatabaseReportsNoCoverage checks that an empty answer says its
// sources hold nothing, so it is never read as "nothing happened".
func TestEmptyDatabaseReportsNoCoverage(t *testing.T) {
	h := newHarness(t)
	var got StatusResult
	h.call(t, "get_status", nil, &got)
	if got.BridgeStartedAtMS != nil || got.Status.UptimeMS != 0 {
		t.Fatalf("unknown start = %v, uptime %d", got.BridgeStartedAtMS, got.Status.UptimeMS)
	}
	for _, source := range got.Coverage.Sources {
		if source.Range != nil {
			t.Fatalf("source %s has a range on an empty database: %+v", source.Source, source.Range)
		}
	}
	if got.Coverage.Covered != nil || got.Coverage.Window == nil {
		t.Fatalf("coverage = %+v", got.Coverage)
	}
	var incidents IncidentsResult
	h.call(t, "list_incidents", nil, &incidents)
	if incidents.Incidents == nil || len(incidents.Incidents) != 0 || incidents.Coverage.Covered != nil {
		t.Fatalf("incidents = %+v", incidents)
	}
}

// TestCoverageClipsToTheWindow checks that a source older than the window
// covers only the window's part of it.
func TestCoverageClipsToTheWindow(t *testing.T) {
	h := newHarness(t)
	h.insertCapture(t, "req-old", "", "/api/status", minutesAgo(10*24*60), 200)
	h.insertCapture(t, "req-new", "", "/api/status", minutesAgo(5), 200)
	var got RecorderResult
	h.call(t, "list_recorder", nil, &got)
	if got.Coverage.Covered == nil || got.Coverage.Covered.FromMS != minutesAgo(120) || got.Coverage.Covered.ToMS != minutesAgo(5) {
		t.Fatalf("covered = %+v", got.Coverage.Covered)
	}
	if captures := coverageOf(t, got.Coverage, "request_captures"); captures.FromMS != minutesAgo(10*24*60) {
		t.Fatalf("source range must keep the oldest retained row: %+v", captures)
	}
	if len(got.Recorder.Entries) != 1 || got.Recorder.Entries[0].ID != "req-new" {
		t.Fatalf("entries = %+v", got.Recorder.Entries)
	}

	single := newHarness(t)
	single.insertCapture(t, "req-only", "", "/api/status", minutesAgo(5), 200)
	var one RecorderResult
	single.call(t, "list_recorder", nil, &one)
	if one.Coverage.Covered == nil || one.Coverage.Covered.FromMS != minutesAgo(5) || one.Coverage.Covered.ToMS != minutesAgo(5) {
		t.Fatalf("a single row inside the window must cover its instant: %+v", one.Coverage.Covered)
	}
}

// TestIncidentToolsListAndDetail checks list_incidents, get_incident, a
// missing incident and bad input.
func TestIncidentToolsListAndDetail(t *testing.T) {
	h := newHarness(t)
	h.insertCapture(t, "req-5xx", "", "/api/sync/reconcile", minutesAgo(10), 500)
	id := h.insertIncident(t, "server_error|/api/sync/reconcile|500", minutesAgo(10), "req-5xx")

	var list IncidentsResult
	h.call(t, "list_incidents", map[string]any{"where": "phone"}, &list)
	if len(list.Incidents) != 1 || list.Incidents[0].LatestID != id || !list.Incidents[0].IsError {
		t.Fatalf("incidents = %+v", list.Incidents)
	}
	if names := sourceNames(list.Coverage); !slices.Equal(names, []string{"incidents"}) {
		t.Fatalf("sources = %v", names)
	}

	var detail IncidentResult
	h.call(t, "get_incident", map[string]any{"id": id}, &detail)
	if !detail.Found || detail.Incident.Incident.ID != id || len(detail.Incident.Requests) != 1 || !detail.Incident.Requests[0].ContainsTrigger {
		t.Fatalf("detail = %+v", detail)
	}
	if detail.Coverage.Window == nil || detail.Coverage.Window.FromMS != minutesAgo(12) || detail.Coverage.Window.ToMS != minutesAgo(10)+30*1000 {
		t.Fatalf("detail window = %+v", detail.Coverage.Window)
	}
	want := []string{"incidents", "request_captures", "runtime_events", "device_telemetry_events"}
	if names := sourceNames(detail.Coverage); !slices.Equal(names, want) {
		t.Fatalf("detail sources = %v", names)
	}

	var missing IncidentResult
	h.call(t, "get_incident", map[string]any{"id": id + 99}, &missing)
	if missing.Found || coverageOf(t, missing.Coverage, "incidents") == nil {
		t.Fatalf("missing = %+v", missing)
	}
	if text := h.callError(t, "get_incident", map[string]any{"id": 0}); !strings.Contains(text, "id") {
		t.Fatalf("bad id error = %q", text)
	}
	if text := h.callError(t, "list_incidents", map[string]any{"where": "moon"}); !strings.Contains(text, "moon") {
		t.Fatalf("bad where error = %q", text)
	}
}

// TestGetRequestByKey checks the primary-key read with bodies, credential
// stripping, a miss and bad input.
func TestGetRequestByKey(t *testing.T) {
	h := newHarness(t)
	h.insertCapture(t, "req-1", "cycle-1:3", "/api/status", minutesAgo(3), 200)

	var got RequestResult
	h.call(t, "get_request", map[string]any{"request_id": "req-1"}, &got)
	if !got.Found || len(got.Requests) != 1 || got.Requests[0].RequestID != "req-1" || got.Requests[0].ResponseBody == nil || *got.Requests[0].ResponseBody != `{"ok":true}` {
		t.Fatalf("request = %+v", got)
	}
	if _, leaked := got.Requests[0].Payload["authorization"]; leaked {
		t.Fatalf("credential leaked: %+v", got.Requests[0].Payload)
	}
	if got.Coverage.Window != nil || got.Coverage.Covered == nil || got.Coverage.Covered.FromMS != minutesAgo(3) {
		t.Fatalf("coverage = %+v", got.Coverage)
	}

	var miss RequestResult
	h.call(t, "get_request", map[string]any{"request_id": "req-404"}, &miss)
	if miss.Found || miss.Requests == nil || len(miss.Requests) != 0 || miss.Coverage.Covered == nil {
		t.Fatalf("miss = %+v", miss)
	}
	if text := h.callError(t, "get_request", map[string]any{}); !strings.Contains(text, "request_id") {
		t.Fatalf("empty input error = %q", text)
	}
	both := map[string]any{"request_id": "req-1", "client_request_id": "cycle-1:3"}
	if text := h.callError(t, "get_request", both); !strings.Contains(text, "not both") {
		t.Fatalf("both keys error = %q", text)
	}
}

// TestGetRequestByClientID checks that a client id returns every matching
// row newest first, bounded, with bodies and credentials stripped.
func TestGetRequestByClientID(t *testing.T) {
	h := newHarness(t)
	h.insertCapture(t, "req-old", "cycle-1:3", "/api/status", minutesAgo(9), 200)
	h.insertCapture(t, "req-new", "cycle-1:3", "/api/status", minutesAgo(2), 503)
	h.insertCapture(t, "req-other", "cycle-1:4", "/api/status", minutesAgo(1), 200)

	var got RequestResult
	h.call(t, "get_request", map[string]any{"client_request_id": "cycle-1:3"}, &got)
	if !got.Found || got.Truncated || len(got.Requests) != 2 || got.Requests[0].RequestID != "req-new" || got.Requests[1].RequestID != "req-old" {
		t.Fatalf("requests = %+v", got)
	}
	if got.Requests[0].ResponseBody == nil || got.Requests[0].ClientRequestID != "cycle-1:3" {
		t.Fatalf("row = %+v", got.Requests[0])
	}
	if _, leaked := got.Requests[1].Payload["authorization"]; leaked {
		t.Fatalf("credential leaked: %+v", got.Requests[1].Payload)
	}

	if clientRequestLimit != 10 {
		t.Fatalf("docs/openapi.yaml promises at most 10 rows per client id, limit is %d", clientRequestLimit)
	}
	for i := range clientRequestLimit {
		h.insertCapture(t, "req-retry-"+strconv.Itoa(i), "cycle-2:1", "/api/status", minutesAgo(20+i), 200)
	}
	var exact RequestResult
	h.call(t, "get_request", map[string]any{"client_request_id": "cycle-2:1"}, &exact)
	if len(exact.Requests) != clientRequestLimit || exact.Truncated {
		t.Fatalf("exactly the limit = %d rows, truncated %v", len(exact.Requests), exact.Truncated)
	}
	h.insertCapture(t, "req-retry-oldest", "cycle-2:1", "/api/status", minutesAgo(90), 200)
	var bounded RequestResult
	h.call(t, "get_request", map[string]any{"client_request_id": "cycle-2:1"}, &bounded)
	if len(bounded.Requests) != clientRequestLimit || !bounded.Truncated || bounded.Requests[0].RequestID != "req-retry-0" {
		t.Fatalf("bounded = %d rows, truncated %v", len(bounded.Requests), bounded.Truncated)
	}
}

// TestSearchHistoryPagesWithCoverage checks the History page, the cursor,
// the sources a filter reads and bad input.
func TestSearchHistoryPagesWithCoverage(t *testing.T) {
	h := newHarness(t)
	for i := range 3 {
		h.insertEvent(t, minutesAgo(10+i), "download", "info", "step "+strconv.Itoa(i), "run-1")
	}
	var first HistoryResult
	h.call(t, "search_history", map[string]any{"where": "downloads", "limit": 2}, &first)
	if len(first.History.Days) != 1 || len(first.History.Days[0].Lines) != 2 || first.History.NextCursor == "" || len(first.History.Calendar) == 0 {
		t.Fatalf("first page = %+v", first.History)
	}
	if names := sourceNames(first.Coverage); !slices.Equal(names, []string{"runtime_events", "incidents"}) {
		t.Fatalf("downloads sources = %v", names)
	}
	var next HistoryResult
	h.call(t, "search_history", map[string]any{"where": "downloads", "limit": 2, "cursor": first.History.NextCursor}, &next)
	if len(next.History.Days) != 1 || len(next.History.Days[0].Lines) != 1 || next.History.NextCursor != "" {
		t.Fatalf("next page = %+v", next.History)
	}
	var all HistoryResult
	h.call(t, "search_history", nil, &all)
	want := []string{"domain_history", "device_telemetry_events", "request_captures", "runtime_events", "incidents"}
	if names := sourceNames(all.Coverage); !slices.Equal(names, want) {
		t.Fatalf("all sources = %v", names)
	}
	var editor HistoryResult
	h.call(t, "search_history", map[string]any{"where": "editor"}, &editor)
	if names := sourceNames(editor.Coverage); !slices.Equal(names, []string{"domain_history", "runtime_events", "incidents"}) {
		t.Fatalf("editor sources = %v", names)
	}
	if text := h.callError(t, "search_history", map[string]any{"cursor": "garbage"}); !strings.Contains(text, "cursor") {
		t.Fatalf("bad cursor error = %q", text)
	}
}

// TestRunTools checks list_runs, get_run_story and bad input.
func TestRunTools(t *testing.T) {
	h := newHarness(t)
	h.insertEvent(t, minutesAgo(20), "download", "info", "started", "run-1")
	h.insertEvent(t, minutesAgo(19), "download", "error", "failed", "run-1")

	var runs RunsResult
	h.call(t, "list_runs", map[string]any{"where": "downloads"}, &runs)
	if len(runs.Runs) != 1 || runs.Runs[0].CorrelationID != "run-1" || runs.Runs[0].Steps != 2 || runs.Runs[0].Outcome != "error" {
		t.Fatalf("runs = %+v", runs.Runs)
	}
	var story RunStoryResult
	h.call(t, "get_run_story", map[string]any{"correlation_id": "run-1"}, &story)
	if len(story.Story.Steps) != 2 || story.Story.Steps[1].Message != "failed" {
		t.Fatalf("story = %+v", story.Story)
	}
	if names := sourceNames(story.Coverage); !slices.Equal(names, []string{"runtime_events"}) || story.Coverage.Covered == nil {
		t.Fatalf("story coverage = %+v", story.Coverage)
	}
	if text := h.callError(t, "get_run_story", map[string]any{"correlation_id": " "}); !strings.Contains(text, "correlation_id") {
		t.Fatalf("empty id error = %q", text)
	}
	if text := h.callError(t, "list_runs", map[string]any{"where": "moon"}); !strings.Contains(text, "moon") {
		t.Fatalf("bad where error = %q", text)
	}
}

// TestRecorderBadCursor checks the recorder's input validation.
func TestRecorderBadCursor(t *testing.T) {
	h := newHarness(t)
	if text := h.callError(t, "list_recorder", map[string]any{"cursor": "x"}); !strings.Contains(text, "cursor") {
		t.Fatalf("bad cursor error = %q", text)
	}
}

// TestListResponseVersions checks the template normalization, the payload,
// the coverage and bad input.
func TestListResponseVersions(t *testing.T) {
	h := newHarness(t)
	h.exec(t, `INSERT INTO response_versions (route_template, body_hash, body, first_seen_ms, last_seen_ms, seen_count)
		VALUES ('/api/animes/:id', 'h1', '{"a":1}', ?, ?, 4)`, minutesAgo(90), minutesAgo(9))

	var got ResponseVersionsResult
	h.call(t, "list_response_versions", map[string]any{"route_template": "/api/animes/abc?x=1"}, &got)
	if got.RouteTemplate != "/api/animes/:id" || len(got.Versions) != 1 || got.Versions[0].SeenCount != 4 || got.Versions[0].Body != `{"a":1}` {
		t.Fatalf("versions = %+v", got)
	}
	versions := coverageOf(t, got.Coverage, "response_versions")
	if versions == nil || versions.FromMS != minutesAgo(90) || versions.ToMS != minutesAgo(9) {
		t.Fatalf("versions range = %+v", versions)
	}
	if text := h.callError(t, "list_response_versions", map[string]any{"route_template": ""}); !strings.Contains(text, "route_template") {
		t.Fatalf("empty template error = %q", text)
	}
}

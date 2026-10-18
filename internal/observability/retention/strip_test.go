package retention

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"maps"
	"testing"
	"time"

	"autoreas-bridge/internal/observability/requestcapture"
)

// bodyCapture is a request_captures row with the columns the body strip reads.
type bodyCapture struct {
	id         string
	kind       string
	route      string
	atMS       int64
	outcome    string
	status     *int
	durationMS int64
	body       string
	state      string
}

// insertBodyCapture stores capture with its response hash and a fixed request body.
func insertBodyCapture(t *testing.T, db *sql.DB, capture bodyCapture) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, http_status,
			payload_json, correlation_json, duration_ms, request_body, response_body, response_body_state, response_hash
		) VALUES (?, ?, ?, ?, 'http', 'device-1', 'Phone', ?, ?, '{}', '{"operation_refs":[]}', ?, 'request-body', ?, ?, ?)`,
		capture.id, capture.atMS, capture.kind, capture.route, capture.outcome, capture.status, capture.durationMS,
		capture.body, capture.state, hashOf(capture.body))
	if err != nil {
		t.Fatalf("insert capture %s: %v", capture.id, err)
	}
}

// insertVersion stores one response_versions row for body under template.
func insertVersion(t *testing.T, db *sql.DB, template, body string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO response_versions (route_template, body_hash, body, first_seen_ms, last_seen_ms, seen_count)
		VALUES (?, ?, ?, ?, ?, 1)`, template, hashOf(body), body, recorderCutoffMS, recorderCutoffMS); err != nil {
		t.Fatalf("insert version: %v", err)
	}
}

// hashOf is the lowercase hex sha256 the store keys response versions by.
func hashOf(body string) string {
	sum := sha256.Sum256([]byte(body))
	return hex.EncodeToString(sum[:])
}

// status returns a pointer to code for a nullable http_status column.
func status(code int) *int { return &code }

// storedBodies returns request_id -> "response_body|response_body_state|request_body" for every capture.
func storedBodies(t *testing.T, db *sql.DB) map[string]string {
	t.Helper()
	values := map[string]string{}
	for _, row := range stringColumn(t, db, `SELECT request_id || '=' || COALESCE(response_body, '<null>') || '|' ||
		COALESCE(response_body_state, '') || '|' || COALESCE(request_body, '') FROM request_captures`) {
		for index := range row {
			if row[index] == '=' {
				values[row[:index]] = row[index+1:]
				break
			}
		}
	}
	return values
}

// TestSweepDeletesRowsPinnedOnlyByTrimmedIncidentsInTheSamePass pins the trim order: a row
// pinned only by an incident the trim removes is deleted by that same pass, not the next one.
func TestSweepDeletesRowsPinnedOnlyByTrimmedIncidentsInTheSamePass(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	base := sweepNow.Add(-5 * time.Hour).UnixMilli()
	// Seven live occurrences: the fourth (offset 3) is the one the 3+3 trim removes. An eighth,
	// past the ledger horizon, must be gone before the trim ranks, or offset 2 would go instead.
	for offset := range int64(7) {
		at := base + offset*60_000
		insertIncident(t, db, "seven", at, at-10, at+10)
	}
	insertIncident(t, db, "seven", ledgerCutoffMS-1, ledgerCutoffMS-1, ledgerCutoffMS-1)
	insertCapture(t, db, testCapture{id: "pinned-by-trimmed", kind: "get", atMS: base + 3*60_000})
	insertCapture(t, db, testCapture{id: "pinned-by-kept", kind: "get", atMS: base + 2*60_000})

	first := sweep(t, db)
	second := sweep(t, db)

	assertSurvivors(t, "capture", stringColumn(t, db, `SELECT request_id FROM request_captures`), []string{"pinned-by-kept"})
	if first.Captures != 1 || first.Incidents != 2 {
		t.Fatalf("expected the first pass to delete 1 capture and 2 incidents, got %+v", first)
	}
	if second != (SweepResult{}) {
		t.Fatalf("expected the second pass to delete nothing, got %+v", second)
	}
}

// TestSweepStripsVersionedBodiesOfSuccessfulRowsKeptOnlyByAnIncident pins D-f: a successful,
// fast row kept only because an incident window pins it loses its stored response body when
// response_versions holds that body for its route template, and Reader.Get still returns it.
// The rows sit on each predicate's boundary: status 199/399/400, 1,000 ms against 1,001 ms, an
// unknown duration, and a row captured exactly at the recorder cutoff.
func TestSweepStripsVersionedBodiesOfSuccessfulRowsKeptOnlyByAnIncident(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	old := recorderCutoffMS - 10*60_000
	recent := recorderCutoffMS + 60_000
	insertIncident(t, db, "window", old, old-60_000, recent+60_000)
	if _, err := db.Exec(`INSERT INTO incidents (fingerprint, reason, occurred_at_ms, window_start_ms, window_end_ms, source_kind, source_id)
		VALUES ('trigger', 'manual_pin', ?, ?, ?, 'request', 'trigger')`, old, old-60_000, old+60_000); err != nil {
		t.Fatalf("insert trigger incident: %v", err)
	}
	get := func(id, route, body string) bodyCapture {
		return bodyCapture{id: id, kind: "get", route: route, atMS: old, outcome: "completed", status: status(200), durationMS: 50, body: body}
	}
	full := get("full", "/api/animes/abc?page=2", `{"full":1}`)
	truncated := get("truncated", "/api/animes", `{"truncated":`)
	truncated.state = "truncated"
	redirect := get("redirect", "/api/animes", `{"redirect":1}`)
	redirect.status = status(399)
	redirect.durationMS = 1000
	failed := get("failed", "/api/animes", `{"failed":1}`)
	failed.status = status(400)
	informational := get("informational", "/api/animes", `{"informational":1}`)
	informational.status = status(199)
	malformed := get("malformed", "/api/animes", `{"malformed":1}`)
	malformed.outcome = "malformed"
	rejected := get("rejected", "/api/animes", `{"rejected":1}`)
	rejected.outcome = "rejected"
	slow := get("slow", "/api/animes", `{"slow":1}`)
	slow.durationMS = 1001
	journal := get("journal", "/api/animes", `{"journal":1}`)
	journal.kind = "patch"
	ws := get("ws", "/api/animes", `{"ws":1}`)
	ws.kind = "ws_reconcile"
	recentRow := get("recent", "/api/animes", `{"recent":1}`)
	recentRow.atMS = recorderCutoffMS
	captures := []bodyCapture{
		full, truncated, redirect, failed, informational, malformed, rejected, slow, journal, ws, recentRow,
		get("trigger", "/api/animes", `{"trigger":1}`),
		get("no-version", "/api/animes", `{"no-version":1}`),
		get("other-template", "/api/animes", `{"other-template":1}`),
	}
	templates := map[string]string{"full": "/api/animes/:id", "no-version": "", "other-template": "/api/schedule"}
	for _, capture := range captures {
		insertBodyCapture(t, db, capture)
		template, special := templates[capture.id]
		if !special {
			template = "/api/animes"
		}
		if template != "" {
			insertVersion(t, db, template, capture.body)
		}
	}
	if _, err := db.Exec(`UPDATE request_captures SET duration_ms = NULL WHERE request_id = 'truncated'`); err != nil {
		t.Fatalf("clear duration: %v", err)
	}

	first := sweep(t, db)
	afterFirst := storedBodies(t, db)
	second := sweep(t, db)

	want := map[string]string{
		"full":           "<null>|in_response_versions|request-body",
		"truncated":      "<null>|truncated|request-body",
		"redirect":       "<null>|in_response_versions|request-body",
		"failed":         `{"failed":1}||request-body`,
		"informational":  `{"informational":1}||request-body`,
		"malformed":      `{"malformed":1}||request-body`,
		"rejected":       `{"rejected":1}||request-body`,
		"slow":           `{"slow":1}||request-body`,
		"journal":        `{"journal":1}||request-body`,
		"ws":             `{"ws":1}||request-body`,
		"recent":         `{"recent":1}||request-body`,
		"trigger":        `{"trigger":1}||request-body`,
		"no-version":     `{"no-version":1}||request-body`,
		"other-template": `{"other-template":1}||request-body`,
	}
	if !maps.Equal(afterFirst, want) {
		t.Errorf("stored bodies after the first pass:\n got %q\nwant %q", afterFirst, want)
	}
	if first.StrippedBodies != 3 || second != (SweepResult{}) {
		t.Fatalf("expected 3 bodies stripped then an idle pass, got %+v then %+v", first, second)
	}
	if afterSecond := storedBodies(t, db); !maps.Equal(afterSecond, afterFirst) {
		t.Fatalf("expected the second pass to change nothing, got %q", afterSecond)
	}

	assertReadBodies(t, db, map[string]readBody{
		"full":       {`{"full":1}`, ""},
		"truncated":  {`{"truncated":`, "truncated"},
		"redirect":   {`{"redirect":1}`, ""},
		"no-version": {`{"no-version":1}`, ""},
	})
}

// readBody is the response body and state Reader.Get reports for one capture.
type readBody struct{ body, state string }

// assertReadBodies fails unless Reader.Get returns each capture's want body and state, and the
// fixed request body untouched.
func assertReadBodies(t *testing.T, db *sql.DB, want map[string]readBody) {
	t.Helper()
	reader := requestcapture.NewReader(db)
	for id, expected := range want {
		got, err := reader.Get(t.Context(), id)
		if err != nil || !got.Found {
			t.Fatalf("get %s: found=%v err=%v", id, got.Found, err)
		}
		if got.Item.ResponseBody == nil || *got.Item.ResponseBody != expected.body || got.Item.ResponseBodyState != expected.state {
			t.Errorf("get %s: body %v state %q, want %q state %q", id, got.Item.ResponseBody, got.Item.ResponseBodyState, expected.body, expected.state)
		}
		if got.Item.RequestBody == nil || *got.Item.RequestBody != "request-body" {
			t.Errorf("get %s: request body %v", id, got.Item.RequestBody)
		}
	}
}

package activityread

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/persistence"
)

// changeAnime and changeAtMS are change 872 of a real bridge.db: Date A Live V,
// episode 4 → 5 from the phone.
const (
	changeAnime = "8Fn5qny6DPbhWLJn"
	changeAtMS  = int64(1792801492755)
)

// insertEntityEvent stores one runtime_events row in the shape the sync
// recorder writes it, with its entity id.
func insertEntityEvent(t *testing.T, db *sql.DB, atMS int64, entityID, eventType, message string) int64 {
	t.Helper()
	result, err := db.Exec(`INSERT INTO runtime_events (occurred_at_ms, domain, level, message, correlation_id,
		entity_id, event_type, metadata_json) VALUES (?, 'sync', 'info', ?, 'd4c0098786f004ebdc699c2d3caa4425', ?, ?,
		'{"changeType":"update","changedFields":["episodesWatched","lastWatchedAt"]}')`, atMS, message, entityID, eventType)
	if err != nil {
		t.Fatalf("insert entity event: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("entity event id: %v", err)
	}
	return id
}

// insertChangeCapture stores one request_captures row with its anime and its
// correlation JSON, as the recorder stores reconcile and broadcast captures.
func insertChangeCapture(t *testing.T, db *sql.DB, id string, atMS int64, kind, route, animeID, correlation string) {
	t.Helper()
	exec(t, db, `INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport, device_id,
		device_name, outcome, anime_id, http_status, payload_json, correlation_json, duration_ms)
		VALUES (?, ?, ?, ?, 'http', 'device-3e4abdfd05f2ea61', 'Pixel 8a', 'completed', NULLIF(?, ''), 200, '{}', ?, 76)`,
		id, atMS, kind, route, animeID, correlation)
}

// insertChangeRow records change 872 of a real bridge.db for animeID at
// changeAtMS through internal/activity, the history's owner, and returns its id.
func insertChangeRow(t *testing.T, db *sql.DB, animeID string) int64 {
	t.Helper()
	store := activity.NewStore(activity.NewSQLiteProvider(db))
	err := store.RecordActivity(context.Background(), activity.Record{
		Source: "mobile", ActionType: "episode_adjusted", AnimeID: animeID, AnimeName: "Date A Live V",
		OccurredAtMs: changeAtMS, CorrelationID: "anime.patch:8Fn5qny6DPbhWLJn:1792801492755", ReportedAtMS: 1792801493238,
		BeforeJSON: []byte(`{"Estado":0,"NroCapVisto":4,"Activo":1}`), AfterJSON: []byte(`{"Estado":0,"NroCapVisto":5,"Activo":1}`),
	})
	if err != nil {
		t.Fatalf("record change: %v", err)
	}
	records, err := store.ListRecent(context.Background(), activity.ListQuery{Limit: 1})
	if err != nil || len(records) != 1 {
		t.Fatalf("read change back: %v, %d", err, len(records))
	}
	return records[0].ID
}

// insertEntitySteps stores n events of the anime, one per millisecond from
// 500ms before the change, in one transaction.
func insertEntitySteps(t *testing.T, db *sql.DB, n int) {
	t.Helper()
	err := persistence.InTx(context.Background(), db, func(tx *sql.Tx) error {
		for i := range n {
			if _, err := tx.Exec(`INSERT INTO runtime_events (occurred_at_ms, domain, level, message, entity_id)
				VALUES (?, 'sync', 'info', 'step', ?)`, changeAtMS-500+int64(i), changeAnime); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("insert steps: %v", err)
	}
}

// reconcileRefs is the stored correlation JSON of a reconcile that applied the anime's change.
const reconcileRefs = `{"changelog_ids":[2717],"operation_refs":[{"anime_id":"` + changeAnime + `","operation":"update","outcome":"applied"}]}`

func TestChangeContextReadsTheAnimesEventsAroundTheChange(t *testing.T) {
	db, r := openTestReader(t)
	first := insertEntityEvent(t, db, changeAtMS-1000, changeAnime, "sync.changelog", "recorded pending changelog for "+changeAnime)
	last := insertEntityEvent(t, db, changeAtMS+1000, changeAnime, "websocket.broadcast", "broadcast anime.changed for "+changeAnime)
	insertEntityEvent(t, db, changeAtMS-1001, changeAnime, "sync.changelog", "too early")
	insertEntityEvent(t, db, changeAtMS+1001, changeAnime, "sync.changelog", "too late")
	insertEntityEvent(t, db, changeAtMS, "dEyhTxMNBs71Pu6B", "sync.changelog", "another anime")

	got, err := r.ChangeContext(t.Context(), insertChangeRow(t, db, changeAnime), changeAtMS)
	if err != nil {
		t.Fatalf("change context: %v", err)
	}
	if len(got.Events) != 2 || got.Truncated || got.Events[0].ID != first || got.Events[1].ID != last {
		t.Fatalf("events = %+v, truncated %v; want %d then %d", got.Events, got.Truncated, first, last)
	}
	step := got.Events[0]
	if step.Domain != "sync" || step.Level != "info" || step.EventType != "sync.changelog" || step.AtMS != changeAtMS-1000 ||
		step.CorrelationID != "d4c0098786f004ebdc699c2d3caa4425" || !strings.Contains(step.MetadataJSON, "episodesWatched") ||
		step.Message != "recorded pending changelog for "+changeAnime || step.DurationMS != nil {
		t.Fatalf("first step = %+v", step)
	}
}

func TestChangeContextFoldsTheCapturesThatCarriedTheChange(t *testing.T) {
	db, r := openTestReader(t)
	insertChangeCapture(t, db, "7e4b8c9f-ad55-4ea8-8022-f9a1320802b9", changeAtMS-20, "reconcile", "/api/sync/reconcile", "", reconcileRefs)
	insertChangeCapture(t, db, "8abcdea3-145c-4e6b-bc36-69670378d50c", changeAtMS-2, "ws_broadcast", "/ws", changeAnime, `{"operation_refs":[]}`)
	insertChangeCapture(t, db, "3cdd612a-1c4e-46d5-867b-dc7f638fd9fc", changeAtMS-161, "post", "/api/sync/diagnostics", "", `{"operation_refs":[]}`)
	insertChangeCapture(t, db, "other-anime", changeAtMS, "reconcile", "/api/sync/reconcile", "",
		`{"operation_refs":[{"anime_id":"dEyhTxMNBs71Pu6B","operation":"update","outcome":"applied"}]}`)
	insertChangeCapture(t, db, "too-late", changeAtMS+1001, "reconcile", "/api/sync/reconcile", "", reconcileRefs)

	got, err := r.ChangeContext(t.Context(), insertChangeRow(t, db, changeAnime), changeAtMS)
	if err != nil {
		t.Fatalf("change context: %v", err)
	}
	if len(got.Requests) != 2 {
		t.Fatalf("requests = %+v; want the reconcile and the broadcast", got.Requests)
	}
	reconcile, broadcast := got.Requests[0], got.Requests[1]
	if reconcile.RouteTemplate != "/api/sync/reconcile" || reconcile.LatestRequestID != "7e4b8c9f-ad55-4ea8-8022-f9a1320802b9" ||
		reconcile.Count != 1 || reconcile.HTTPStatus == nil || *reconcile.HTTPStatus != 200 || reconcile.Kind != "reconcile" ||
		reconcile.MaxDurationMS == nil || *reconcile.MaxDurationMS != 76 || reconcile.ContainsTrigger {
		t.Fatalf("reconcile = %+v", reconcile)
	}
	if broadcast.RouteTemplate != "/ws" || broadcast.LatestRequestID != "8abcdea3-145c-4e6b-bc36-69670378d50c" {
		t.Fatalf("broadcast = %+v", broadcast)
	}
}

func TestChangeContextCapsItsEventsLikeARunStory(t *testing.T) {
	for _, tc := range []struct {
		name      string
		stored    int
		truncated bool
	}{
		{"exactly the cap is whole", StoryLimit, false},
		{"one past the cap is cut", StoryLimit + 1, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, r := openTestReader(t)
			insertEntitySteps(t, db, tc.stored)

			got, err := r.ChangeContext(t.Context(), insertChangeRow(t, db, changeAnime), changeAtMS)
			if err != nil {
				t.Fatalf("change context: %v", err)
			}
			if len(got.Events) != StoryLimit || got.Truncated != tc.truncated || got.Events[0].AtMS != changeAtMS-500 {
				t.Fatalf("events %d, truncated %v, first at %d; want %d, %v, %d", len(got.Events), got.Truncated, got.Events[0].AtMS, StoryLimit, tc.truncated, changeAtMS-500)
			}
		})
	}
}

func TestChangeContextReadsNothingWithoutAnAnime(t *testing.T) {
	db, r := openTestReader(t)
	insertEntityEvent(t, db, changeAtMS, "", "sync.changelog", "no entity")
	insertChangeCapture(t, db, "no-anime", changeAtMS, "post", "/api/sync/diagnostics", "", `{"operation_refs":[{"anime_id":""}]}`)

	got, err := r.ChangeContext(t.Context(), insertChangeRow(t, db, ""), changeAtMS)
	if err != nil || !got.Found || len(got.Events) != 0 || len(got.Requests) != 0 || got.Truncated {
		t.Fatalf("change context = %+v, %v; want found and empty", got, err)
	}
}

func TestChangeContextReportsAnUnknownChangeAsNotFound(t *testing.T) {
	db, r := openTestReader(t)
	id := insertChangeRow(t, db, changeAnime)
	insertEntityEvent(t, db, changeAtMS, changeAnime, "sync.changelog", "recorded pending changelog for "+changeAnime)

	for _, tc := range []struct {
		name string
		id   int64
		atMS int64
	}{
		{"unknown id", id + 1, changeAtMS},
		{"older id", id - 1, changeAtMS},
		{"known id at another time", id, changeAtMS + 1},
	} {
		got, err := r.ChangeContext(t.Context(), tc.id, tc.atMS)
		if err != nil || got.Found || len(got.Events) != 0 || len(got.Requests) != 0 {
			t.Fatalf("%s: change context = %+v, %v; want not found", tc.name, got, err)
		}
	}
}

func TestChangeContextFindsTheChangeAmongOthersAtTheSameTime(t *testing.T) {
	db, r := openTestReader(t)
	id := insertChangeRow(t, db, changeAnime)
	insertChangeRow(t, db, "dEyhTxMNBs71Pu6B")
	insertEntityEvent(t, db, changeAtMS, changeAnime, "sync.changelog", "recorded pending changelog for "+changeAnime)

	got, err := r.ChangeContext(t.Context(), id, changeAtMS)
	if err != nil || !got.Found || len(got.Events) != 1 {
		t.Fatalf("change context = %+v, %v; want the first change's event", got, err)
	}
}

// TestChangeContextQueriesWalkTheTimeIndexes pins the query plans: both reads
// search their time index, since runtime_events has no entity index.
func TestChangeContextQueriesWalkTheTimeIndexes(t *testing.T) {
	db, _ := openTestReader(t)
	for _, tc := range []struct {
		query, index string
		args         []any
	}{
		{changeEventsQuery, "SEARCH runtime_events USING INDEX idx_runtime_events_time", []any{1, 2, "a", 3}},
		{changeRequestsQuery, "SEARCH request_captures USING INDEX idx_request_captures_time", []any{1, 2, "a", "a", 3}},
	} {
		rows, err := db.Query("EXPLAIN QUERY PLAN "+tc.query, tc.args...)
		if err != nil {
			t.Fatalf("explain: %v", err)
		}
		var plan []string
		for rows.Next() {
			var id, parent, unused int
			var detail string
			if err := rows.Scan(&id, &parent, &unused, &detail); err != nil {
				t.Fatalf("scan plan: %v", err)
			}
			plan = append(plan, detail)
		}
		_ = rows.Close()
		if !strings.Contains(strings.Join(plan, "\n"), tc.index) {
			t.Fatalf("plan = %q; want %q", plan, tc.index)
		}
		t.Logf("plan: %s", strings.Join(plan, " | "))
	}
}

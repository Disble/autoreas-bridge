package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

// editorActivityRow is one stored history row of an editor write.
type editorActivityRow struct {
	source, action, name, correlation string
	occurredAtMs                      int64
	before, after                     anime.ActivityAnimeSnapshot
}

// editorActivityApp wires the editor, its query and the bridge database the
// way the composition root does, over one seeded anime.
func editorActivityApp(t *testing.T, snapshot string) (*App, *sql.DB) {
	t.Helper()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", snapshot, 100)
	service := anime.NewEditorService(store, &stubAppCommittedPublisher{})
	service.SetNow(func() time.Time { return time.UnixMilli(200).UTC() })
	query := anime.NewQueryService(store)
	return &App{ctx: context.Background(), bridgeDB: db, animeQuery: query, animeEditorQuery: query, animeEditorWrite: service}, db
}

// editorActivityRows reads every stored history row through internal/activity,
// the history's owner.
func editorActivityRows(t *testing.T, db *sql.DB) []editorActivityRow {
	t.Helper()
	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(context.Background(), activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	found := []editorActivityRow{}
	for _, record := range records {
		row := editorActivityRow{source: record.Source, action: record.ActionType, name: record.AnimeName, correlation: record.CorrelationID, occurredAtMs: record.OccurredAtMs}
		if err := json.Unmarshal(record.BeforeJSON, &row.before); err != nil {
			t.Fatalf("decode before: %v", err)
		}
		if err := json.Unmarshal(record.AfterJSON, &row.after); err != nil {
			t.Fatalf("decode after: %v", err)
		}
		found = append(found, row)
	}
	return found
}

// failingActivityRecorder refuses every history row.
type failingActivityRecorder struct{}

// RecordActivity fails.
func (failingActivityRecorder) RecordActivity(context.Context, anime.ActivityRecord) error {
	return errors.New("history unavailable")
}

func TestSaveAnimeEditorRecordsTheChangeTheCardCommandsWould(t *testing.T) {
	t.Parallel()
	status, progress, inactive := 2, 5.0, false
	for _, tc := range []struct {
		name   string
		start  string
		patch  AnimeEditorPatchDTO
		action string
	}{
		{"state", `{"id":"anime-1","name":"A","episodesWatched":1,"status":1,"active":true}`, AnimeEditorPatchDTO{Status: &status}, anime.ActivityActionAnimeStateSet},
		{"progress over state", `{"id":"anime-1","name":"A","episodesWatched":1,"status":1,"active":true}`, AnimeEditorPatchDTO{Status: &status, Progress: &progress}, "episode_adjusted"},
		{"deactivate over progress", `{"id":"anime-1","name":"A","episodesWatched":1,"status":1,"active":true}`, AnimeEditorPatchDTO{Progress: &progress, Active: &inactive}, anime.ActivityActionAnimeSoftDeleted},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app, db := editorActivityApp(t, tc.start)

			got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100, Patch: tc.patch})

			rows := editorActivityRows(t, db)
			if got.Outcome != "applied" || len(rows) != 1 || rows[0].action != tc.action || rows[0].source != "desktop" {
				t.Fatalf("expected one desktop %s row, got %#v (save %#v)", tc.action, rows, got)
			}
		})
	}
}

func TestEditorActivityThatCannotBeStoredIsLoggedAndTheWriteStands(t *testing.T) {
	t.Parallel()
	app, _ := editorActivityApp(t, `{"id":"anime-1","name":"A","episodesWatched":1,"status":1,"active":true}`)
	memLogger := attachEditorMemLogger(app)
	app.editorActivity = failingActivityRecorder{}

	got := app.DeactivateAnime("anime-1", 100)

	entries := memLogger.Recent()
	if got.Outcome != "applied" || len(entries) != 1 || entries[0].EventType != editorActivityFailedEventType || entries[0].Level != "warn" {
		t.Fatalf("expected the write applied and one warning, got %#v and %#v", got, entries)
	}
}

// TestEditorActivityActionNamesEachChange pins each branch, including the
// restore the editor itself never reaches (only lifecycle restore reactivates
// an anime) and a progress edit on an anime that stays inactive.
func TestEditorActivityActionNamesEachChange(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		before, after contracts.MobileAnime
		want          string
	}{
		{contracts.MobileAnime{Active: 0}, contracts.MobileAnime{Active: 1, EpisodesWatched: 3}, anime.ActivityActionAnimeRestored},
		{contracts.MobileAnime{Active: 0, EpisodesWatched: 1}, contracts.MobileAnime{Active: 0, EpisodesWatched: 2}, "episode_adjusted"},
		{contracts.MobileAnime{Active: 1, Status: 1}, contracts.MobileAnime{Active: 1, Status: 1}, ""},
	} {
		if got := editorActivityAction(tc.before, tc.after); got != tc.want {
			t.Fatalf("editorActivityAction(%#v, %#v) = %q, want %q", tc.before, tc.after, got, tc.want)
		}
	}
}

func TestEditorWriteWithoutABridgeDatabaseRecordsNothingAndLogsNothing(t *testing.T) {
	t.Parallel()
	app, _ := editorActivityApp(t, `{"id":"anime-1","name":"A","episodesWatched":1,"status":1,"active":true}`)
	app.bridgeDB = nil
	memLogger := attachEditorMemLogger(app)

	got := app.DeactivateAnime("anime-1", 100)

	if got.Outcome != "applied" || len(memLogger.Recent()) != 0 {
		t.Fatalf("expected the write applied with no history attempt, got %#v and %#v", got, memLogger.Recent())
	}
}

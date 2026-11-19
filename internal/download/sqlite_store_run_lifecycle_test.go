package download

import (
	"context"
	"database/sql"
	"testing"
)

// TestSQLiteStoreRunIsOpenedRunningThenRefreshedThenFinalizedWithManualLinks
// opens a run, which writes a provisional running row with no finish time,
// refreshes its live counters without making it terminal, then finalizes it as
// jd_offline with manual links that round-trip through ListRuns.
func TestSQLiteStoreRunIsOpenedRunningThenRefreshedThenFinalizedWithManualLinks(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.OpenRun(ctx, Run{RunID: "run-1", StartedAtMs: 100, Trigger: "scheduled"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}
	var status string
	var finishedAtMs sql.NullInt64
	if err := db.QueryRowContext(ctx, `SELECT status, finished_at_ms FROM download_runs WHERE run_id = ?`, "run-1").Scan(&status, &finishedAtMs); err != nil {
		t.Fatalf("query run row: %v", err)
	}
	if status != "running" || finishedAtMs.Valid {
		t.Fatalf("unexpected open-run row: status=%q finishedAtValid=%v", status, finishedAtMs.Valid)
	}

	assertRunProgressRefreshesRunningCounters(t, store)

	finishedAt := int64(200)
	links := []ManualLink{{AnimeID: "anime-7", Anime: "Naruto", Episode: 5, Links: []string{"https://mediafire.example/ep5"}}}
	if err := store.FinalizeRun(ctx, Run{RunID: "run-1", StartedAtMs: 100, FinishedAtMs: &finishedAt, Trigger: "scheduled", Status: "jd_offline", ManualLinks: links}); err != nil {
		t.Fatalf("FinalizeRun: %v", err)
	}
	got := onlyListedRun(t, store)
	if got.Status != "jd_offline" {
		t.Fatalf("expected status jd_offline, got %q", got.Status)
	}
	if len(got.ManualLinks) != 1 || got.ManualLinks[0].Anime != "Naruto" || got.ManualLinks[0].Episode != 5 || got.ManualLinks[0].AnimeID != "anime-7" {
		t.Fatalf("expected manual links to round-trip, got %#v", got.ManualLinks)
	}
	if len(got.ManualLinks[0].Links) != 1 || got.ManualLinks[0].Links[0] != "https://mediafire.example/ep5" {
		t.Fatalf("expected manual link URLs to round-trip, got %#v", got.ManualLinks[0].Links)
	}
}

// assertRunProgressRefreshesRunningCounters updates run-1's live counters and
// checks they persist while the run stays non-terminal.
func assertRunProgressRefreshesRunningCounters(t *testing.T, store *SQLiteStore) {
	t.Helper()

	progress := Run{RunID: "run-1", StartedAtMs: 100, Trigger: "scheduled", AnimesChecked: 2, EpisodesFound: 2, EpisodesDownloaded: 1, UpToDateCount: 3, JDAvailable: true, Status: "running"}
	if err := store.UpdateRunProgress(context.Background(), progress); err != nil {
		t.Fatalf("UpdateRunProgress: %v", err)
	}
	got := onlyListedRun(t, store)
	if got.FinishedAtMs != nil || got.Status != "running" {
		t.Fatalf("expected run to remain non-terminal running, got %#v", got)
	}
	if got.AnimesChecked != 2 || got.EpisodesFound != 2 || got.EpisodesDownloaded != 1 || got.UpToDateCount != 3 || !got.JDAvailable {
		t.Fatalf("expected live progress counters to persist, got %#v", got)
	}
}

// onlyListedRun returns the most recent run ListRuns reports.
func onlyListedRun(t *testing.T, store *SQLiteStore) Run {
	t.Helper()

	runs, err := store.ListRuns(context.Background(), 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) == 0 {
		t.Fatal("ListRuns returned no runs")
	}
	return runs[0]
}

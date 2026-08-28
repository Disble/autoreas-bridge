package download

import (
	"context"
	"database/sql"
	"testing"
)

func TestSQLiteStoreOpenRunWritesProvisionalRunningStatus(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	run := Run{RunID: "run-1", StartedAtMs: 100, Trigger: "manual"}
	if err := store.OpenRun(ctx, run); err != nil {
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
}

func TestSQLiteStoreUpdateRunProgressRefreshesRunningCounters(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.OpenRun(ctx, Run{RunID: "run-1", StartedAtMs: 100, Trigger: "manual"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}
	if err := store.UpdateRunProgress(ctx, Run{RunID: "run-1", StartedAtMs: 100, Trigger: "manual", AnimesChecked: 2, EpisodesFound: 2, EpisodesDownloaded: 1, UpToDateCount: 3, JDAvailable: true, Status: "running"}); err != nil {
		t.Fatalf("UpdateRunProgress: %v", err)
	}
	runs, err := store.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	got := runs[0]
	if got.FinishedAtMs != nil || got.Status != "running" {
		t.Fatalf("expected run to remain non-terminal running, got %#v", got)
	}
	if got.AnimesChecked != 2 || got.EpisodesFound != 2 || got.EpisodesDownloaded != 1 || got.UpToDateCount != 3 || !got.JDAvailable {
		t.Fatalf("expected live progress counters to persist, got %#v", got)
	}
}

func TestSQLiteStoreFinalizeRunSetsTerminalStatusAndFinishedAt(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.OpenRun(ctx, Run{RunID: "run-1", StartedAtMs: 100, Trigger: "manual"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}
	finishedAt := int64(500)
	if err := store.FinalizeRun(ctx, Run{RunID: "run-1", StartedAtMs: 100, FinishedAtMs: &finishedAt, Trigger: "manual", AnimesChecked: 3, EpisodesDownloaded: 2, Status: "ok"}); err != nil {
		t.Fatalf("FinalizeRun: %v", err)
	}
	runs, err := store.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	got := runs[0]
	if got.Status != "ok" || got.FinishedAtMs == nil || *got.FinishedAtMs != finishedAt {
		t.Fatalf("unexpected finalized run: %#v", got)
	}
	if got.AnimesChecked != 3 || got.EpisodesDownloaded != 2 {
		t.Fatalf("expected counts to persist, got %#v", got)
	}
}

func TestSQLiteStoreFinalizeRunPersistsManualLinksForJDOffline(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.OpenRun(ctx, Run{RunID: "run-1", StartedAtMs: 100, Trigger: "scheduled"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}
	finishedAt := int64(200)
	links := []ManualLink{{Anime: "Naruto", Episode: 5, Links: []string{"https://mediafire.example/ep5"}}}
	if err := store.FinalizeRun(ctx, Run{RunID: "run-1", StartedAtMs: 100, FinishedAtMs: &finishedAt, Trigger: "scheduled", Status: "jd_offline", ManualLinks: links}); err != nil {
		t.Fatalf("FinalizeRun: %v", err)
	}
	runs, err := store.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	got := runs[0]
	if got.Status != "jd_offline" {
		t.Fatalf("expected status jd_offline, got %q", got.Status)
	}
	if len(got.ManualLinks) != 1 || got.ManualLinks[0].Anime != "Naruto" || got.ManualLinks[0].Episode != 5 {
		t.Fatalf("expected manual links to round-trip, got %#v", got.ManualLinks)
	}
	if len(got.ManualLinks[0].Links) != 1 || got.ManualLinks[0].Links[0] != "https://mediafire.example/ep5" {
		t.Fatalf("expected manual link URLs to round-trip, got %#v", got.ManualLinks[0].Links)
	}
}

func TestSQLiteStoreListRunsOrdersMostRecentFirst(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	for i, runID := range []string{"run-a", "run-b", "run-c"} {
		startedAt := int64(100 * (i + 1))
		if err := store.OpenRun(ctx, Run{RunID: runID, StartedAtMs: startedAt, Trigger: "manual"}); err != nil {
			t.Fatalf("OpenRun %s: %v", runID, err)
		}
		finishedAt := startedAt + 10
		if err := store.FinalizeRun(ctx, Run{RunID: runID, StartedAtMs: startedAt, FinishedAtMs: &finishedAt, Trigger: "manual", Status: "ok"}); err != nil {
			t.Fatalf("FinalizeRun %s: %v", runID, err)
		}
	}
	runs, err := store.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 3 || runs[0].RunID != "run-c" || runs[1].RunID != "run-b" || runs[2].RunID != "run-a" {
		t.Fatalf("expected most-recent-first order, got %#v", runs)
	}
}

func TestSQLiteStoreFinalizeRunPrunesToRetentionLimit(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	const total = 201
	for i := range total {
		runID := runIDForIndex(i)
		startedAt := int64(i + 1)
		if err := store.OpenRun(ctx, Run{RunID: runID, StartedAtMs: startedAt, Trigger: "scheduled"}); err != nil {
			t.Fatalf("OpenRun %s: %v", runID, err)
		}
		finishedAt := startedAt + 1
		if err := store.FinalizeRun(ctx, Run{RunID: runID, StartedAtMs: startedAt, FinishedAtMs: &finishedAt, Trigger: "scheduled", Status: "ok"}); err != nil {
			t.Fatalf("FinalizeRun %s: %v", runID, err)
		}
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM download_runs`).Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 200 {
		t.Fatalf("expected exactly 200 rows after the 201st finalize, got %d", count)
	}
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM download_runs WHERE run_id = ?`, runIDForIndex(total-1)).Scan(&exists); err != nil {
		t.Fatalf("check latest run exists: %v", err)
	}
	if exists != 1 {
		t.Fatal("expected the most recently finalized run to be retained")
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM download_runs WHERE run_id = ?`, runIDForIndex(0)).Scan(&exists); err != nil {
		t.Fatalf("check oldest run absent: %v", err)
	}
	if exists != 0 {
		t.Fatal("expected the oldest prior run to have been pruned")
	}
}

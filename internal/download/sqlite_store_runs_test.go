package download

import (
	"context"
	"testing"
)

func TestSQLiteStoreFinalizesRunsAndListsThemMostRecentFirst(t *testing.T) {
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
		if err := store.FinalizeRun(ctx, Run{RunID: runID, StartedAtMs: startedAt, FinishedAtMs: &finishedAt, Trigger: "manual",
			AnimesChecked: i + 1, EpisodesDownloaded: i, Status: "ok"}); err != nil {
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
	got := runs[0]
	if got.Status != "ok" || got.FinishedAtMs == nil || *got.FinishedAtMs != 310 {
		t.Fatalf("unexpected finalized run: %#v", got)
	}
	if got.AnimesChecked != 3 || got.EpisodesDownloaded != 2 {
		t.Fatalf("expected counts to persist, got %#v", got)
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

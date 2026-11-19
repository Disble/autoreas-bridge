package sync

import (
	"context"
	"testing"
)

// TestPruneKeepsTheLastRowOfEachAnimeAndTheClockFloorForTheNextChange prunes
// the older acknowledged rows while keeping each anime's last one, then stores
// a change whose clock went back past the kept row and checks it still rises.
func TestPruneKeepsTheLastRowOfEachAnimeAndTheClockFloorForTheNextChange(t *testing.T) {
	t.Parallel()

	db, store := prunableChangelog(t)
	ctx := context.Background()

	pruned, err := store.PruneAcknowledgedChangelog(ctx)
	must(t, err)
	if pruned != 2 {
		t.Errorf("want the 2 older rows pruned, got %d", pruned)
	}
	if got := remainingIDs(t, store); len(got) != 2 || got[0] != 2 || got[1] != 4 {
		t.Errorf("want each anime's last row (2 and 4) kept, got %v", got)
	}

	// The bridge clock went back past the acknowledged change: the next row must still rise.
	must(t, insertWithAnime(ctx, db, store, ChangelogEntry{AnimeID: "b", ChangeType: ChangelogTypeUpdate,
		ChangedFields: []string{"name"}, SnapshotJSON: []byte(`{"id":"b"}`), ChangedAtMs: 90}))
	rows, err := store.ListAfterID(ctx, 4)
	must(t, err)
	if len(rows) != 1 || rows[0].ChangedAtMs != 121 {
		t.Fatalf("want the new row stamped past the kept 120, got %+v", rows)
	}
}

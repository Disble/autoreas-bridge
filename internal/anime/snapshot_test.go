package anime

import (
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

func fixedNow(ms int64) func() time.Time {
	return func() time.Time { return time.UnixMilli(ms) }
}

func TestStampModifiedAtFreshUsesNow(t *testing.T) {
	got := stampModifiedAt(0, fixedNow(12345))
	if got != 12345 {
		t.Fatalf("expected fresh stamp to use now (12345), got %d", got)
	}
}

func TestStampModifiedAtFreshZeroNowYieldsOne(t *testing.T) {
	got := stampModifiedAt(0, fixedNow(0))
	if got != 1 {
		t.Fatalf("expected fresh zero-now stamp to clamp to 1, got %d", got)
	}
}

func TestStampModifiedAtSameMillisecondStrictlyIncreases(t *testing.T) {
	first := stampModifiedAt(0, fixedNow(12345))
	second := stampModifiedAt(first, fixedNow(12345))
	if second != first+1 {
		t.Fatalf("expected same-ms second stamp to strictly increase to %d, got %d", first+1, second)
	}
}

func TestStampModifiedAtClockRegressionClampsToPrevPlusOne(t *testing.T) {
	got := stampModifiedAt(99999, fixedNow(100))
	if got != 100000 {
		t.Fatalf("expected clock-regression to clamp to prev+1 (100000), got %d", got)
	}
}

func TestDiffSnapshotsCopiesModifiedAtForUnchangedHash(t *testing.T) {
	t.Parallel()

	payload := []byte(`{"_id":"same","nombre":"Stable","nrocapvisto":4}`)
	baselineRecord := SnapshotRecord{AnimeID: "same", CanonicalJSON: payload, Hash: HashSnapshot(payload), ModifiedAt: 555}
	currentRecord := SnapshotRecord{AnimeID: "same", CanonicalJSON: payload, Hash: HashSnapshot(payload)}
	current := map[string]SnapshotRecord{"same": currentRecord}

	deltas, pruneIDs := DiffSnapshots(current, map[string]SnapshotRecord{"same": baselineRecord})

	if len(deltas) != 0 {
		t.Fatalf("expected no deltas for unchanged record, got %+v", deltas)
	}
	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids for unchanged record, got %v", pruneIDs)
	}
	if got := current["same"].ModifiedAt; got != 555 {
		t.Fatalf("expected unchanged record to copy baseline ModifiedAt 555, got %d", got)
	}
}

func TestDiffSnapshotsBumpsModifiedAtForChangedRecord(t *testing.T) {
	t.Parallel()

	oldPayload := []byte(`{"_id":"anime-1","nombre":"Old","nrocapvisto":1}`)
	newPayload := []byte(`{"_id":"anime-1","nombre":"New","nrocapvisto":2}`)
	baselineRecord := SnapshotRecord{AnimeID: "anime-1", CanonicalJSON: oldPayload, Hash: HashSnapshot(oldPayload), ModifiedAt: 100}
	current := map[string]SnapshotRecord{
		"anime-1": {AnimeID: "anime-1", CanonicalJSON: newPayload, Hash: HashSnapshot(newPayload)},
	}

	deltas, _ := DiffSnapshots(current, map[string]SnapshotRecord{"anime-1": baselineRecord})

	if len(deltas) != 1 {
		t.Fatalf("expected 1 delta for changed record, got %+v", deltas)
	}
	if got := current["anime-1"].ModifiedAt; got <= 100 {
		t.Fatalf("expected changed record to bump ModifiedAt above baseline 100, got %d", got)
	}
}

func TestDiffSnapshotsBumpsModifiedAtForNewRecord(t *testing.T) {
	t.Parallel()

	newPayload := []byte(`{"_id":"brand-new","nombre":"Brand New","nrocapvisto":0}`)
	current := map[string]SnapshotRecord{
		"brand-new": {AnimeID: "brand-new", CanonicalJSON: newPayload, Hash: HashSnapshot(newPayload)},
	}

	deltas, _ := DiffSnapshots(current, map[string]SnapshotRecord{})

	if len(deltas) != 1 {
		t.Fatalf("expected 1 delta for new record, got %+v", deltas)
	}
	if got := current["brand-new"].ModifiedAt; got <= 0 {
		t.Fatalf("expected new record to receive a positive ModifiedAt, got %d", got)
	}
}

// TestDiffSnapshotsSoftDeletesAbsentBaselineRecord covers SDD-30 ADR-30-3b: a
// baseline id absent from current (tombstoned via $$deleted or otherwise
// missing from the latest parse) MUST NOT become a pruneID / physical delete.
// Instead DiffSnapshots emits an UPDATE event carrying the baseline's
// canonical payload with Activo=0 + FechaEliminacion stamped, and the record
// remains present in current with a bumped ModifiedAt -- never lost.
func TestDiffSnapshotsSoftDeletesAbsentBaselineRecord(t *testing.T) {
	t.Parallel()

	baselinePayload := []byte(`{"_id":"gone","nombre":"Gone Anime","nrocapvisto":4,"activo":true}`)
	baselineRecord := SnapshotRecord{AnimeID: "gone", CanonicalJSON: baselinePayload, Hash: HashSnapshot(baselinePayload), ModifiedAt: 42}

	current := map[string]SnapshotRecord{}
	baseline := map[string]SnapshotRecord{"gone": baselineRecord}

	deltas, pruneIDs := DiffSnapshots(current, baseline)

	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids for a tombstoned/absent baseline record, got %v", pruneIDs)
	}
	if len(deltas) != 1 {
		t.Fatalf("expected exactly 1 soft-delete update delta, got %+v", deltas)
	}

	delta := deltas[0]
	if delta.AnimeID != "gone" {
		t.Fatalf("expected soft-delete delta for anime id %q, got %q", "gone", delta.AnimeID)
	}
	if len(delta.Payload) == 0 {
		t.Fatal("expected soft-delete delta to carry a non-empty payload (not a tombstone/prune)")
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(delta.Payload, &raw); err != nil {
		t.Fatalf("unmarshal soft-delete payload: %v", err)
	}
	if raw.Activo.TriState() != domain.TriStateFalse {
		t.Fatalf("expected soft-deleted payload Activo=false, got tristate %v", raw.Activo.TriState())
	}
	if raw.FechaEliminacion.Time() == nil {
		t.Fatal("expected soft-deleted payload to carry a FechaEliminacion timestamp")
	}
	if raw.Nombre != "Gone Anime" {
		t.Fatalf("expected soft-deleted payload to retain original nombre, got %q", raw.Nombre)
	}

	gotRecord, ok := current["gone"]
	if !ok {
		t.Fatal("expected soft-deleted record to be retained in current (not pruned)")
	}
	if gotRecord.ModifiedAt <= baselineRecord.ModifiedAt {
		t.Fatalf("expected soft-delete to bump ModifiedAt above baseline %d, got %d", baselineRecord.ModifiedAt, gotRecord.ModifiedAt)
	}
}

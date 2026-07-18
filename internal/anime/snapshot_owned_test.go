package anime

import (
	"bytes"
	"testing"

	"autoreas-bridge/internal/anime/domain"
)

func TestDiffSnapshotsCarriesForwardAbsentSoftDeletedRecordUnchanged(t *testing.T) {
	t.Parallel()

	const deletedAt = int64(1700000000123)
	baselinePayload := []byte(`{"_id":"gone","nombre":"Gone Anime","nrocapvisto":4,"activo":false,"fechaEliminacion":{"$$date":1700000000123}}`)
	baselineRecord := SnapshotRecord{
		AnimeID:       "gone",
		CanonicalJSON: baselinePayload,
		Hash:          HashSnapshot(baselinePayload),
		ModifiedAt:    1710000000456,
	}
	current := map[string]SnapshotRecord{}

	deltas, pruneIDs := DiffSnapshots(current, map[string]SnapshotRecord{"gone": baselineRecord}, nil)

	if len(deltas) != 0 {
		t.Fatalf("expected no deltas for an absent persisted soft-delete, got %+v", deltas)
	}
	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids for an absent persisted soft-delete, got %v", pruneIDs)
	}
	got, ok := current["gone"]
	if !ok {
		t.Fatal("expected persisted soft-delete to be carried forward in current")
	}
	if !bytes.Equal(got.CanonicalJSON, baselineRecord.CanonicalJSON) {
		t.Fatalf("expected canonical payload to remain unchanged, got %s", got.CanonicalJSON)
	}
	if got.Hash != baselineRecord.Hash {
		t.Fatalf("expected hash %q to remain unchanged, got %q", baselineRecord.Hash, got.Hash)
	}
	if got.ModifiedAt != baselineRecord.ModifiedAt {
		t.Fatalf("expected ModifiedAt %d to remain unchanged, got %d", baselineRecord.ModifiedAt, got.ModifiedAt)
	}

	value := decodeAnimeDomainInternal(t, got.CanonicalJSON)
	if value.DeletedAt == nil || value.DeletedAt.UnixMilli() != deletedAt {
		t.Fatalf("expected deletion timestamp %d to remain unchanged, got %v", deletedAt, value.DeletedAt)
	}
}

// TestDiffSnapshotsOwnedIDSurvivesAbsenceFromCurrent covers SDD-48 ADR-48-2:
// a baseline id registered in ownedIDs MUST NOT be soft-deleted when it is
// absent from current -- it is carried forward verbatim (no Activo flip, no
// FechaEliminacion stamp, no modified_at bump, no event).
func TestDiffSnapshotsOwnedIDSurvivesAbsenceFromCurrent(t *testing.T) {
	t.Parallel()

	baselinePayload := []byte(`{"_id":"owned-anime","nombre":"Bridge Native","nrocapvisto":2,"activo":true}`)
	baselineRecord := SnapshotRecord{AnimeID: "owned-anime", CanonicalJSON: baselinePayload, Hash: HashSnapshot(baselinePayload), ModifiedAt: 42}

	current := map[string]SnapshotRecord{}
	baseline := map[string]SnapshotRecord{"owned-anime": baselineRecord}
	ownedIDs := map[string]struct{}{"owned-anime": {}}

	deltas, pruneIDs := DiffSnapshots(current, baseline, ownedIDs)

	if len(deltas) != 0 {
		t.Fatalf("expected no deltas for an owned id absent from current, got %+v", deltas)
	}
	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids for an owned id absent from current, got %v", pruneIDs)
	}

	got, ok := current["owned-anime"]
	if !ok {
		t.Fatal("expected owned id to be retained in current (not soft-deleted)")
	}
	if !bytes.Equal(got.CanonicalJSON, baselineRecord.CanonicalJSON) {
		t.Fatalf("expected owned id's canonical payload to remain unchanged, got %s", got.CanonicalJSON)
	}
	if got.ModifiedAt != baselineRecord.ModifiedAt {
		t.Fatalf("expected owned id's ModifiedAt %d to remain unchanged, got %d", baselineRecord.ModifiedAt, got.ModifiedAt)
	}

	value := decodeAnimeDomainInternal(t, got.CanonicalJSON)
	if value.Active != domain.TriStateTrue {
		t.Fatal("expected owned id to remain active (Activo=true), got it flipped")
	}
	if value.DeletedAt != nil {
		t.Fatal("expected owned id to have no FechaEliminacion stamped")
	}
}

// TestDiffSnapshotsUnownedIDStillSoftDeletesOnAbsence proves ownedIDs is a
// narrow exemption: an id absent from ownedIDs (or when ownedIDs is empty)
// still soft-deletes exactly as before SDD-48.
func TestDiffSnapshotsUnownedIDStillSoftDeletesOnAbsence(t *testing.T) {
	t.Parallel()

	baselinePayload := []byte(`{"_id":"unowned-anime","nombre":"Legacy Only","nrocapvisto":2,"activo":true}`)
	baselineRecord := SnapshotRecord{AnimeID: "unowned-anime", CanonicalJSON: baselinePayload, Hash: HashSnapshot(baselinePayload), ModifiedAt: 42}

	current := map[string]SnapshotRecord{}
	baseline := map[string]SnapshotRecord{"unowned-anime": baselineRecord}
	ownedIDs := map[string]struct{}{"some-other-owned-id": {}}

	deltas, pruneIDs := DiffSnapshots(current, baseline, ownedIDs)

	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids (soft-delete path, not prune), got %v", pruneIDs)
	}
	if len(deltas) != 1 {
		t.Fatalf("expected exactly 1 soft-delete delta for the unowned id, got %+v", deltas)
	}

	value := decodeAnimeDomainInternal(t, deltas[0].Payload)
	if value.Active != domain.TriStateFalse {
		t.Fatal("expected unowned id to be soft-deleted (Activo=false)")
	}
	if value.DeletedAt == nil {
		t.Fatal("expected unowned id to carry a FechaEliminacion stamp")
	}
}

// TestDiffSnapshotsOwnedIDWithHashChangeStillEmitsUpdate proves ownership
// only exempts the reconcile-absence soft-delete path -- an owned id that IS
// present in current with a changed hash still gets a normal update delta.
func TestDiffSnapshotsOwnedIDWithHashChangeStillEmitsUpdate(t *testing.T) {
	t.Parallel()

	oldPayload := []byte(`{"_id":"owned-anime","nombre":"Old","nrocapvisto":1}`)
	newPayload := []byte(`{"_id":"owned-anime","nombre":"New","nrocapvisto":2}`)
	baselineRecord := SnapshotRecord{AnimeID: "owned-anime", CanonicalJSON: oldPayload, Hash: HashSnapshot(oldPayload), ModifiedAt: 100}
	current := map[string]SnapshotRecord{
		"owned-anime": {AnimeID: "owned-anime", CanonicalJSON: newPayload, Hash: HashSnapshot(newPayload)},
	}
	ownedIDs := map[string]struct{}{"owned-anime": {}}

	deltas, _ := DiffSnapshots(current, map[string]SnapshotRecord{"owned-anime": baselineRecord}, ownedIDs)

	if len(deltas) != 1 {
		t.Fatalf("expected 1 update delta for an owned id present with a hash change, got %+v", deltas)
	}
	if got := current["owned-anime"].ModifiedAt; got <= 100 {
		t.Fatalf("expected owned present-and-changed record to bump ModifiedAt above baseline 100, got %d", got)
	}
}

// TestDiffSnapshotsOwnedIDAlreadySoftDeletedStaysTombstone proves the
// explicit user-initiated SoftDelete path is untouched: an owned id whose
// baseline is already a soft-delete tombstone stays a tombstone (ownership
// does not resurrect an explicit delete).
func TestDiffSnapshotsOwnedIDAlreadySoftDeletedStaysTombstone(t *testing.T) {
	t.Parallel()

	const deletedAt = int64(1700000000123)
	baselinePayload := []byte(`{"_id":"owned-deleted","nombre":"Owned Deleted","nrocapvisto":4,"activo":false,"fechaEliminacion":{"$$date":1700000000123}}`)
	baselineRecord := SnapshotRecord{
		AnimeID:       "owned-deleted",
		CanonicalJSON: baselinePayload,
		Hash:          HashSnapshot(baselinePayload),
		ModifiedAt:    1710000000456,
	}
	current := map[string]SnapshotRecord{}
	ownedIDs := map[string]struct{}{"owned-deleted": {}}

	deltas, pruneIDs := DiffSnapshots(current, map[string]SnapshotRecord{"owned-deleted": baselineRecord}, ownedIDs)

	if len(deltas) != 0 {
		t.Fatalf("expected no deltas for an owned id already soft-deleted, got %+v", deltas)
	}
	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids for an owned id already soft-deleted, got %v", pruneIDs)
	}

	got, ok := current["owned-deleted"]
	if !ok {
		t.Fatal("expected already-soft-deleted owned record to be carried forward in current")
	}
	if !bytes.Equal(got.CanonicalJSON, baselineRecord.CanonicalJSON) {
		t.Fatalf("expected canonical payload to remain unchanged, got %s", got.CanonicalJSON)
	}
	if got.ModifiedAt != baselineRecord.ModifiedAt {
		t.Fatalf("expected ModifiedAt %d to remain unchanged, got %d", baselineRecord.ModifiedAt, got.ModifiedAt)
	}

	value := decodeAnimeDomainInternal(t, got.CanonicalJSON)
	if value.DeletedAt == nil || value.DeletedAt.UnixMilli() != deletedAt {
		t.Fatalf("expected deletion timestamp %d to remain unchanged, got %v", deletedAt, value.DeletedAt)
	}
}

// TestDiffSnapshotsNilOwnedIDsReproducesPriorBehavior is the rollback
// guarantee (ADR-48-2): passing nil for ownedIDs must behave identically to
// the pre-SDD-48 two-argument DiffSnapshots -- every id is treated as
// unowned, so absence-driven soft-delete fires exactly as before.
func TestDiffSnapshotsNilOwnedIDsReproducesPriorBehavior(t *testing.T) {
	t.Parallel()

	baselinePayload := []byte(`{"_id":"anyone","nombre":"Anyone","nrocapvisto":1,"activo":true}`)
	baselineRecord := SnapshotRecord{AnimeID: "anyone", CanonicalJSON: baselinePayload, Hash: HashSnapshot(baselinePayload), ModifiedAt: 10}

	deltas, pruneIDs := DiffSnapshots(map[string]SnapshotRecord{}, map[string]SnapshotRecord{"anyone": baselineRecord}, nil)

	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids with nil ownedIDs (soft-delete path), got %v", pruneIDs)
	}
	if len(deltas) != 1 {
		t.Fatalf("expected 1 soft-delete delta with nil ownedIDs, got %+v", deltas)
	}

	value := decodeAnimeDomainInternal(t, deltas[0].Payload)
	if value.Active != domain.TriStateFalse {
		t.Fatal("expected nil ownedIDs to still soft-delete an absent baseline id")
	}
}

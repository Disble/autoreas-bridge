package anime_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

func TestScheduleServiceRejectsWholeDraftWhenAnyBaseIsStale(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}`, 202)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 201, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply stale schedule draft: %v", err)
	}
	if result.Outcome != anime.AnimePatchOutcomeConflict {
		t.Fatalf("expected whole-draft conflict, got %+v", result)
	}
	if writer.calls != 0 {
		t.Fatalf("expected zero writes for stale draft, got %d", writer.calls)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected one recorded conflict for stale draft, got %d", len(conflicts.inserted))
	}
}

func TestScheduleServiceRejectsWholeDraftWhenUnchangedBoardMemberAdvances(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 203)

	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB)}
	conflicts := &stubConflictWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}}},
	}})
	if err != nil {
		t.Fatalf("unexpected schedule apply error: %v", err)
	}
	if result.Outcome != anime.AnimePatchOutcomeConflict {
		t.Fatalf("expected whole-board OCC rejection when another board member advanced, got %+v", result)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected one recorded conflict for board-wide OCC rejection, got %d", len(conflicts.inserted))
	}
}

func TestScheduleServiceApplyDoesNotPartiallyWriteWhenBatchReplacementFails(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 202)

	// failingSecondWriteAnimeWriter implements batchReplaceWriter, so the
	// ScheduleService gateway delegates ReplaceFile to it instead of running
	// the default file-mutation coordinator. On first call the injected
	// ReplaceFile returns an error, simulating a batch replacement failure
	// before any append or finalize occurs. The batch path stages operations
	// atomically via ApplyBatch and releases echo state on both definite and
	// ambiguous errors, so a failure at the ReplaceFile seam leaves the
	// canonical file and store untouched. This is a delegate seam, not the
	// production writer, because the production path would perform an actual
	// filesystem replacement; the atomicity invariant under failure is the
	// same either way.
	writer := &failingSecondWriteAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	_, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 202, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 2}}},
	}})
	if err == nil {
		t.Fatal("expected batch replacement failure to surface")
	}
	first, err := store.GetSnapshot(ctx, "anime-a")
	if err != nil {
		t.Fatalf("get first snapshot: %v", err)
	}
	second, err := store.GetSnapshot(ctx, "anime-b")
	if err != nil {
		t.Fatalf("get second snapshot: %v", err)
	}
	if string(first.CanonicalJSON) != `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}` || string(second.CanonicalJSON) != `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}` {
		t.Fatalf("schedule apply must be fully atomic, got first=%s second=%s", first.CanonicalJSON, second.CanonicalJSON)
	}
}

func TestScheduleServiceApplyAcceptsValidPartialDraftIntoPopulatedWeekday(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Viernes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)

	publisher := &editorRecordingPublisher{}
	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})

	// anime-a is UNCHANGED at Lunes#1. Only anime-b is submitted, moved from
	// Viernes#1 to Lunes#2. The effective Lunes ordering is [1, 2] -- contiguous
	// -- so the draft is valid even though only the changed anime is in the draft.
	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-b", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Dia: "Lunes", Orden: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply valid partial draft: %v", err)
	}
	if result.Outcome != anime.AnimePatchOutcomeApplied {
		t.Fatalf("expected applied outcome for valid partial draft, got %+v", result)
	}
	if len(publisher.events()) != 1 {
		t.Fatalf("expected one publication for one changed anime, got %d", len(publisher.events()))
	}
}

func TestScheduleServiceApplyTwoAnimeDraftProducesAppliedOutcomeAndExactPublications(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)

	publisher := &editorRecordingPublisher{}
	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply two-anime schedule draft: %v", err)
	}
	if result.Outcome != anime.AnimePatchOutcomeApplied {
		t.Fatalf("expected applied outcome, got %+v", result)
	}
	if result.ModifiedAt <= 0 {
		t.Fatalf("expected positive refreshed board modified_at, got %d", result.ModifiedAt)
	}
	if len(publisher.events()) != 2 {
		t.Fatalf("expected exactly two publications (one per changed anime), got %d", len(publisher.events()))
	}
	afterRecords, err := anime.NewQueryService(store).ListReadRecords(ctx)
	if err != nil {
		t.Fatalf("query refreshed board after apply: %v", err)
	}
	if len(afterRecords) != 2 {
		t.Fatalf("expected refreshed board with two records, got %d", len(afterRecords))
	}
}

func TestScheduleServiceRejectsInvalidScheduleDraftsBeforeWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Viernes","orden":1}]}`
	payloadC := `{"_id":"anime-c","nombre":"C","activo":false,"dias":[{"dia":"Martes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-c", payloadC, 103)
	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB, payloadC)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)

	tests := []anime.ApplyAnimeScheduleDraftCommand{
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Fake", Orden: 1}}}}},
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-a", BaseModifiedAt: 101}, {AnimeID: "anime-a", BaseModifiedAt: 101}}},
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-c", BaseModifiedAt: 103, Placements: []contracts.MobileAnimeDay{{Dia: "Lunes", Orden: 3}}}}},
	}

	for _, command := range tests {
		if _, err := service.Apply(ctx, command); err == nil {
			t.Fatalf("expected invalid schedule draft to be rejected: %+v", command)
		}
	}
	if writer.calls != 0 {
		t.Fatalf("invalid schedule drafts must not write, got %d writes", writer.calls)
	}
}

type failingSecondWriteAnimeWriter struct {
	calls int
	path  string
}

func (w *failingSecondWriteAnimeWriter) RequestWrite(context.Context, string, []byte) error {
	w.calls++
	if w.calls == 2 {
		return errors.New("second append failed")
	}
	return nil
}

func (w *failingSecondWriteAnimeWriter) LegacyFilePath() string { return w.path }

func (w *failingSecondWriteAnimeWriter) ReplaceFile(context.Context, string, [][]byte) error {
	w.calls++
	if w.calls == 1 {
		return errors.New("second append failed")
	}
	return nil
}

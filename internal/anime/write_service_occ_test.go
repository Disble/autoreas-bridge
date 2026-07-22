package anime_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

func TestWriteServicePatchAnimeFastForwardsWhenBaseMatchesCurrent(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	patch := api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(1000)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt <= 1000 {
		t.Fatalf("expected ModifiedAt to advance past base 1000, got %d", got.ModifiedAt)
	}

	value := decodeAnimeDomain(t, got.CanonicalJSON)
	if value.Progress != 5 {
		t.Fatalf("expected applied progress 5, got %v", value.Progress)
	}
}

func TestWriteServicePatchAnimeDoesNotClobberOnDivergentBase(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success on divergence, got error: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 1000 {
		t.Fatalf("expected current snapshot ModifiedAt to remain 1000 (not clobbered), got %d", got.ModifiedAt)
	}

	value := decodeAnimeDomain(t, got.CanonicalJSON)
	if value.Progress != 2 {
		t.Fatalf("expected current snapshot progress to remain 2 (not clobbered), got %v", value.Progress)
	}
}

func TestWriteServicePatchAnimeNoOpsWhenDesiredValueAlreadyMatchesCurrent(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":5,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(999)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected no-op success, got error: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 1000 {
		t.Fatalf("expected ModifiedAt to remain unstamped at 1000 for a no-op, got %d", got.ModifiedAt)
	}
}

func TestWriteServicePatchAnimeCreatesWhenBaseNilAndRecordIsNew(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(1)}
	if _, err := service.PatchAnime(ctx, "anime-new", patch); err != nil {
		t.Fatalf("expected create to succeed, got error: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-new")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt <= 0 {
		t.Fatalf("expected create to stamp a positive ModifiedAt, got %d", got.ModifiedAt)
	}
}

func TestWriteServicePatchAnimeSafePathWhenBaseNilButRecordExists(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(9)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success on old-client safe path, got error: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt <= 1000 {
		t.Fatalf("expected current snapshot ModifiedAt to advance past 1000, got %d", got.ModifiedAt)
	}

	value := decodeAnimeDomain(t, got.CanonicalJSON)
	if value.Progress != 9 {
		t.Fatalf("expected current snapshot progress 9, got %v", value.Progress)
	}
}

func TestWriteServicePatchAnimeExplicitStaleFailsWhenConflictCannotBeRecorded(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(9), Base: int64Ptr(999)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err == nil {
		t.Fatal("expected explicit stale write to fail when conflict persistence is unavailable")
	}
}

func TestWriteServicePatchAnimeDivergenceInsertsConflictAndNotifies(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	currentJSON := `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", currentJSON, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success on divergence, got error: %v", err)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected 1 InsertConflict call, got %d", len(conflicts.inserted))
	}

	gotRecord := conflicts.inserted[0]
	if gotRecord.AnimeID != "anime-1" {
		t.Fatalf("expected conflict anime id %q, got %q", "anime-1", gotRecord.AnimeID)
	}
	if !jsonValueEqual(t, gotRecord.LocalSnapshotJSON, []byte(currentJSON)) {
		t.Fatalf("expected local snapshot %s, got %s", currentJSON, gotRecord.LocalSnapshotJSON)
	}

	remote := decodeAnimeDomain(t, gotRecord.RemoteSnapshotJSON)
	if remote.Progress != 7 {
		t.Fatalf("expected remote snapshot progress 7, got %v", remote.Progress)
	}

	if len(notifier.notifications) != 0 {
		t.Fatalf("expected UI result propagation, not a pre-commit notification, got %d", len(notifier.notifications))
	}
	current, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("expected divergence to leave the current snapshot untouched: %#v, %v", current, err)
	}
}

func TestWriteServicePatchAnimePropagatesConflictWriterFailure(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{err: errors.New("insert failed")}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err == nil {
		t.Fatal("expected conflict persistence failure to propagate")
	}
}

func TestWriteServicePatchAnimeIsolatesNotifierFailure(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{err: errors.New("notify failed")}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected success despite notifier failure, got error: %v", err)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected InsertConflict to still be called once, got %d", len(conflicts.inserted))
	}
}

func TestWriteServicePatchAnimeObserveOnlyStillEnforcesExplicitStaleBase(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier, OCCObserveOnly: true})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected success in observe-only mode, got error: %v", err)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected 1 InsertConflict call for explicit stale base, got %d", len(conflicts.inserted))
	}
	if len(notifier.notifications) != 0 {
		t.Fatalf("expected 0 Notify calls in observe-only mode, got %d", len(notifier.notifications))
	}
	current, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("expected explicit stale base to leave the current snapshot untouched: %#v, %v", current, err)
	}
}

func TestWriteServiceOCCExplicitStaleReturnsConflictAndCurrentToken(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"active":true}`, 200)
	conflicts := &stubConflictWriter{}
	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(300).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, OCCObserveOnly: true})
	stale := int64(100)

	result, err := service.PatchAnimeResult(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(9), Base: &stale})
	if err != nil {
		t.Fatalf("patch stale anime: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeConflict || result.ModifiedAt != 200 || result.ConflictID == "" {
		t.Fatalf("unexpected stale result: %#v", result)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected one stored conflict, got %d", len(conflicts.inserted))
	}
}

func TestWriteServiceOCCBaseLessExistingWriteReturnsAppliedWithoutConflict(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"active":true}`, 200)
	conflicts := &stubConflictWriter{}
	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(300).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	result, err := service.PatchAnimeResult(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(7)})
	if err != nil {
		t.Fatalf("patch base-less anime: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied || result.ModifiedAt != 300 {
		t.Fatalf("unexpected base-less result: %#v", result)
	}
	if len(conflicts.inserted) != 0 {
		t.Fatalf("unexpected compatibility side effects: conflicts=%d", len(conflicts.inserted))
	}
}

func TestWriteServiceOCCStaleNoOpReturnsNoOpWithoutSideEffects(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"active":true}`, 200)
	conflicts := &stubConflictWriter{}
	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(300).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})
	stale := int64(100)

	result, err := service.PatchAnimeResult(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(2), PreserveLastWatched: true, Base: &stale})
	if err != nil {
		t.Fatalf("patch no-op anime: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeNoOp || result.ModifiedAt != 200 {
		t.Fatalf("unexpected no-op result: %#v", result)
	}
	if len(conflicts.inserted) != 0 {
		t.Fatalf("unexpected no-op side effects: conflicts=%d", len(conflicts.inserted))
	}
}

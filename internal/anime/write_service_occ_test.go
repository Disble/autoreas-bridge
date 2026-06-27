package anime_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/notification"
)

func TestWriteServicePatchAnimeFastForwardsWhenBaseMatchesCurrent(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(1000)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}
	if writer.calls != 1 {
		t.Fatalf("expected 1 RequestWrite call for fast-forward, got %d", writer.calls)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if raw.NroCapVisto != 5 {
		t.Fatalf("expected applied nrocapvisto 5, got %v", raw.NroCapVisto)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt <= 1000 {
		t.Fatalf("expected ModifiedAt to advance past base 1000, got %d", got.ModifiedAt)
	}
}

func TestWriteServicePatchAnimeDoesNotClobberOnDivergentBase(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success on divergence, got error: %v", err)
	}
	if writer.calls != 0 {
		t.Fatalf("expected 0 RequestWrite calls on divergence (must not clobber), got %d", writer.calls)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 1000 {
		t.Fatalf("expected current snapshot ModifiedAt to remain 1000 (not clobbered), got %d", got.ModifiedAt)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(got.CanonicalJSON, &raw); err != nil {
		t.Fatalf("unmarshal current snapshot: %v", err)
	}
	if raw.NroCapVisto != 2 {
		t.Fatalf("expected current snapshot nrocapvisto to remain 2 (not clobbered), got %v", raw.NroCapVisto)
	}
}

func TestWriteServicePatchAnimeNoOpsWhenDesiredValueAlreadyMatchesCurrent(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":5,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected no-op success, got error: %v", err)
	}
	if writer.calls != 0 {
		t.Fatalf("expected 0 RequestWrite calls for no-op idempotent retry, got %d", writer.calls)
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
	if err := service.PatchAnime(ctx, "anime-new", patch); err != nil {
		t.Fatalf("expected create to succeed, got error: %v", err)
	}
	if writer.calls != 1 {
		t.Fatalf("expected 1 RequestWrite call for create, got %d", writer.calls)
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
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(9)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success on old-client safe path, got error: %v", err)
	}
	if writer.calls != 0 {
		t.Fatalf("expected 0 RequestWrite calls on old-client safe path (must not silently overwrite), got %d", writer.calls)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 1000 {
		t.Fatalf("expected current snapshot ModifiedAt to remain 1000 (not clobbered), got %d", got.ModifiedAt)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(got.CanonicalJSON, &raw); err != nil {
		t.Fatalf("unmarshal current snapshot: %v", err)
	}
	if raw.NroCapVisto != 2 {
		t.Fatalf("expected current snapshot nrocapvisto to remain 2 (not clobbered), got %v", raw.NroCapVisto)
	}
}

func TestWriteServicePatchAnimeDefaultDepsAreNilSafeNoOps(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(9), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success with nil deps, got error: %v", err)
	}
}

func TestWriteServicePatchAnimeDivergenceInsertsConflictAndNotifies(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	currentJSON := `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", currentJSON, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
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

	var remote domain.LegacyAnimeRaw
	if err := json.Unmarshal(gotRecord.RemoteSnapshotJSON, &remote); err != nil {
		t.Fatalf("unmarshal remote snapshot: %v", err)
	}
	if remote.NroCapVisto != 7 {
		t.Fatalf("expected remote snapshot nrocapvisto 7, got %v", remote.NroCapVisto)
	}

	if len(notifier.notifications) != 1 {
		t.Fatalf("expected 1 Notify call, got %d", len(notifier.notifications))
	}
	gotNotification := notifier.notifications[0]
	if gotNotification.Source != "sync" {
		t.Fatalf("expected notification source %q, got %q", "sync", gotNotification.Source)
	}
	if gotNotification.Level != notification.LevelWarning {
		t.Fatalf("expected notification level %q, got %q", notification.LevelWarning, gotNotification.Level)
	}
	if writer.calls != 0 {
		t.Fatalf("expected 0 RequestWrite calls on divergence, got %d", writer.calls)
	}
}

func TestWriteServicePatchAnimeIsolatesConflictWriterFailure(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{err: errors.New("insert failed")}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected success despite conflict writer failure, got error: %v", err)
	}
}

func TestWriteServicePatchAnimeIsolatesNotifierFailure(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{err: errors.New("notify failed")}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected success despite notifier failure, got error: %v", err)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected InsertConflict to still be called once, got %d", len(conflicts.inserted))
	}
}

func TestWriteServicePatchAnimeObserveOnlyAppliesLastCallWinsWithoutConflict(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier, OCCObserveOnly: true})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected success in observe-only mode, got error: %v", err)
	}
	if writer.calls != 1 {
		t.Fatalf("expected 1 RequestWrite call (last-call-wins) in observe-only mode, got %d", writer.calls)
	}
	if len(conflicts.inserted) != 0 {
		t.Fatalf("expected 0 InsertConflict calls in observe-only mode, got %d", len(conflicts.inserted))
	}
	if len(notifier.notifications) != 0 {
		t.Fatalf("expected 0 Notify calls in observe-only mode, got %d", len(notifier.notifications))
	}
}

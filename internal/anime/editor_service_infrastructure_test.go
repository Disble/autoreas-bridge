package anime_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/events"
)

func TestEditorServiceSavePublishesExactlyOnceOnlyAfterAcceptedWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"active":true}`, 1000)
	writer := &stubAnimeWriter{}
	publisher := &editorRecordingPublisher{}
	service := anime.NewEditorService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(2000).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})
	name := "Frieren Beyond"
	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Name: &name}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("accepted editor save: result=%+v err=%v", result, err)
	}
	afterAccepted, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || afterAccepted.ModifiedAt != 2000 || len(publisher.events()) != 1 {
		t.Fatalf("accepted editor save must write/publish exactly once: snapshot=%#v events=%d", afterAccepted, len(publisher.events()))
	}

	blank := " "
	if _, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 2000, Patch: anime.EditorPatch{Name: &blank}}); err == nil {
		t.Fatal("expected invalid follow-up save to fail")
	}
	afterRejected, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || afterRejected.ModifiedAt != 2000 || len(publisher.events()) != 1 {
		t.Fatalf("invalid editor save emitted side effects: snapshot=%#v events=%d", afterRejected, len(publisher.events()))
	}
}

// TestEditorServiceSaveInfrastructureFailureDoesNotPublish proves an
// infrastructure failure during persist() does not publish anime.changed.
//
// SDD-55 Slice B: persist() no longer routes through the Writer at all
// (finalize is a direct SQLite step, ADR-55-1) -- the injectable
// infrastructure failure point is now the write-base store's Finalize call,
// not a writer append error.
func TestEditorServiceSaveInfrastructureFailureDoesNotPublish(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"active":true}`, 1000)
	failing := &failingFinalizeStore{WriteBaseStore: store.WriteBaseStore(), err: errors.New("disk unavailable")}
	publisher := &editorRecordingPublisher{}
	service := anime.NewEditorService(store, &stubAnimeWriter{})
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher, WriteBases: failing})
	name := "Frieren Beyond"
	if _, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Name: &name}}); err == nil {
		t.Fatal("expected infrastructure failure")
	}
	if len(publisher.events()) != 0 {
		t.Fatalf("failed editor save must not publish: events=%d", len(publisher.events()))
	}
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("failed editor save must not finalize: %#v, %v", current, err)
	}
}

// failingFinalizeStore wraps a real WriteBaseStore and always fails Finalize.
type failingFinalizeStore struct {
	anime.WriteBaseStore
	err error
}

func (s *failingFinalizeStore) Finalize(ctx context.Context, operationID string, committedAtMs int64) error {
	return s.err
}

type editorRecordingPublisher struct{ recorded []events.Event }

func (p *editorRecordingPublisher) Publish(event events.Event) {
	p.recorded = append(p.recorded, event)
}

// events returns the publisher's recorded events.
func (p *editorRecordingPublisher) events() []events.Event {
	return append([]events.Event{}, p.recorded...)
}

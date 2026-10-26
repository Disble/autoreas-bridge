package anime_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/persistence"
)

func TestEditorServiceSavePublishesExactlyOnceOnlyAfterAcceptedWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"active":true}`, 1000)
	writer := &stubCommittedPublisher{}
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

// TestEditorServiceSaveInfrastructureFailureDoesNotPublish proves a failure
// inside the save transaction rolls the save back and publishes nothing. The
// failure is injected through the save rule, which runs inside that
// transaction just before the snapshot is written.
func TestEditorServiceSaveInfrastructureFailureDoesNotPublish(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"active":true}`, 1000)
	publisher := &editorRecordingPublisher{}
	service := anime.NewEditorService(store, &stubCommittedPublisher{})
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher, SaveRule: failingSaveRule("anime-editor")})
	name := "Frieren Beyond"
	if _, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Name: &name}}); !errors.Is(err, errSaveRuleInjected) {
		t.Fatalf("expected the injected failure, got %v", err)
	}
	if len(publisher.events()) != 0 {
		t.Fatalf("failed editor save must not publish: events=%d", len(publisher.events()))
	}
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("failed editor save must not be stored: %#v, %v", current, err)
	}
}

// errSaveRuleInjected is the failure failingSaveRule injects.
var errSaveRuleInjected = errors.New("injected save failure")

// failingSaveRule fails inside the save transaction when it reaches animeID,
// and keeps every other snapshot.
func failingSaveRule(animeID string) anime.SaveRule {
	return func(_ context.Context, _ persistence.Querier, id string, desired []byte) ([]byte, error) {
		if id == animeID {
			return nil, errSaveRuleInjected
		}
		return desired, nil
	}
}

type editorRecordingPublisher struct{ recorded []events.Event }

func (p *editorRecordingPublisher) Publish(event events.Event) {
	p.recorded = append(p.recorded, event)
}

// events returns the publisher's recorded events.
func (p *editorRecordingPublisher) events() []events.Event {
	return append([]events.Event{}, p.recorded...)
}

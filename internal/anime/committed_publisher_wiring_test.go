package anime_test

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

// snapshotOnlyLookup is a snapshot store with no durable write-base journal.
type snapshotOnlyLookup struct{}

func (snapshotOnlyLookup) GetSnapshot(context.Context, string) (anime.SnapshotRecord, error) {
	return anime.SnapshotRecord{}, nil
}

func (snapshotOnlyLookup) ListSnapshots(context.Context) (map[string]anime.SnapshotRecord, error) {
	return map[string]anime.SnapshotRecord{}, nil
}

// TestWriteServiceRecoveryNeedsAWriteJournalAndAPublisher pins the recovery
// gate: recovery runs only when there is a journal to replay AND a publisher to
// announce what it replays.
func TestWriteServiceRecoveryNeedsAWriteJournalAndAPublisher(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		service   func(t *testing.T) *anime.WriteService
		configure bool
	}{
		{"journal and publisher", func(t *testing.T) *anime.WriteService {
			return anime.NewWriteService(openAnimeServiceTestStore(t), &stubCommittedPublisher{})
		}, true},
		{"journal without publisher", func(t *testing.T) *anime.WriteService {
			return anime.NewWriteService(openAnimeServiceTestStore(t), nil)
		}, false},
		{"publisher without journal", func(*testing.T) *anime.WriteService {
			return anime.NewWriteService(snapshotOnlyLookup{}, &stubCommittedPublisher{})
		}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := tc.service(t).RecoveryConfigured(); got != tc.configure {
				t.Fatalf("expected RecoveryConfigured %v, got %v", tc.configure, got)
			}
		})
	}
}

// TestEditorServiceAnnouncesASaveThroughTheCommittedPublisher proves that
// without an injected bus publisher, an editor save is announced once through
// the committed publisher -- the production wiring.
func TestEditorServiceAnnouncesASaveThroughTheCommittedPublisher(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","status":0,"active":true}`, 1000)
	publisher := &stubCommittedPublisher{}
	service := anime.NewEditorService(store, publisher)
	service.SetNow(func() time.Time { return time.UnixMilli(2000).UTC() })
	total := 28

	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{
		TotalEpisodes: anime.EditorNullableIntPatch{Present: true, Value: total},
	}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("save editor patch: result=%+v err=%v", result, err)
	}
	assertSingleCommittedUpdate(t, publisher, "anime-editor")
}

// TestScheduleServiceAnnouncesAnApplyThroughTheCommittedPublisher proves the
// same production wiring for a schedule draft.
func TestScheduleServiceAnnouncesAnApplyThroughTheCommittedPublisher(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}`, 101)
	publisher := &stubCommittedPublisher{}
	service := anime.NewScheduleService(anime.NewQueryService(store), publisher)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 101, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}}},
	}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("apply schedule draft: result=%+v err=%v", result, err)
	}
	assertSingleCommittedUpdate(t, publisher, "anime-a")
}

// assertSingleCommittedUpdate fails unless exactly one update for animeID was published.
func assertSingleCommittedUpdate(t *testing.T, publisher *stubCommittedPublisher, animeID string) {
	t.Helper()
	if len(publisher.published) != 1 {
		t.Fatalf("expected one committed publication, got %d", len(publisher.published))
	}
	if event := publisher.published[0]; event.AnimeID != animeID || event.ChangeType != "update" {
		t.Fatalf("expected an update event for %q, got %#v", animeID, event)
	}
}

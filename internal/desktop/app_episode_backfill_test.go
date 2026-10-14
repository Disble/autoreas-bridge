package desktop

import (
	"context"
	"reflect"
	"sync"
	"testing"

	"autoreas-bridge/internal/anime/backfill"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// backfillTriggers records every scope the App asked the backfill for, and every stop.
type backfillTriggers struct {
	mu      sync.Mutex
	scopes  []backfill.Scope
	stopped int
}

// Trigger records scope.
func (b *backfillTriggers) Trigger(scope backfill.Scope) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.scopes = append(b.scopes, scope)
}

// Stop records the stop.
func (b *backfillTriggers) Stop() { b.stopped++ }

// subscribedTriggers returns a fresh bus with the backfill subscriptions wired to a recorder.
func subscribedTriggers() (*events.MemoryBus, *backfillTriggers) {
	bus, triggers := events.NewBus(), &backfillTriggers{}
	subscribeEpisodeBackfill(bus, triggers)
	return bus, triggers
}

func TestEpisodeBackfillTriggersAnAnimeThatMayHaveGainedFiles(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name  string
		event events.AnimeChangedEvent
		want  []backfill.Scope
	}{
		{name: "a created anime", event: events.AnimeChangedEvent{AnimeID: "a", ChangeType: events.AnimeChangeTypeCreate},
			want: []backfill.Scope{backfill.Only("a")}},
		{name: "a folder edit", event: events.AnimeChangedEvent{AnimeID: "a", ChangedFields: []string{"days", "folder"}},
			want: []backfill.Scope{backfill.Only("a")}},
		{name: "an activation", event: events.AnimeChangedEvent{AnimeID: "a", ChangedFields: []string{"active"}},
			want: []backfill.Scope{backfill.Only("a")}},
		{name: "a progress edit", event: events.AnimeChangedEvent{AnimeID: "a", ChangeType: events.AnimeChangeTypeUpdate,
			ChangedFields: []string{"episodesWatched", "lastWatchedAt"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			bus, triggers := subscribedTriggers()
			bus.Publish(tc.event)

			if !reflect.DeepEqual(triggers.scopes, tc.want) {
				t.Errorf("want %v, got %v", tc.want, triggers.scopes)
			}
		})
	}
}

func TestEpisodeBackfillTriggersTheAnimeARunDownloaded(t *testing.T) {
	t.Parallel()

	bus, triggers := subscribedTriggers()
	for _, landed := range []events.DownloadEpisodeDownloadedEvent{
		{RunID: "run-1", AnimeID: "b"}, {RunID: "run-1", AnimeID: "a"}, {RunID: "run-1", AnimeID: "b"}, {RunID: "run-2", AnimeID: "c"},
	} {
		bus.Publish(landed)
	}
	for _, runID := range []string{"run-1", "run-3", "run-2", "run-1"} {
		bus.Publish(events.DownloadRunFinishedEvent{RunID: runID})
	}

	want := []backfill.Scope{backfill.Only("a", "b"), backfill.Only("c")}
	if !reflect.DeepEqual(triggers.scopes, want) {
		t.Errorf("one trigger per finished run that landed episodes: want %v, got %v", want, triggers.scopes)
	}
}

func TestEpisodeBackfillStartsWithEveryAnimeAndStopsOnShutdown(t *testing.T) {
	t.Parallel()

	triggers := &backfillTriggers{}
	app := &App{eventBus: events.NewBus()}

	app.runEpisodeBackfill(triggers)
	app.shutdown(context.Background())

	if want := []backfill.Scope{backfill.All()}; !reflect.DeepEqual(triggers.scopes, want) {
		t.Errorf("process start fills every active anime: want %v, got %v", want, triggers.scopes)
	}
	if triggers.stopped != 1 {
		t.Errorf("shutdown must stop the backfill once, got %d", triggers.stopped)
	}
}

// listedAnime is the anime query the backfill lists from.
type listedAnime []contracts.MobileAnime

// ListMobileAnimes returns the listed anime.
func (l listedAnime) ListMobileAnimes(context.Context) ([]contracts.MobileAnime, error) {
	return l, nil
}

// TestTheWiredBackfillStoresARealEpisode drives the production backfill wiring — the pipeline's
// extension set, the real inventory and assigner, the real ffprobe and real SQLite — against a real
// file, and proves an inactive anime is left alone.
func TestTheWiredBackfillStoresARealEpisode(t *testing.T) {
	folder := realEpisode(t, 90, "Show - 03.mp4")
	db := sqlitedb.Open(t, episodes.SchemaTables()...)
	inactive := folder
	list := listedAnime{{ID: "on", Active: 1, Folder: &folder}, {ID: "off", Active: 0, Folder: &inactive}}

	newEpisodeBackfill(db, list, nil, nil).Run(context.Background(), backfill.All())

	store := episodes.NewStore(db, nil)
	on, err := store.ByAnime(context.Background(), "on")
	if err != nil {
		t.Fatalf("read durations: %v", err)
	}
	if len(on) != 1 || on[0].Episode != 3 || on[0].DurationMS < 89_000 || on[0].DurationMS > 91_000 {
		t.Errorf("want episode 3 at about 90 s, got %+v", on)
	}
	if off, _ := store.ByAnime(context.Background(), "off"); len(off) != 0 {
		t.Errorf("an inactive anime is never measured, got %+v", off)
	}
}

package desktop

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestEpisodeDurationReachesMobileWithoutTouchingTheAnime is the S13 guard at real SQLite: a
// duration write is announced as one ordinary update changelog row with changed_fields
// ["episodes"] and the anime's current snapshot, the changes feed serves that anime with its
// episodes, and the anime itself is untouched: no AnimeChangedEvent, the same snapshot and the
// same modified_at.
func TestEpisodeDurationReachesMobileWithoutTouchingTheAnime(t *testing.T) {
	ctx := context.Background()
	db := openAnnounceTestDB(t)
	body := []byte(`{"id":"anime-1","name":"Show","kind":0}`)
	snapshots, before := seedAnnounceAnime(t, db, body)

	bus := events.NewBus()
	animeChanged := 0
	bus.Subscribe(events.EventNameAnimeChanged, func(events.Event) { animeChanged++ })
	changelog := bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(db))
	recorder := bridgeSync.NewChangelogRecorder(bus, changelog)
	recorder.Start(ctx)
	t.Cleanup(recorder.Stop)

	app := &App{bridgeDB: db, eventBus: bus}
	app.startEpisodeAnnouncer()
	t.Cleanup(app.episodeDurations.stop)
	store := episodes.NewStore(db, time.Now).OnPendingMarked(app.episodeDurations.wake)
	if _, err := store.FillGaps(ctx, "anime-1", []episodes.Reading{{Episode: 2, DurationMS: (47 * time.Minute).Milliseconds()}}); err != nil {
		t.Fatalf("store duration: %v", err)
	}
	app.episodeDurations.announcer.Load().Wait()

	assertOneEpisodesUpdateRow(t, changelog, body)
	if pending, err := store.PendingAnnounce(ctx); err != nil || len(pending) != 0 {
		t.Errorf("the mark must be cleared once announced, got %v (%v)", pending, err)
	}
	if animeChanged != 0 {
		t.Errorf("a duration write must publish no AnimeChangedEvent, got %d", animeChanged)
	}
	after, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("read anime: %v", err)
	}
	if after.ModifiedAt != before.ModifiedAt || string(after.CanonicalJSON) != string(before.CanonicalJSON) {
		t.Errorf("the anime must be untouched: before %+v, after %+v", before, after)
	}

	_, feed := withMobileProjection(db, nil, nil, nil, bridgeSync.NewTriggerService(bus, changelog))
	changes, _, err := feed.ListChangesAfterID(ctx, 0)
	if err != nil {
		t.Fatalf("changes feed: %v", err)
	}
	want := contracts.EpisodeLength{Episode: 2, Minutes: 47, Long: true}
	if len(changes) != 1 || changes[0].Snapshot == nil || len(changes[0].Snapshot.Episodes) != 1 ||
		changes[0].Snapshot.Episodes[0] != want {
		t.Fatalf("the feed must serve the anime with its episodes %v, got %+v", want, changes)
	}
}

// openAnnounceTestDB opens a real bridge database in a fresh temporary folder.
func openAnnounceTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// seedAnnounceAnime stores one anime snapshot and returns the snapshot store and the stored record.
func seedAnnounceAnime(t *testing.T, db *sql.DB, body []byte) (*bridgeSync.AnimeSnapshotStore, anime.SnapshotRecord) {
	t.Helper()

	ctx := context.Background()
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	if err := snapshots.ReplaceBaseline(ctx, map[string]anime.SnapshotRecord{
		"anime-1": {AnimeID: "anime-1", CanonicalJSON: body, Hash: anime.HashSnapshot(body)},
	}, nil); err != nil {
		t.Fatalf("seed anime: %v", err)
	}
	record, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("read anime: %v", err)
	}
	return snapshots, record
}

// assertOneEpisodesUpdateRow checks the changelog holds exactly one update row for anime-1 with
// changed_fields ["episodes"] and the given snapshot.
func assertOneEpisodesUpdateRow(t *testing.T, changelog *bridgeSync.ChangelogStore, body []byte) {
	t.Helper()

	rows, err := changelog.ListPending(context.Background())
	if err != nil {
		t.Fatalf("list changelog: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("want one changelog row, got %+v", rows)
	}
	row := rows[0]
	if row.AnimeID != "anime-1" || row.ChangeType != events.AnimeChangeTypeUpdate ||
		len(row.ChangedFields) != 1 || row.ChangedFields[0] != "episodes" || string(row.SnapshotJSON) != string(body) {
		t.Errorf("want an update row [episodes] with the current snapshot, got %+v", row)
	}
}

// hubSpy records every anime change the hub was asked to broadcast.
type hubSpy struct {
	realtime.Hub
	got []events.AnimeChangedEvent
}

func (h *hubSpy) BroadcastAnimeChanged(_ context.Context, event events.AnimeChangedEvent) {
	h.got = append(h.got, event)
}

func TestHubTellsPhonesAboutAnEpisodeDurationAnnouncement(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	hub := &hubSpy{}
	subscribeHubToEpisodeDurations(context.Background(), bus, hub)

	bus.Publish(events.EpisodeDurationsChangedEvent{EventID: "e-1", AnimeID: "anime-1", Payload: []byte(`{}`)})
	bus.Publish(events.SyncRequestedEvent{Requester: "tablet"})

	if len(hub.got) != 1 {
		t.Fatalf("want one broadcast, got %+v", hub.got)
	}
	got := hub.got[0]
	if got.EventID != "e-1" || got.AnimeID != "anime-1" || string(got.Payload) != `{}` ||
		got.ChangeType != events.AnimeChangeTypeUpdate || len(got.ChangedFields) != 1 || got.ChangedFields[0] != "episodes" {
		t.Errorf("want the anime_changed broadcast an edit sends, got %+v", got)
	}
}

func TestEpisodeDurationsRuntimeWithoutAnAnnouncerIsSafe(t *testing.T) {
	t.Parallel()

	var runtime episodeDurationsRuntime
	runtime.wake()
	runtime.stop()

	app := &App{}
	app.startEpisodeAnnouncer()
	if app.episodeDurations.announcer.Load() != nil {
		t.Error("without a database no announcer may start")
	}
}

package desktop

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestSeasonCandidacyReachesMobileWithoutTouchingTheAnime is the S2/S3 guard at real SQLite:
// every season write that changes an anime's candidacy records one update changelog row with
// changed_fields ["season"] and the anime's current snapshot, the changes feed serves the anime
// with its candidacy, connected phones get an anime_changed nudge, and the anime itself keeps its
// snapshot and modified_at.
func TestSeasonCandidacyReachesMobileWithoutTouchingTheAnime(t *testing.T) {
	ctx := context.Background()
	db := openAnnounceTestDB(t)
	body := []byte(`{"id":"anime-1","name":"Show","kind":0}`)
	snapshots, before := seedAnnounceAnime(t, db, body)
	bus := events.NewBus()
	repo := season.WithProjectionSignal(season.NewSQLiteStore(db), bus)
	service := season.NewService(repo, time.Now, func() string { return "season-1" }, nil)
	hub := &hubSpy{}
	app := &App{bridgeDB: db, eventBus: bus, seasonService: service, realtimeHub: hub, catchUpContext: ctx}
	app.startSeasonProjectionPublisher(ctx)
	t.Cleanup(app.seasonProjectionPublisher.Stop)
	changelog := bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(db))
	_, feed := withMobileProjection(db, nil, app.seasonProjection(), nil, bridgeSync.NewTriggerService(bus, changelog))

	opened, err := service.CreateSeason(ctx, "Spring")
	if err != nil {
		t.Fatalf("open season: %v", err)
	}
	row := domain.NewSeasonAnime("row-1", opened.ID, "Show", time.UnixMilli(0))
	row.MatchStatus, row.Availability, row.AnimeID = domain.MatchMatched, domain.AvailabilityCreated, "anime-1"
	if err := repo.CreateSeasonAnime(ctx, row); err != nil {
		t.Fatalf("link candidate: %v", err)
	}
	assertSeasonFeed(t, feed, 1, &contracts.MobileAnimeSeason{SeasonID: opened.ID})

	if _, err := service.RecordPremiereGrade(ctx, "anime-1", 5, domain.GradeSourceMobileSync, time.Now()); err != nil {
		t.Fatalf("rate: %v", err)
	}
	grade := 5
	assertSeasonFeed(t, feed, 2, &contracts.MobileAnimeSeason{SeasonID: opened.ID, Grade: &grade})

	if err := service.CloseSeason(ctx, ""); err != nil {
		t.Fatalf("close season: %v", err)
	}
	assertSeasonFeed(t, feed, 3, nil)

	if len(hub.got) != 3 {
		t.Fatalf("want one nudge per recorded row, got %+v", hub.got)
	}
	for _, nudge := range hub.got {
		if nudge.AnimeID != "anime-1" || nudge.ChangeType != events.AnimeChangeTypeUpdate || len(nudge.ChangedFields) != 1 ||
			nudge.ChangedFields[0] != "season" || string(nudge.Payload) != string(body) {
			t.Fatalf("want the anime_changed nudge an edit sends, got %+v", nudge)
		}
	}
	after, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("read anime: %v", err)
	}
	if after.ModifiedAt != before.ModifiedAt || string(after.CanonicalJSON) != string(before.CanonicalJSON) {
		t.Fatalf("the anime must be untouched: before %+v, after %+v", before, after)
	}
}

// assertSeasonFeed checks the feed holds rows season rows, the last one serving want with the
// anime's unchanged modified_at, and timestamps rising row by row.
func assertSeasonFeed(t *testing.T, feed contracts.SyncTriggerService, rows int, want *contracts.MobileAnimeSeason) {
	t.Helper()

	changes, _, err := feed.ListChangesAfterID(context.Background(), 0)
	if err != nil {
		t.Fatalf("changes feed: %v", err)
	}
	if len(changes) != rows {
		t.Fatalf("want %d changelog rows, got %+v", rows, changes)
	}
	for i, change := range changes {
		if len(change.ChangedFields) != 1 || change.ChangedFields[0] != "season" || change.Snapshot == nil {
			t.Fatalf("row %d: want a [season] update with a snapshot, got %+v", i, change)
		}
		if i > 0 && change.Timestamp <= changes[i-1].Timestamp {
			t.Fatalf("row %d timestamp %d does not pass %d", i, change.Timestamp, changes[i-1].Timestamp)
		}
	}
	assertSeason(t, *changes[rows-1].Snapshot, want)
}

func TestSeasonProjectionPublisherStartsOnlyWithItsDependencies(t *testing.T) {
	ctx := context.Background()
	db := openAnnounceTestDB(t)
	service := season.NewService(season.NewSQLiteStore(db), time.Now, func() string { return "season-1" }, nil)
	cases := map[string]*App{
		"no event bus":      {bridgeDB: db, seasonService: service},
		"no season service": {bridgeDB: db, eventBus: events.NewBus()},
		"no database":       {eventBus: events.NewBus(), seasonService: service},
	}
	for name, app := range cases {
		app.catchUpContext = ctx
		app.startSeasonProjectionPublisher(ctx)
		if app.seasonProjectionPublisher != nil {
			t.Fatalf("%s: the publisher started", name)
		}
	}
}

func TestAnnounceSeasonCandidaciesSkipsOnlyAnAnimeWithoutASnapshot(t *testing.T) {
	db := openAnnounceTestDB(t)
	seedAnnounceAnime(t, db, []byte(`{"id":"anime-1","name":"Show"}`))
	hub := &hubSpy{}
	app := &App{bridgeDB: db, realtimeHub: hub}

	app.announceSeasonCandidacies(context.Background(), []string{"gone", "anime-1"})

	if len(hub.got) != 1 || hub.got[0].AnimeID != "anime-1" {
		t.Fatalf("want a nudge for anime-1 only, got %+v", hub.got)
	}
}

package desktop

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// resolvedPageURL is the page every resolve test picks for its row.
const resolvedPageURL = "https://jkanime.net/ao-ashi-2/"

// failingSecondUpdateRepo lets the resolve's own write succeed and fails every
// later row write, so the recheck that follows a resolve fails on its own.
type failingSecondUpdateRepo struct {
	*fakeSeasonRepo
	updates int
}

// UpdateSeasonAnime persists the first write and rejects the rest.
func (r *failingSecondUpdateRepo) UpdateSeasonAnime(ctx context.Context, row domain.SeasonAnime) error {
	r.updates++
	if r.updates > 1 {
		return errors.New("disk full")
	}
	return r.fakeSeasonRepo.UpdateSeasonAnime(ctx, row)
}

// TestResolveSeasonMatchRechecksTheRow pins every manual resolve: the row is
// matched to the picked page and then its availability is rechecked on the
// spot, a newly available row raises the "Available to create" notification,
// season_changed is broadcast, and the binding answers "ok". Unwired
// availability deps and a failing recheck never undo or fail the resolve.
func TestResolveSeasonMatchRechecksTheRow(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name         string
		probe        season.AvailabilityReader
		failRecheck  bool
		wantAvail    string
		wantEpisodes int
		wantNotified bool
	}{
		{name: "an online page becomes available and notifies", probe: fakeAppAvailabilityProbe{episodes: map[string]int{resolvedPageURL: 2}}, wantAvail: "available", wantEpisodes: 2, wantNotified: true},
		{name: "a page without episodes stays waiting", probe: fakeAppAvailabilityProbe{}, wantAvail: "waiting"},
		{name: "unwired availability deps still resolve", wantAvail: "waiting"},
		{name: "a failing recheck keeps the resolve", probe: fakeAppAvailabilityProbe{episodes: map[string]int{resolvedPageURL: 2}}, failRecheck: true, wantAvail: "waiting"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			hub := &stubAppRealtimeHub{seasonChanges: make(chan string, 4)}
			app, notifier, rowID := newResolveFixture(hub, tc.failRecheck)
			app.seasonService.SetAvailabilityDeps(tc.probe, nil)

			if got := app.ResolveSeasonMatch(rowID, resolvedPageURL); got != "ok" {
				t.Fatalf("ResolveSeasonMatch = %q, want ok", got)
			}

			row := app.GetSeasonAnimes()[0]
			if row.MatchStatus != "matched" || row.MatchedSlug != resolvedPageURL || row.Availability != tc.wantAvail || row.AvailableEpisodes != tc.wantEpisodes {
				t.Fatalf("row = %+v, want matched to %s, %s with %d episodes", row, resolvedPageURL, tc.wantAvail, tc.wantEpisodes)
			}
			assertAvailableNotification(t, notifier, tc.wantNotified)
			awaitSeasonChange(t, hub)
		})
	}
}

// newResolveFixture opens a season with one intake row and drains the setup
// broadcasts. With failRecheck, every row write after the resolve fails.
func newResolveFixture(hub *stubAppRealtimeHub, failRecheck bool) (*App, *recordingAppNotifier, string) {
	var repo season.Repository = newFakeSeasonRepo()
	if failRecheck {
		repo = &failingSecondUpdateRepo{fakeSeasonRepo: newFakeSeasonRepo()}
	}
	app := newTestSeasonApp(repo, hub)
	notifier := &recordingAppNotifier{}
	app.notifier = notifier
	_ = app.CreateSeason("Julio 2026")
	_ = app.ImportSeasonIntake("Ao Ashi")
	rowID := app.GetSeasonAnimes()[0].ID
	drainSeasonChanges(hub)
	return app, notifier, rowID
}

// assertAvailableNotification checks the resolve raised exactly one
// "Available to create" notification when want is true, and none otherwise.
func assertAvailableNotification(t *testing.T, notifier *recordingAppNotifier, want bool) {
	t.Helper()
	notified := len(notifier.received) == 1 && notifier.received[0].Title == "Available to create"
	if notified != want || len(notifier.received) > 1 {
		t.Fatalf("notifications = %+v, want notified %v", notifier.received, want)
	}
}

// awaitSeasonChange fails the test unless a season_changed broadcast arrives.
func awaitSeasonChange(t *testing.T, hub *stubAppRealtimeHub) {
	t.Helper()
	select {
	case <-hub.seasonChanges:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected a season_changed broadcast after resolve")
	}
}

// TestResolveSeasonMatchUnknownRowFails proves a failed resolve still reports
// its error and broadcasts nothing.
func TestResolveSeasonMatchUnknownRowFails(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{seasonChanges: make(chan string, 4)}
	app := newTestSeasonApp(newFakeSeasonRepo(), hub)
	_ = app.CreateSeason("Julio 2026")
	drainSeasonChanges(hub)
	app.seasonService.SetAvailabilityDeps(fakeAppAvailabilityProbe{}, nil)

	if got := app.ResolveSeasonMatch("missing", resolvedPageURL); got != season.ErrSeasonAnimeNotFound.Error() {
		t.Fatalf("ResolveSeasonMatch = %q, want %q", got, season.ErrSeasonAnimeNotFound.Error())
	}
	select {
	case status := <-hub.seasonChanges:
		t.Fatalf("unexpected season_changed broadcast %q after a failed resolve", status)
	default:
	}
}

// drainSeasonChanges discards the broadcasts a test's setup produced.
func drainSeasonChanges(hub *stubAppRealtimeHub) {
	for {
		select {
		case <-hub.seasonChanges:
		default:
			return
		}
	}
}

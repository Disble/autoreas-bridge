package download

import (
	"context"
	"slices"
	"sync"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

// TestRunAnimesProcessesOnlyTheGivenAnimes covers the season "Download now" over a chosen Ver hoy
// subset: the run processes exactly the animes it is handed, never today's scheduled selection,
// persists its trigger, and announces how many anime it queued.
func TestRunAnimesProcessesOnlyTheGivenAnimes(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	deps.SeasonMode = func(_ context.Context) bool { return true }
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{ID: "anime-unchosen", Name: "Unchosen", Active: 1, Days: []contracts.MobileAnimeDay{{Day: seasonModeDiaName}},
			SourceURL: new("https://jkanime.net/unchosen/"), Folder: new(t.TempDir())},
	}}
	store := newsvcFakeDownloadStore()
	deps.Store = store
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	var mu sync.Mutex
	var skippedIDs []string
	deps.Bus.Subscribe(events.EventNameDownloadSkipped, func(e events.Event) {
		mu.Lock()
		skippedIDs = append(skippedIDs, e.(events.DownloadSkippedEvent).AnimeID)
		mu.Unlock()
	})

	chosen := []contracts.MobileAnime{
		{ID: "anime-a", Name: "A", Active: 1, SourceURL: new("https://jkanime.net/a/"), Folder: new(t.TempDir())},
		{ID: "anime-b", Name: "B", Active: 1, SourceURL: new("https://jkanime.net/b/"), Folder: new(t.TempDir())},
	}
	if _, err := NewService(deps).RunAnimes(context.Background(), "season_selection", chosen); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	mu.Lock()
	got := slices.Sorted(slices.Values(skippedIDs))
	mu.Unlock()
	if !slices.Equal(got, []string{"anime-a", "anime-b"}) {
		t.Fatalf("expected only the chosen animes to run, got %#v", got)
	}
	run := store.runs["run-fixed"]
	if run.Trigger != "season_selection" || run.SkippedCount != 2 {
		t.Fatalf("unexpected persisted run %#v", run)
	}
	if body := notifier.calls[0].Body; body != "Download check started (season_selection) -- 2 anime queued." {
		t.Fatalf("unexpected run-started body %q", body)
	}
}

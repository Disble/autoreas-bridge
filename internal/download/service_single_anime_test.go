package download

import (
	"context"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
)

// RunAnime's failure ladder used to say only "The selected anime failed to download -- see run
// details" / "Some episodes failed to download -- see run details". Since there is only ever one
// anime on this path, the row is expected to name it directly (no collapse -- a single failed
// outcome is never "uneventful").
func TestRunAnimeRunFailedNotificationNamesTheAffectedAnimeAsARow(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listErr: map[string]error{
			"https://jkanime.net/broken-anime/": errors.New("boom: site scrape failed"),
		},
	})
	deps.Sites = registry
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := contracts.MobileAnime{
		ID:        "anime-broken",
		Name:      "Broken Anime",
		SourceURL: ptrStr("https://jkanime.net/broken-anime/"),
		Folder:    ptrStr(t.TempDir()),
	}

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("RunAnime: %v", err)
	}
	if result.Status != RunStatusError {
		t.Fatalf("status = %q, want %q", result.Status, RunStatusError)
	}

	got := findNotificationByTitle(notifier, "Download run failed")
	if got == nil {
		t.Fatal("no run-failed notification found")
	}
	if strings.Contains(got.Body, "see run details") {
		t.Fatalf("body = %q, still relies on the literal fallback wording", got.Body)
	}
	if len(got.Rows) != 1 {
		t.Fatalf("rows = %#v, want exactly 1", got.Rows)
	}
	if got.Rows[0].RefID != "anime-broken" || got.Rows[0].Name != "Broken Anime" || got.Rows[0].Status != "failed" {
		t.Fatalf("row[0] = %#v, want it to name Broken Anime", got.Rows[0])
	}
}

// The partial branch (some episodes downloaded, then a later one failed) must also name the
// anime as a row, not just say "some episodes failed".
func TestRunAnimeRunPartialNotificationNamesTheAffectedAnimeAsARow(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	folder := t.TempDir()
	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/flaky/": {LatestEpisode: 2, EpisodePageURL: "https://jkanime.net/flaky/2/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/flaky/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
		extractErr: map[string]error{
			"https://jkanime.net/flaky/2/": errors.New("boom: episode 2 links unavailable"),
		},
	})
	deps.Sites = registry
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 1}})
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := contracts.MobileAnime{
		ID:        "anime-flaky",
		Name:      "Flaky Anime",
		SourceURL: ptrStr("https://jkanime.net/flaky/"),
		Folder:    ptrStr(folder),
	}

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("RunAnime: %v", err)
	}
	if result.Status != RunStatusPartial {
		t.Fatalf("status = %q, want %q", result.Status, RunStatusPartial)
	}

	got := findNotificationByTitle(notifier, "Download run completed with errors")
	if got == nil {
		t.Fatal("no run-partial notification found")
	}
	if strings.Contains(got.Body, "see run details") {
		t.Fatalf("body = %q, still relies on the literal fallback wording", got.Body)
	}
	if len(got.Rows) != 1 {
		t.Fatalf("rows = %#v, want exactly 1", got.Rows)
	}
	if got.Rows[0].RefID != "anime-flaky" || got.Rows[0].Name != "Flaky Anime" || got.Rows[0].Status != "failed" {
		t.Fatalf("row[0] = %#v, want it to name Flaky Anime", got.Rows[0])
	}
}

package download

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
)

type readinessRegistry struct {
	resolve func(string) (sites.EpisodeSource, error)
	calls   int
}

func (r *readinessRegistry) Resolve(pageURL string) (sites.EpisodeSource, error) {
	r.calls++
	return r.resolve(pageURL)
}

func (r *readinessRegistry) Register(sites.EpisodeSource) {}

func TestReadinessSnapshotClassifiesLocalBlockersAndScheduleTotals(t *testing.T) {
	today := todayDiaName(baseReadinessClock())
	root := filepath.Join("D:", "Downloads")
	validPage := "https://supported.example/anime"
	source := &spyEpisodeSource{listing: sites.EpisodeListing{LatestEpisode: 99}}
	registry := &readinessRegistry{resolve: func(pageURL string) (sites.EpisodeSource, error) {
		if strings.Contains(pageURL, "unsupported") {
			return nil, ErrSiteUnsupported
		}
		return source, nil
	}}
	service := NewReadinessService(ReadinessServiceDeps{
		Animes: &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
			{ID: "missing", Name: `:/\|`, Active: 1, Days: []contracts.MobileAnimeDay{{Day: today}}, SourceURL: nil},
			{ID: "invalid", Name: "Invalid", SourceURL: ptrStr("relative/page"), Folder: ptrStr("D:/explicit")},
			{ID: "unsupported", Name: "Unsupported", SourceURL: ptrStr("https://unsupported.example/page"), Folder: ptrStr("D:/explicit")},
			{ID: "ready", Name: "Ready: Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: today}}, SourceURL: &validPage},
			{ID: "movie", Name: "Inactive Movie", Active: 0, Kind: ptrInt(1), SourceURL: &validPage, Folder: ptrStr("D:/movie")},
		}},
		DownloadsRoot: func(context.Context) (string, error) { return root, nil },
		Sites:         registry,
		Clock:         baseReadinessClock,
	})

	snapshot, err := service.BuildSnapshot(context.Background())
	if err != nil {
		t.Fatalf("BuildSnapshot: %v", err)
	}
	if snapshot.ScheduledTotal != 2 || snapshot.ScheduledReady != 1 || snapshot.ScheduledBlocked != 1 {
		t.Fatalf("scheduled totals = %d/%d/%d, want 2/1/1", snapshot.ScheduledTotal, snapshot.ScheduledReady, snapshot.ScheduledBlocked)
	}
	if len(snapshot.Items) != 5 {
		t.Fatalf("items = %d, want full catalog of 5", len(snapshot.Items))
	}
	if got := snapshot.Items[0].Reasons; len(got) != 2 || got[0] != DownloadReadinessMissingSource || got[1] != DownloadReadinessDestinationUnresolved {
		t.Fatalf("missing reasons = %#v, want ordered missing_source,destination_unresolved", got)
	}
	if got := snapshot.Items[3]; !got.Ready || len(got.Reasons) != 0 || !got.ScheduledToday {
		t.Fatalf("ready item = %#v, want ready scheduled item with empty reasons", got)
	}
	if got := snapshot.Items[4]; !got.Ready || got.ScheduledToday {
		t.Fatalf("inactive movie = %#v, want ready and outside schedule", got)
	}
	if source.listEpisodesCalls != 0 {
		t.Fatalf("page-open readiness called ListEpisodes %d times", source.listEpisodesCalls)
	}
	if registry.calls != 3 {
		t.Fatalf("registry Resolve calls = %d, want only syntactically usable sources", registry.calls)
	}
}

func TestReadinessSnapshotSerializesEmptyArraysAndPropagatesQueryFailures(t *testing.T) {
	empty := NewReadinessService(ReadinessServiceDeps{
		Animes:        &svcFakeAnimeQuery{},
		DownloadsRoot: func(context.Context) (string, error) { return "D:/Downloads", nil },
		Sites:         &readinessRegistry{resolve: func(string) (sites.EpisodeSource, error) { return nil, ErrSiteUnsupported }},
	})
	snapshot, err := empty.BuildSnapshot(context.Background())
	if err != nil {
		t.Fatalf("empty BuildSnapshot: %v", err)
	}
	payload, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatalf("marshal snapshot: %v", err)
	}
	if !strings.Contains(string(payload), `"items":[]`) {
		t.Fatalf("empty items were not serialized as []: %s", payload)
	}

	failure := errors.New("catalog unavailable")
	failed := NewReadinessService(ReadinessServiceDeps{
		Animes:        &svcFakeAnimeQuery{err: failure},
		DownloadsRoot: func(context.Context) (string, error) { return "D:/Downloads", nil },
		Sites:         &readinessRegistry{resolve: func(string) (sites.EpisodeSource, error) { return nil, ErrSiteUnsupported }},
	})
	if _, err := failed.BuildSnapshot(context.Background()); !errors.Is(err, failure) {
		t.Fatalf("catalog error = %v, want %v", err, failure)
	}
}

// baseReadinessClock returns the deterministic local time used by readiness fixtures.
func baseReadinessClock() time.Time { return time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC) }

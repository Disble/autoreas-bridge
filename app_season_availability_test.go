package main

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/download/sites"
)

// fakeEpisodeSource is a minimal sites.EpisodeSource returning a fixed listing.
type fakeEpisodeSource struct {
	latest int
	err    error
}

func (f fakeEpisodeSource) Descriptor() sites.SiteDescriptor {
	return sites.SiteDescriptor{Name: "fake"}
}
func (f fakeEpisodeSource) Matches(string) bool { return true }
func (f fakeEpisodeSource) ListEpisodes(context.Context, string) (sites.EpisodeListing, error) {
	return sites.EpisodeListing{LatestEpisode: f.latest}, f.err
}
func (f fakeEpisodeSource) EpisodePageURL(context.Context, string, int) (string, error) {
	return "", nil
}
func (f fakeEpisodeSource) ExtractLinks(context.Context, string) ([]sites.DownloadLink, error) {
	return nil, nil
}

// fakeRegistry resolves every URL to a fixed source, or a resolve error.
type fakeRegistry struct {
	source     sites.EpisodeSource
	resolveErr error
}

func (r fakeRegistry) Resolve(string) (sites.EpisodeSource, error) {
	if r.resolveErr != nil {
		return nil, r.resolveErr
	}
	return r.source, nil
}

func TestSeasonAvailabilityProbe(t *testing.T) {
	ctx := context.Background()

	yes := seasonAvailabilityProbe{registry: fakeRegistry{source: fakeEpisodeSource{latest: 2}}}
	if ok, err := yes.HasChapterOne(ctx, "https://jkanime.net/a/"); err != nil || !ok {
		t.Fatalf("latest 2 → available; got ok=%v err=%v", ok, err)
	}

	no := seasonAvailabilityProbe{registry: fakeRegistry{source: fakeEpisodeSource{latest: 0}}}
	if ok, err := no.HasChapterOne(ctx, "https://jkanime.net/b/"); err != nil || ok {
		t.Fatalf("latest 0 → not available; got ok=%v err=%v", ok, err)
	}

	unsupported := seasonAvailabilityProbe{registry: fakeRegistry{resolveErr: errors.New("unsupported")}}
	if ok, err := unsupported.HasChapterOne(ctx, "https://other.site/x/"); err != nil || ok {
		t.Fatalf("unsupported site → (false, nil); got ok=%v err=%v", ok, err)
	}
}

// fakeSnapshotLister returns canned snapshots.
type fakeSnapshotLister struct {
	records map[string]anime.SnapshotRecord
}

func (f fakeSnapshotLister) ListSnapshots(context.Context) (map[string]anime.SnapshotRecord, error) {
	return f.records, nil
}

func TestSeasonAnimeGatewayFindActiveByPagina(t *testing.T) {
	ctx := context.Background()
	gw := seasonAnimeGateway{snapshots: fakeSnapshotLister{records: map[string]anime.SnapshotRecord{
		"active-1":   {CanonicalJSON: []byte(`{"_id":"active-1","nombre":"A","activo":true,"pagina":"https://jkanime.net/a/"}`)},
		"inactive-1": {CanonicalJSON: []byte(`{"_id":"inactive-1","nombre":"B","activo":false,"pagina":"https://jkanime.net/b/"}`)},
	}}}

	if id, found, err := gw.FindActiveByPagina(ctx, "https://jkanime.net/a/"); err != nil || !found || id != "active-1" {
		t.Fatalf("active match: id=%q found=%v err=%v", id, found, err)
	}
	if _, found, _ := gw.FindActiveByPagina(ctx, "https://jkanime.net/b/"); found {
		t.Fatal("inactive anime must not match")
	}
	if _, found, _ := gw.FindActiveByPagina(ctx, "https://jkanime.net/none/"); found {
		t.Fatal("no match expected")
	}
}

func TestSeasonAnimeGatewayNextOrden(t *testing.T) {
	ctx := context.Background()
	gw := seasonAnimeGateway{snapshots: fakeSnapshotLister{records: map[string]anime.SnapshotRecord{
		"x": {CanonicalJSON: []byte(`{"_id":"x","dias":[{"dia":"Sin ver","orden":3}]}`)},
		"y": {CanonicalJSON: []byte(`{"_id":"y","dias":[{"dia":"Sin ver","orden":5}]}`)},
		"z": {CanonicalJSON: []byte(`{"_id":"z","dias":[{"dia":"Visto","orden":9}]}`)},
	}}}
	if got := gw.nextOrden(ctx, "Sin ver"); got != 6 {
		t.Fatalf("nextOrden(Sin ver) = %d, want 6", got)
	}
}

func TestSeasonScheduleStoreFixedConfig(t *testing.T) {
	store := &seasonScheduleStore{}
	cfg, err := store.GetScheduleConfig(context.Background())
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if cfg.DailyTimeHHMM != "21:00" || !cfg.Enabled || cfg.EnabledWeekdays != 0x7F {
		t.Fatalf("unexpected fixed config: %+v", cfg)
	}
}

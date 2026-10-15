package season

import (
	"context"
	"errors"
	"slices"
	"testing"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/season/domain"
)

// TestServiceRecheckRowAvailability pins the single-row recheck a manual
// resolve runs: only the named row is probed, a matched uncreated row records
// its availability and publishes one availability-check progress event, a
// probe failure leaves the row as it was, and a row that is not a create
// candidate is neither probed nor reported. A sibling matched row is never
// touched, proving the recheck is row-scoped rather than season-wide.
func TestServiceRecheckRowAvailability(t *testing.T) {
	t.Parallel()
	const target = recheckTargetURL
	cases := []recheckRowCase{
		{name: "newly available row is recorded and reported", status: domain.MatchMatched, availability: domain.AvailabilityWaiting, probe: &fakeProbe{episodes: map[string]int{target: 3}}, wantAvail: domain.AvailabilityAvailable, wantEpisodes: 3, wantAvailable: []string{"Ao Ashi"}, wantChecked: 1, wantEvents: 1},
		{name: "already available row is refreshed but not reported again", status: domain.MatchMatched, availability: domain.AvailabilityAvailable, probe: &fakeProbe{episodes: map[string]int{target: 4}}, wantAvail: domain.AvailabilityAvailable, wantEpisodes: 4, wantChecked: 1, wantEvents: 1},
		{name: "row without episodes stays waiting", status: domain.MatchMatched, availability: domain.AvailabilityWaiting, probe: &fakeProbe{}, wantAvail: domain.AvailabilityWaiting, wantChecked: 1, wantEvents: 1},
		{name: "probe failure leaves the row unchanged", status: domain.MatchMatched, availability: domain.AvailabilityWaiting, probe: &fakeProbe{err: errors.New("site down")}, wantAvail: domain.AvailabilityWaiting, wantChecked: 1, wantEvents: 1},
		{name: "unmatched row is not probed", status: domain.MatchNotFound, availability: domain.AvailabilityWaiting, probe: &fakeProbe{episodes: map[string]int{target: 3}}, wantAvail: domain.AvailabilityWaiting},
		{name: "created row is not probed", status: domain.MatchMatched, availability: domain.AvailabilityCreated, probe: &fakeProbe{episodes: map[string]int{target: 3}}, wantAvail: domain.AvailabilityCreated},
		{name: "unknown row is not found", status: domain.MatchMatched, availability: domain.AvailabilityWaiting, probe: &fakeProbe{episodes: map[string]int{target: 3}}, rowID: "missing", wantAvail: domain.AvailabilityWaiting, wantErr: ErrSeasonAnimeNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			repo, svc, collected := seedRecheckRow(t, tc)
			rowID := tc.rowID
			if rowID == "" {
				rowID = "row-target"
			}

			res, err := svc.RecheckRowAvailability(context.Background(), rowID)

			if !errors.Is(err, tc.wantErr) || (tc.wantErr == nil) != (err == nil) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if res.Checked != tc.wantChecked || !slices.Equal(res.Available, tc.wantAvailable) {
				t.Fatalf("result = %+v, want checked %d available %q", res, tc.wantChecked, tc.wantAvailable)
			}
			assertRecheckedRows(t, repo, tc)
			assertRecheckProgress(t, collected.progress, tc)
		})
	}
}

// recheckTargetURL is the page of the row every single-row recheck case targets.
const recheckTargetURL = "https://jkanime.net/ao-ashi-2/"

// recheckRowCase is one single-row recheck scenario and its expected outcome.
type recheckRowCase struct {
	name          string
	status        domain.MatchStatus
	availability  domain.Availability
	probe         *fakeProbe
	rowID         string
	wantAvail     domain.Availability
	wantEpisodes  int
	wantAvailable []string
	wantChecked   int
	wantEvents    int
	wantErr       error
}

// seedRecheckRow opens a season holding the case's target row plus a matched
// sibling the probe could also answer for, wires the case's probe and an event
// bus, and returns the repo, the service and the collected run events.
func seedRecheckRow(t *testing.T, tc recheckRowCase) (*fakeRepo, *Service, *seasonRunEvents) {
	t.Helper()
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedMatched(t, svc, repo, season.ID, "row-sibling", "Sibling", "https://jkanime.net/sibling/")
	row := domain.NewSeasonAnime("row-target", season.ID, "Ao Ashi", svc.now())
	row.MatchStatus, row.MatchedSlug, row.Availability = tc.status, recheckTargetURL, tc.availability
	if err := repo.CreateSeasonAnime(ctx, row); err != nil {
		t.Fatalf("seed: %v", err)
	}
	tc.probe.episodes = mergeEpisodes(tc.probe.episodes, "https://jkanime.net/sibling/", 9)
	svc.SetAvailabilityDeps(tc.probe, &fakeGateway{})
	bus := events.NewBus()
	svc.SetEventBus(bus)
	return repo, svc, subscribeSeasonRunEvents(bus)
}

// assertRecheckedRows checks the target row holds the expected availability
// and the sibling row was never touched.
func assertRecheckedRows(t *testing.T, repo *fakeRepo, tc recheckRowCase) {
	t.Helper()
	got := repo.animes["row-target"]
	if got.Availability != tc.wantAvail || got.AvailableEpisodes != tc.wantEpisodes || got.MatchStatus != tc.status {
		t.Fatalf("row = %+v, want availability %q episodes %d", got, tc.wantAvail, tc.wantEpisodes)
	}
	if sibling := repo.animes["row-sibling"]; sibling.AvailableEpisodes != 0 || sibling.Availability != domain.AvailabilityWaiting {
		t.Fatalf("sibling row must stay untouched, got %+v", sibling)
	}
}

// assertRecheckProgress checks the recheck published the expected number of
// availability-check progress events, all for the target row.
func assertRecheckProgress(t *testing.T, progress []events.SeasonMatchingProgressEvent, tc recheckRowCase) {
	t.Helper()
	if len(progress) != tc.wantEvents {
		t.Fatalf("progress events = %+v, want %d", progress, tc.wantEvents)
	}
	for _, p := range progress {
		if p.Phase != events.SeasonMatchingPhaseAvailabilityCheck || p.RowID != "row-target" || p.Availability != string(tc.wantAvail) {
			t.Fatalf("progress = %+v, want availability-check for row-target", p)
		}
	}
}

// TestServiceRecheckRowAvailabilityRequiresProbe proves the single-row
// recheck reports the same unwired-deps error as the season-wide one and
// leaves the row untouched.
func TestServiceRecheckRowAvailabilityRequiresProbe(t *testing.T) {
	t.Parallel()
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedMatched(t, svc, repo, season.ID, "row-target", "Ao Ashi", "https://jkanime.net/ao-ashi-2/")

	_, err := svc.RecheckRowAvailability(ctx, "row-target")

	if !errors.Is(err, ErrAvailabilityDepsUnavailable) {
		t.Fatalf("err = %v, want ErrAvailabilityDepsUnavailable", err)
	}
	if got := repo.animes["row-target"]; got.Availability != domain.AvailabilityWaiting {
		t.Fatalf("row must stay untouched, got %+v", got)
	}
}

// mergeEpisodes returns episodes with one more page count, allocating the map
// when a case left it nil.
func mergeEpisodes(episodes map[string]int, pageURL string, count int) map[string]int {
	if episodes == nil {
		episodes = map[string]int{}
	}
	episodes[pageURL] = count
	return episodes
}

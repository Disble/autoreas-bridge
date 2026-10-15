package season

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

// seasonRunEvents collects every season.* event a bus observes, in publish
// order. Publish is synchronous, so no mutex is needed for these tests.
type seasonRunEvents struct {
	started  []events.SeasonMatchingStartedEvent
	progress []events.SeasonMatchingProgressEvent
	finished []events.SeasonMatchingFinishedEvent
}

// subscribeSeasonRunEvents records every season.* event published on bus.
func subscribeSeasonRunEvents(bus *events.MemoryBus) *seasonRunEvents {
	collected := &seasonRunEvents{}
	bus.Subscribe(events.EventNameSeasonMatchingStarted, func(e events.Event) {
		started, ok := e.(events.SeasonMatchingStartedEvent)
		if !ok {
			return
		}
		collected.started = append(collected.started, started)
	})
	bus.Subscribe(events.EventNameSeasonMatchingProgress, func(e events.Event) {
		progress, ok := e.(events.SeasonMatchingProgressEvent)
		if !ok {
			return
		}
		collected.progress = append(collected.progress, progress)
	})
	bus.Subscribe(events.EventNameSeasonMatchingFinished, func(e events.Event) {
		finished, ok := e.(events.SeasonMatchingFinishedEvent)
		if !ok {
			return
		}
		collected.finished = append(collected.finished, finished)
	})
	return collected
}

// progressByRow indexes progress events by row id for assertions.
func progressByRow(progress []events.SeasonMatchingProgressEvent) map[string]events.SeasonMatchingProgressEvent {
	byRow := make(map[string]events.SeasonMatchingProgressEvent, len(progress))
	for _, p := range progress {
		byRow[p.RowID] = p
	}
	return byRow
}

// seedRowStatus forces one intake row into a match status, so a test can start
// from a decided row without going through a search.
func seedRowStatus(t *testing.T, svc *Service, repo *fakeRepo, seasonID, rawName string, status domain.MatchStatus) {
	t.Helper()
	ctx := context.Background()
	rows, err := svc.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		t.Fatalf("ListSeasonAnimes: %v", err)
	}
	for _, r := range rows {
		if r.RawName != rawName {
			continue
		}
		r.MatchStatus = status
		if err := repo.UpdateSeasonAnime(ctx, r); err != nil {
			t.Fatalf("seed row %q: %v", rawName, err)
		}
		return
	}
	t.Fatalf("row %q not found to seed", rawName)
}

// rowIDFor returns the id of the intake row with the given raw name.
func rowIDFor(t *testing.T, svc *Service, seasonID, rawName string) string {
	t.Helper()
	rows, err := svc.ListSeasonAnimes(context.Background(), seasonID)
	if err != nil {
		t.Fatalf("ListSeasonAnimes: %v", err)
	}
	for _, r := range rows {
		if r.RawName == rawName {
			return r.ID
		}
	}
	t.Fatalf("row %q not found", rawName)
	return ""
}

// progressForRow returns the progress event published for the row with the given
// raw name, failing the test when the run published none.
func progressForRow(t *testing.T, svc *Service, seasonID, rawName string, collected *seasonRunEvents) events.SeasonMatchingProgressEvent {
	t.Helper()
	event, ok := progressByRow(collected.progress)[rowIDFor(t, svc, seasonID, rawName)]
	if !ok {
		t.Fatalf("no progress published for row %q", rawName)
	}
	return event
}

func TestServiceRunMatchingPublishesStartedTotalAndProgressPerAttemptedRow(t *testing.T) {
	repo := newFakeRepo()
	searcher := &queryFailSearcher{
		byQuery: map[string][]match.Candidate{
			"Good Anime": {{Title: "Good Anime", PageURL: "https://jkanime.net/good-anime/"}},
		},
		failQuery: map[string]error{"Bad Typo Anime": errors.New("search 404")},
	}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	if _, err := svc.ImportIntake(ctx, season.ID, "Bad Typo Anime\nGood Anime\nDecided Anime"); err != nil {
		t.Fatalf("ImportIntake: %v", err)
	}
	// A decided row is never attempted, so it must contribute neither to the
	// total nor to the progress events.
	seedRowStatus(t, svc, repo, season.ID, "Decided Anime", domain.MatchMatched)

	bus := events.NewBus()
	svc.SetEventBus(bus)
	collected := subscribeSeasonRunEvents(bus)

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}

	if len(collected.started) != 1 {
		t.Fatalf("expected exactly 1 started event, got %d", len(collected.started))
	}
	if collected.started[0].SeasonID != season.ID {
		t.Fatalf("started SeasonID = %q, want %q", collected.started[0].SeasonID, season.ID)
	}
	if collected.started[0].Total != 2 {
		t.Fatalf("started Total = %d, want 2 (pending + search_failed rows only)", collected.started[0].Total)
	}
	if len(collected.progress) != 2 {
		t.Fatalf("expected 1 progress event per attempted row (2), got %d", len(collected.progress))
	}
	for _, p := range collected.progress {
		if p.Phase != events.SeasonMatchingPhaseMatching {
			t.Fatalf("matching-run progress Phase = %q, want %q", p.Phase, events.SeasonMatchingPhaseMatching)
		}
	}
}

// TestServiceRunMatchingProgressCarriesEachRowOutcome pins what travels on a
// progress event: the failed row's cleared resolution, the matched row's page,
// and nothing at all for a row that was never attempted.
func TestServiceRunMatchingProgressCarriesEachRowOutcome(t *testing.T) {
	repo := newFakeRepo()
	searcher := &queryFailSearcher{
		byQuery: map[string][]match.Candidate{
			"Good Anime": {{Title: "Good Anime", PageURL: "https://jkanime.net/good-anime/"}},
		},
		failQuery: map[string]error{"Bad Typo Anime": errors.New("search 404")},
	}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	if _, err := svc.ImportIntake(ctx, season.ID, "Bad Typo Anime\nGood Anime\nDecided Anime"); err != nil {
		t.Fatalf("ImportIntake: %v", err)
	}
	seedRowStatus(t, svc, repo, season.ID, "Decided Anime", domain.MatchMatched)

	bus := events.NewBus()
	svc.SetEventBus(bus)
	collected := subscribeSeasonRunEvents(bus)
	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}

	failed := progressForRow(t, svc, season.ID, "Bad Typo Anime", collected)
	if failed.MatchStatus != string(domain.MatchSearchFailed) {
		t.Fatalf("failed-row progress MatchStatus = %q, want %q", failed.MatchStatus, domain.MatchSearchFailed)
	}
	if failed.MatchedSlug != "" || len(failed.Candidates) != 0 {
		t.Fatalf("failed-row progress must clear slug and candidates, got %+v", failed)
	}
	if failed.RawName != "Bad Typo Anime" {
		t.Fatalf("failed-row progress RawName = %q, want the row's raw name", failed.RawName)
	}

	matched := progressForRow(t, svc, season.ID, "Good Anime", collected)
	if matched.MatchStatus != string(domain.MatchMatched) {
		t.Fatalf("matched-row progress MatchStatus = %q, want %q", matched.MatchStatus, domain.MatchMatched)
	}
	if matched.MatchedSlug != "https://jkanime.net/good-anime/" {
		t.Fatalf("matched-row progress MatchedSlug = %q", matched.MatchedSlug)
	}

	decidedID := rowIDFor(t, svc, season.ID, "Decided Anime")
	if p, attempted := progressByRow(collected.progress)[decidedID]; attempted {
		t.Fatalf("a decided row must never emit progress, got %+v", p)
	}
}

func TestServiceRunMatchingPublishesStartedZeroWhenNothingAttempted(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestServiceWithSearcher(repo, &queryFailSearcher{byQuery: map[string][]match.Candidate{}})
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	if _, err := svc.ImportIntake(ctx, season.ID, "Decided Anime"); err != nil {
		t.Fatalf("ImportIntake: %v", err)
	}
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	rows[0].MatchStatus = domain.MatchMatched
	if err := repo.UpdateSeasonAnime(ctx, rows[0]); err != nil {
		t.Fatalf("setup: %v", err)
	}

	bus := events.NewBus()
	svc.SetEventBus(bus)
	collected := subscribeSeasonRunEvents(bus)

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}
	if len(collected.started) != 1 || collected.started[0].Total != 0 {
		t.Fatalf("an empty run must still open with Total 0, got %+v", collected.started)
	}
	if len(collected.progress) != 0 {
		t.Fatalf("an empty run must emit no progress, got %+v", collected.progress)
	}
}

func TestServiceRunMatchingNilBusStaysSilent(t *testing.T) {
	repo := newFakeRepo()
	searcher := &queryFailSearcher{
		byQuery: map[string][]match.Candidate{
			"Good Anime": {{Title: "Good Anime", PageURL: "https://jkanime.net/good-anime/"}},
		},
		failQuery: map[string]error{"Bad Typo Anime": errors.New("search 404")},
	}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	if _, err := svc.ImportIntake(ctx, season.ID, "Bad Typo Anime\nGood Anime"); err != nil {
		t.Fatalf("ImportIntake: %v", err)
	}

	// No SetEventBus: a nil bus must degrade to silence, never a panic, and
	// the run behaviour must be exactly what it was without events.
	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	byName := rowsByName(rows)
	if byName["Bad Typo Anime"].MatchStatus != domain.MatchSearchFailed {
		t.Fatalf("failing row must be search_failed, got %+v", byName["Bad Typo Anime"])
	}
	if byName["Good Anime"].MatchStatus != domain.MatchMatched {
		t.Fatalf("good row must be matched, got %+v", byName["Good Anime"])
	}
}

func TestServiceRecheckAvailabilityPublishesAvailabilityPhaseProgress(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestServiceWithSearcher(repo, &queryFailSearcher{})
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedMatched(t, svc, repo, season.ID, "row-good", "Good Anime", "https://jkanime.net/good-anime/")
	seedMatched(t, svc, repo, season.ID, "row-waiting", "Waiting Anime", "https://jkanime.net/waiting-anime/")
	svc.SetAvailabilityDeps(
		&fakeProbe{episodes: map[string]int{"https://jkanime.net/good-anime/": 3}},
		&fakeGateway{},
	)

	bus := events.NewBus()
	svc.SetEventBus(bus)
	collected := subscribeSeasonRunEvents(bus)

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}
	if res.Checked != 2 {
		t.Fatalf("Checked = %d, want 2", res.Checked)
	}
	if len(collected.progress) != 2 {
		t.Fatalf("expected 1 progress event per probed row (2), got %+v", collected.progress)
	}
	for _, p := range collected.progress {
		if p.Phase != events.SeasonMatchingPhaseAvailabilityCheck {
			t.Fatalf("availability progress Phase = %q, want %q", p.Phase, events.SeasonMatchingPhaseAvailabilityCheck)
		}
	}
	byRow := progressByRow(collected.progress)
	if got := byRow["row-good"]; got.Availability != string(domain.AvailabilityAvailable) || got.AvailableEpisodes != 3 {
		t.Fatalf("available-row progress must carry availability + episodes, got %+v", got)
	}
	if got := byRow["row-waiting"]; got.Availability != string(domain.AvailabilityWaiting) || got.AvailableEpisodes != 0 {
		t.Fatalf("waiting-row progress must carry the waiting state, got %+v", got)
	}
	// The service owns per-row facts only: started and finished belong to the
	// run boundary (desktop RunSeasonMatching), so a standalone recheck must
	// emit neither.
	if len(collected.started) != 0 {
		t.Fatalf("a standalone recheck must not open a run, got %+v", collected.started)
	}
	if len(collected.finished) != 0 {
		t.Fatalf("a standalone recheck must not close a run, got %+v", collected.finished)
	}
}

func TestSeasonRunPhaseTransitionIsObservable(t *testing.T) {
	repo := newFakeRepo()
	searcher := &queryFailSearcher{
		byQuery: map[string][]match.Candidate{
			"Good Anime": {{Title: "Good Anime", PageURL: "https://jkanime.net/good-anime/"}},
		},
	}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	if _, err := svc.ImportIntake(ctx, season.ID, "Good Anime"); err != nil {
		t.Fatalf("ImportIntake: %v", err)
	}
	svc.SetAvailabilityDeps(
		&fakeProbe{episodes: map[string]int{"https://jkanime.net/good-anime/": 1}},
		&fakeGateway{},
	)

	bus := events.NewBus()
	svc.SetEventBus(bus)
	collected := subscribeSeasonRunEvents(bus)

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}
	if _, err := svc.RecheckAvailability(ctx, season.ID); err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	if len(collected.progress) != 2 {
		t.Fatalf("expected 1 matching + 1 availability progress event, got %+v", collected.progress)
	}
	if collected.progress[0].Phase != events.SeasonMatchingPhaseMatching {
		t.Fatalf("first progress Phase = %q, want the matching phase first", collected.progress[0].Phase)
	}
	if collected.progress[1].Phase != events.SeasonMatchingPhaseAvailabilityCheck {
		t.Fatalf("second progress Phase = %q, want the availability check second", collected.progress[1].Phase)
	}
}

package download

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

// TestARealRunSendsTheBodiesThatCarryItsNumbers is the wiring guard the unit tests above cannot
// be: they pin what the helpers return, and nothing in them fails if a call site goes back to the
// hard-coded sentence it replaced. Nor would mutation catch it -- `body: runStartedBody(...)` is a
// call in a struct literal, with no operator to mutate.
//
// One run pins both call sites, because the fixture that produces a partial run is also a run
// that queued two anime.
func TestARealRunSendsTheBodiesThatCarryItsNumbers(t *testing.T) {
	t.Parallel()

	deps, notifier := partialRunScenarioWithNotifier(t)

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	started, found := notificationWithTitle(notifier, "Download run started")
	if !found {
		t.Fatal("the run raised no start notification")
	}
	if started.Body != "Download check started (manual) -- 2 anime queued." {
		t.Fatalf("start body = %q, want it to state the selection it announced", started.Body)
	}

	partial, found := notificationWithTitle(notifier, "Download run completed with errors")
	if !found {
		t.Fatal("the run raised no partial-failure notification")
	}
	if partial.Body != "1 of 2 animes failed to download." {
		t.Fatalf("partial body = %q, want it to state both numbers", partial.Body)
	}
}

// TestRunStartedBodySaysHowManyAnimeAreQueued is the defect these bodies exist to close.
//
// The Windows toast folds its rows into one wrapped text element and clips whatever does not
// fit, so a count that lives only in the rows is a count the user does not get. "Download run
// completed" never had the problem -- its body already led with "3 episode(s) downloaded" -- and
// "Download run started" did, because its body named the trigger and nothing else.
//
// The expected sentence is written as a literal rather than assembled from the production
// format string: a test that borrows the constant it pins cannot fail when that constant drifts.
func TestRunStartedBodySaysHowManyAnimeAreQueued(t *testing.T) {
	t.Parallel()

	body := runStartedBody("scheduled", []contracts.MobileAnime{
		{ID: "a-1", Name: "Yani Neko"},
		{ID: "a-2", Name: "Youjo Senki II"},
		{ID: "a-3", Name: "Sayonara Lara"},
	}, nil)

	if body != "Download check started (scheduled) -- 3 anime queued." {
		t.Fatalf("body = %q, want it to lead with how many anime the run queued", body)
	}
}

// TestRunStartedBodyCountsOnlyWhatItCanName: an anime with no id never becomes a row
// (buildRunStartedRows drops it), so counting it would promise a subject the notification does
// not carry -- the body would say four and the record would name three.
func TestRunStartedBodyCountsOnlyWhatItCanName(t *testing.T) {
	t.Parallel()

	body := runStartedBody("manual", []contracts.MobileAnime{
		{ID: "a-1", Name: "Frieren"},
		{Name: "No ID"},
	}, nil)

	if body != "Download check started (manual) -- 1 anime queued." {
		t.Fatalf("body = %q, want the count to match the rows the record can address", body)
	}
}

// TestRunStartedBodyStatesNoCountWhenSelectionFailed: RunOnce announces the run even when the
// catalog query fails, and at that point nothing knows how many anime there were. A zero printed
// there would read as "nothing to do today", which is a different and false story.
func TestRunStartedBodyStatesNoCountWhenSelectionFailed(t *testing.T) {
	t.Parallel()

	body := runStartedBody("scheduled", nil, errors.New("catalog unavailable"))

	if body != "Download check started (scheduled)." {
		t.Fatalf("body = %q, want it to degrade to the count-less sentence", body)
	}
}

// TestRunStartedBodyStatesAnHonestZero separates the two silences above: a selection that
// SUCCEEDED and found nothing is a fact worth printing, and it is the answer to the question a
// user asks when a scheduled run appears to do nothing.
func TestRunStartedBodyStatesAnHonestZero(t *testing.T) {
	t.Parallel()

	body := runStartedBody("scheduled", nil, nil)

	if body != "Download check started (scheduled) -- 0 anime queued." {
		t.Fatalf("body = %q, want an empty selection stated rather than hidden", body)
	}
}

// TestPartialRunBodyStatesBothNumbers: "Some animes failed to download" is the same defect in
// prose form -- the user has to open the record to learn whether "some" was one of twelve or
// eleven of twelve, and those call for different reactions.
func TestPartialRunBodyStatesBothNumbers(t *testing.T) {
	t.Parallel()

	body := runPartialFailureBody([]animeRunOutcome{
		{animeID: "a-1", failed: true},
		{animeID: "a-2", episodesDownloaded: 1},
		{animeID: "a-3", failed: true},
		{animeID: "a-4", upToDate: true},
		{animeID: "a-5", checked: true},
	})

	if body != "2 of 5 animes failed to download." {
		t.Fatalf("body = %q, want both the failures and the total", body)
	}
}

// TestTotalFailureBodyStatesHowMany: "All animes failed" is true at one anime and at forty, and
// only one of those is worth interrupting someone for.
func TestTotalFailureBodyStatesHowMany(t *testing.T) {
	t.Parallel()

	body := runTotalFailureBody([]animeRunOutcome{
		{animeID: "a-1", failed: true},
		{animeID: "a-2", failed: true},
	})

	if body != "All 2 animes failed to download." {
		t.Fatalf("body = %q, want the total stated", body)
	}
}

// TestFailureBodiesCountOnlyFailures guards the partial branch against counting the run instead
// of the failures: with every outcome failed but one, "4 of 5" and "5 of 5" are one `!` apart.
func TestFailureBodiesCountOnlyFailures(t *testing.T) {
	t.Parallel()

	outcomes := []animeRunOutcome{
		{animeID: "a-1", failed: true},
		{animeID: "a-2", episodesDownloaded: 3},
	}

	if body := runPartialFailureBody(outcomes); body != "1 of 2 animes failed to download." {
		t.Fatalf("body = %q, want the failures counted rather than the outcomes", body)
	}
}

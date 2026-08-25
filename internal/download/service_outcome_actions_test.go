package download

import (
	"testing"

	"autoreas-bridge/internal/notification"
)

// rowTokens collects the per-row tokens one anime row carries, as "label=intent" pairs, so a test
// asserts on what the user sees and presses rather than on the builder's internal ordering.
func rowTokens(actions []notification.ActionSpec, rowRef string) []string {
	var tokens []string
	for _, action := range actions {
		if action.RowRef != rowRef {
			continue
		}
		tokens = append(tokens, action.Label+"="+action.Intent)
	}
	return tokens
}

// assertTokens fails unless the row carries exactly the expected "label=intent" pairs, in order.
func assertTokens(t *testing.T, got, want []string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("row tokens = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("row token %d = %q, want %q", i, got[i], want[i])
		}
	}
}

// assertRouteArg fails unless the row's single navigation token froze the expected route.
func assertRouteArg(t *testing.T, actions []notification.ActionSpec, rowRef, want string) {
	t.Helper()

	for _, action := range actions {
		if action.RowRef == rowRef && action.Intent == "navigation.open" {
			if action.Args["route"] != want {
				t.Fatalf("frozen route = %q, want %q", action.Args["route"], want)
			}
			return
		}
	}
	t.Fatalf("row %q carries no navigation token at all", rowRef)
}

// rowActionArgs returns the Args map of the row's first token, for the freezing test below.
func rowActionArgs(t *testing.T, actions []notification.ActionSpec, rowRef string) map[string]string {
	t.Helper()

	for _, action := range actions {
		if action.RowRef == rowRef {
			return action.Args
		}
	}
	t.Fatalf("row %q carries no token at all", rowRef)
	return nil
}

// TestBuildOutcomeActionsGivesAFailedRowTheRetryToken is Table B's `failed` row: the work did not
// happen, so the verb is to try it again.
func TestBuildOutcomeActionsGivesAFailedRowTheRetryToken(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{{
		animeID: "anime-1", animeName: "Failed One", checked: true, failed: true,
	}})

	got := rowTokens(actions, "anime-1")
	want := []string{"Run this anime again=download.run_anime"}
	assertTokens(t, got, want)
}

// TestBuildOutcomeActionsGivesADownloadedRowTheWatchToken is the defect this whole policy exists
// to close: an anime whose episodes are on disk was being offered a re-download.
func TestBuildOutcomeActionsGivesADownloadedRowTheWatchToken(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{{
		animeID: "anime-2", animeName: "Downloaded One", checked: true, episodesDownloaded: 1,
	}})

	got := rowTokens(actions, "anime-2")
	// The route is written as a literal rather than through the format constant: asserting
	// against the production symbol would pass even if that constant were rewritten.
	want := []string{"Watch=navigation.open"}
	assertTokens(t, got, want)
	assertRouteArg(t, actions, "anime-2", "/catalog/detail/anime-2")
}

// TestBuildOutcomeActionsGivesAManualRowTheCopyTokens pins that a hoster-blocked row offers the
// link, whatever terminal status the run landed on. It used to depend on the enclosing kind: the
// same row got copy buttons inside jdownloader_offline and a useless retry inside
// download.run_stopped_early.
func TestBuildOutcomeActionsGivesAManualRowTheCopyTokens(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{{
		animeID: "anime-3", animeName: "Manual One", checked: true,
		manualLinks: []ManualLink{{
			Anime: "Manual One", Episode: 7,
			Links: []string{"https://hoster-one.example/ep7", "https://hoster-two.example/ep7"},
		}},
	}})

	got := rowTokens(actions, "anime-3")
	want := []string{"Copy hoster 1=clipboard.copy", "Copy hoster 2=clipboard.copy"}
	assertTokens(t, got, want)
}

// TestBuildOutcomeActionsGivesASkippedRowTheEditorToken: an anime that cannot download at all is
// not retried, it is fixed. Same verb readiness_attention already offers for the same condition.
func TestBuildOutcomeActionsGivesASkippedRowTheEditorToken(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{{
		animeID: "anime-4", animeName: "Skipped One", skipped: true,
	}})

	got := rowTokens(actions, "anime-4")
	want := []string{"Open in editor=navigation.open"}
	assertTokens(t, got, want)
	assertRouteArg(t, actions, "anime-4", "/editor/anime-4")
}

// TestBuildOutcomeActionsLeavesAQuietRowWithoutAToken covers both quiet statuses. An anime that
// was already current, or that the run merely looked at, has no next step -- and a button that
// means nothing is worse than no button, because it teaches the user that the buttons are noise.
func TestBuildOutcomeActionsLeavesAQuietRowWithoutAToken(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name    string
		outcome animeRunOutcome
	}{
		{name: "up to date", outcome: animeRunOutcome{animeID: "anime-5", checked: true, upToDate: true}},
		{name: "checked", outcome: animeRunOutcome{animeID: "anime-6", checked: true}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{testCase.outcome})

			if got := rowTokens(actions, testCase.outcome.animeID); got != nil {
				t.Fatalf("quiet row carries %#v, want no per-row token at all", got)
			}
		})
	}
}

// TestBuildOutcomeActionsResolvesEveryRowOnItsOwnStatus is the point of the whole change: one run
// holds rows that each want a different verb, so the enclosing kind cannot decide for them.
func TestBuildOutcomeActionsResolvesEveryRowOnItsOwnStatus(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{
		{animeID: "a-failed", checked: true, failed: true},
		{animeID: "a-downloaded", checked: true, episodesDownloaded: 2},
		{animeID: "a-current", checked: true, upToDate: true},
	})

	assertTokens(t, rowTokens(actions, "a-failed"), []string{"Run this anime again=download.run_anime"})
	assertTokens(t, rowTokens(actions, "a-downloaded"), []string{"Watch=navigation.open"})
	if got := rowTokens(actions, "a-current"); got != nil {
		t.Fatalf("the up-to-date row carries %#v, want nothing", got)
	}
}

// TestBuildOutcomeActionsAppliesTheStatusPrecedence: an anime can download two episodes and then
// lose the third on every hoster. The row carries ONE verb, and it has to be the one that needs a
// human -- the same precedence outcomeRowStatus already applies to the row's status word.
func TestBuildOutcomeActionsAppliesTheStatusPrecedence(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{{
		animeID: "anime-7", checked: true, failed: true, episodesDownloaded: 2,
		manualLinks: []ManualLink{{Anime: "Mixed", Episode: 3, Links: []string{"https://hoster.example/ep3"}}},
	}})

	assertTokens(t, rowTokens(actions, "anime-7"), []string{"Run this anime again=download.run_anime"})
}

// TestBuildOutcomeActionsKeepsTheWholeNotificationToken pins that per-row tokens are added to the
// run-wide one rather than replacing it: the notification is still about a download run.
func TestBuildOutcomeActionsKeepsTheWholeNotificationToken(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{{animeID: "anime-8", checked: true, failed: true}})

	var runWide int
	for _, action := range actions {
		if action.RowRef == "" {
			runWide++
			if action.Label != "See this run" || action.Args["route"] != "/downloads?runId=run-1" {
				t.Fatalf("run-wide action = %#v, want the See this run token", action)
			}
		}
	}
	if runWide != 1 {
		t.Fatalf("run-wide actions = %d, want exactly 1", runWide)
	}
}

// TestBuildOutcomeActionsIgnoresAnAnimeItCannotAddress: an outcome with no id addresses no record,
// so every verb behind it would refuse the moment it was pressed.
func TestBuildOutcomeActionsIgnoresAnAnimeItCannotAddress(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{{animeName: "No ID", checked: true, failed: true}})

	for _, action := range actions {
		if action.RowRef != "" {
			t.Fatalf("action %#v is bound to a row, want run-wide tokens only", action)
		}
	}
}

// TestBuildOutcomeActionsFreezesArgsPerToken: each token owns its Args map, so one row's frozen
// arguments can never be rewritten through another's.
func TestBuildOutcomeActionsFreezesArgsPerToken(t *testing.T) {
	t.Parallel()

	actions := buildOutcomeActions(kindRunStoppedEarly, "run-1", []animeRunOutcome{
		{animeID: "anime-9", checked: true, failed: true},
		{animeID: "anime-10", checked: true, failed: true},
	})

	first := rowActionArgs(t, actions, "anime-9")
	second := rowActionArgs(t, actions, "anime-10")
	first["animeId"] = "rewritten"

	if second["animeId"] != "anime-10" {
		t.Fatalf("second row's frozen animeId = %q, want it untouched by the first", second["animeId"])
	}
}

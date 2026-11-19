package download

import (
	"testing"

	"autoreas-bridge/internal/notification"
)

// runWideLabels collects the labels of the tokens bound to no row, which is the whole-notification
// level the pane renders in its footer.
func runWideLabels(actions []notification.ActionSpec) []string {
	var labels []string
	for _, action := range actions {
		if action.RowRef == "" {
			labels = append(labels, action.Label)
		}
	}
	return labels
}

// TestRunWideActionsOffersToWatchOnlyOnACompletedRun pins the whole-notification half of the same
// argument the per-row verbs settle: a run that finished cleanly has episodes on disk, so the
// event's own destination is where you go to watch them. Every other run kind reports something
// still in flight or gone wrong, and "watch today" would be a lie on all of them.
func TestRunWideActionsOffersToWatchOnlyOnACompletedRun(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		kind string
		want []string
	}{
		{kind: "run_completed", want: []string{"See this run", "Watch today"}},
		{kind: "run_started", want: []string{"See this run"}},
		{kind: "download.run_stopped_early", want: []string{"See this run"}},
		{kind: "jdownloader_offline", want: []string{"See this run"}},
		{kind: "readiness_attention", want: []string{"See this run"}},
	} {
		t.Run(testCase.kind, func(t *testing.T) {
			t.Parallel()

			got := runWideLabels(runWideActions(testCase.kind, "run-1"))

			if len(got) != len(testCase.want) {
				t.Fatalf("run-wide labels for %q = %#v, want %#v", testCase.kind, got, testCase.want)
			}
			for i := range testCase.want {
				if got[i] != testCase.want[i] {
					t.Fatalf("run-wide label %d for %q = %q, want %q", i, testCase.kind, got[i], testCase.want[i])
				}
			}
		})
	}
}

// TestRunWideWatchTokenIsAddressedAtToday pins the route rather than only the label, written as a
// literal so it cannot pass against a rewritten route constant.
func TestRunWideWatchTokenIsAddressedAtToday(t *testing.T) {
	t.Parallel()

	for _, action := range runWideActions("run_completed", "run-1") {
		if action.Label != "Watch today" {
			continue
		}
		if action.Intent != "navigation.open" || action.Args["route"] != "/today" {
			t.Fatalf("watch-today token = %#v, want navigation.open at /today", action)
		}
		return
	}
	t.Fatal("a completed run carries no watch-today token")
}

// TestReadinessAttentionCarriesTheRunWideToken closes the one kind that had per-row verbs and
// nowhere for the notification itself to go. Every row knew where its blocker was fixable while
// the notice as a whole was a dead end -- and it is an advisory attached to a run, so the run is
// where it belongs.
func TestReadinessAttentionCarriesTheRunWideToken(t *testing.T) {
	t.Parallel()

	rows := []notification.DetailItem{{RefType: "anime", RefID: "anime-1", Name: "Blocked One"}}

	got := runWideLabels(buildReadinessAttentionActions("run-1", rows))

	if len(got) != 1 || got[0] != "See this run" {
		t.Fatalf("run-wide labels = %#v, want [See this run]", got)
	}
}

// TestReadinessAttentionKeepsItsPerRowEditorToken guards the addition above from swallowing what
// was already there.
func TestReadinessAttentionKeepsItsPerRowEditorToken(t *testing.T) {
	t.Parallel()

	rows := []notification.DetailItem{{RefType: "anime", RefID: "anime-1", Name: "Blocked One"}}

	got := rowTokens(buildReadinessAttentionActions("run-1", rows), "anime-1")

	assertTokens(t, got, []string{"Open in editor=navigation.open"})
}

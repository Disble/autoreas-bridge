package download

import (
	"context"
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
		{kind: "run_completed", want: []string{"Open Downloads", "Watch today"}},
		{kind: "run_started", want: []string{"Open Downloads"}},
		{kind: "download.run_stopped_early", want: []string{"Open Downloads"}},
		{kind: "jdownloader_offline", want: []string{"Open Downloads"}},
		{kind: "readiness_attention", want: []string{"Open Downloads"}},
	} {
		t.Run(testCase.kind, func(t *testing.T) {
			t.Parallel()

			got := runWideLabels(runWideActions(testCase.kind))

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

	for _, action := range runWideActions("run_completed") {
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

// TestCompletedRunNotificationCarriesTheWatchTodayToken proves the token survives the whole
// producer path, not just the builder: a run_completed raised by the real status ladder is what
// the user actually receives.
func TestCompletedRunNotificationCarriesTheWatchTodayToken(t *testing.T) {
	t.Parallel()

	deps, notifier := cleanMixedRunScenario(t)
	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	sent, found := notificationWithTitle(notifier, "Download run completed")
	if !found {
		t.Fatalf("no run_completed notification in %#v", notifier.notifications())
	}

	got := runWideLabels(sent.Actions)
	if len(got) != 2 || got[0] != "Open Downloads" || got[1] != "Watch today" {
		t.Fatalf("run-wide labels = %#v, want [Open Downloads Watch today]", got)
	}
}

// TestReadinessAttentionCarriesTheRunWideToken closes the one kind that had per-row verbs and
// nowhere for the notification itself to go. Every row knew where its blocker was fixable while
// the notice as a whole was a dead end -- and it is an advisory attached to a run, so the run is
// where it belongs.
func TestReadinessAttentionCarriesTheRunWideToken(t *testing.T) {
	t.Parallel()

	rows := []notification.DetailItem{{RefType: "anime", RefID: "anime-1", Name: "Blocked One"}}

	got := runWideLabels(buildReadinessAttentionActions(rows))

	if len(got) != 1 || got[0] != "Open Downloads" {
		t.Fatalf("run-wide labels = %#v, want [Open Downloads]", got)
	}
}

// TestReadinessAttentionKeepsItsPerRowEditorToken guards the addition above from swallowing what
// was already there.
func TestReadinessAttentionKeepsItsPerRowEditorToken(t *testing.T) {
	t.Parallel()

	rows := []notification.DetailItem{{RefType: "anime", RefID: "anime-1", Name: "Blocked One"}}

	got := rowTokens(buildReadinessAttentionActions(rows), "anime-1")

	assertTokens(t, got, []string{"Open in editor=navigation.open"})
}

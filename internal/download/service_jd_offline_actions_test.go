package download

import (
	"strings"
	"testing"
)

// TestBuildJDOfflineActionsGivesEveryHosterLinkItsOwnCopyToken is the artboard's jd_offline row:
// "Copy hoster 1" / "Copy hoster 2", one per link, each bound to the anime row it came from and
// each freezing its own link.
func TestBuildJDOfflineActionsGivesEveryHosterLinkItsOwnCopyToken(t *testing.T) {
	t.Parallel()

	outcomes := []animeRunOutcome{{
		animeID:   "anime-7",
		animeName: "Tenmaku no Jaadugar",
		manualLinks: []ManualLink{{
			Anime:   "Tenmaku no Jaadugar",
			Episode: 7,
			Links:   []string{"https://hoster-one.example/ep7", "https://hoster-two.example/ep7"},
		}},
	}}

	actions := buildJDOfflineActions(outcomes)

	var copies []string
	for _, action := range actions {
		if action.Intent != "clipboard.copy" {
			continue
		}
		if action.RowRef != "anime-7" {
			t.Fatalf("action %#v is bound to %q, want the anime row it came from", action, action.RowRef)
		}
		copies = append(copies, action.Label+"="+action.Args["text"])
	}

	want := []string{
		"Copy hoster 1=https://hoster-one.example/ep7",
		"Copy hoster 2=https://hoster-two.example/ep7",
	}
	if len(copies) != len(want) {
		t.Fatalf("copy tokens = %#v, want %#v", copies, want)
	}
	for i, got := range copies {
		if got != want[i] {
			t.Fatalf("copy token %d = %q, want %q", i, got, want[i])
		}
	}
}

// TestBuildJDOfflineActionsKeepsTheWholeNotificationToken pins that the per-row copy tokens are
// added to the run-wide ones, not instead of them: the notification is still about a download run.
func TestBuildJDOfflineActionsKeepsTheWholeNotificationToken(t *testing.T) {
	t.Parallel()

	actions := buildJDOfflineActions([]animeRunOutcome{{
		animeID:     "anime-7",
		manualLinks: []ManualLink{{Episode: 1, Links: []string{"https://hoster.example/ep1"}}},
	}})

	found := false
	for _, action := range actions {
		if action.Intent == "navigation.open" {
			if action.RowRef != "" {
				t.Fatalf("whole-notification action %#v carries a row binding, want none", action)
			}
			found = true
		}
	}
	if !found {
		t.Fatalf("actions = %#v, want the whole-notification token to ride along", actions)
	}
}

// TestBuildJDOfflineActionsNeverBindsTheRerunToken pins what this builder exists to AVOID. The
// default row action is "Run this anime again", but a jd_offline row's affordance is copying the
// link a human will hand to JDownloader themselves -- re-running an anime whose downloader is
// still offline just reproduces the same block.
func TestBuildJDOfflineActionsNeverBindsTheRerunToken(t *testing.T) {
	t.Parallel()

	actions := buildJDOfflineActions([]animeRunOutcome{{
		animeID:     "anime-7",
		manualLinks: []ManualLink{{Episode: 1, Links: []string{"https://hoster.example/ep1"}}},
	}})

	for _, action := range actions {
		if action.Intent == "download.run_anime" {
			t.Fatalf("jd_offline actions grew a re-run token %#v, want none", action)
		}
	}
}

// TestBuildJDOfflineActionsNumbersHostersAcrossEveryEpisodeOfOneRow pins that the numbering is
// per ROW, not per episode: the row is one anime, and its buttons read 1..N in the order the run
// found them, across however many episodes contributed links.
func TestBuildJDOfflineActionsNumbersHostersAcrossEveryEpisodeOfOneRow(t *testing.T) {
	t.Parallel()

	actions := buildJDOfflineActions([]animeRunOutcome{{
		animeID: "anime-7",
		manualLinks: []ManualLink{
			{Episode: 7, Links: []string{"https://a.example/ep7"}},
			{Episode: 8, Links: []string{"https://a.example/ep8"}},
		},
	}})

	var labels []string
	for _, action := range actions {
		if action.Intent == "clipboard.copy" {
			labels = append(labels, action.Label)
		}
	}
	want := []string{"Copy hoster 1", "Copy hoster 2"}
	if len(labels) != len(want) || labels[0] != want[0] || labels[1] != want[1] {
		t.Fatalf("labels = %#v, want %#v -- numbering restarts per row, not per episode", labels, want)
	}
}

// TestBuildJDOfflineActionsBoundsTheButtonsPerRow pins the canvas rule that a notification is not
// a log. An anime blocked across a whole season can carry dozens of links; a row that grew a
// button for every one of them would be unusable, so the count is capped.
func TestBuildJDOfflineActionsBoundsTheButtonsPerRow(t *testing.T) {
	t.Parallel()

	links := make([]string, 0, 12)
	for i := range 12 {
		links = append(links, "https://hoster.example/"+string(rune('a'+i)))
	}

	actions := buildJDOfflineActions([]animeRunOutcome{{animeID: "anime-7", manualLinks: []ManualLink{{Episode: 1, Links: links}}}})

	copies := 0
	for _, action := range actions {
		if action.Intent == "clipboard.copy" {
			copies++
		}
	}
	if copies != 5 {
		t.Fatalf("copy tokens = %d, want the per-row bound of 5", copies)
	}
}

// TestBuildJDOfflineActionsSkipsWhatCannotBeAddressed pins the two guards. An outcome with no
// anime id has no row for a token to bind to, and an empty link has nothing to put on a
// clipboard -- both would produce a button that refuses the moment it is pressed.
func TestBuildJDOfflineActionsSkipsWhatCannotBeAddressed(t *testing.T) {
	t.Parallel()

	actions := buildJDOfflineActions([]animeRunOutcome{
		{animeID: "", manualLinks: []ManualLink{{Episode: 1, Links: []string{"https://hoster.example/ep1"}}}},
		{animeID: "anime-9", manualLinks: []ManualLink{{Episode: 2, Links: []string{"", "https://hoster.example/ep2"}}}},
		{animeID: "anime-ok", failed: true},
	})

	var copies []string
	for _, action := range actions {
		if action.Intent == "clipboard.copy" {
			copies = append(copies, action.RowRef+"|"+action.Label+"|"+action.Args["text"])
		}
	}
	if len(copies) != 1 {
		t.Fatalf("copy tokens = %#v, want only the one addressable link", copies)
	}
	if copies[0] != "anime-9|Copy hoster 1|https://hoster.example/ep2" {
		t.Fatalf("copy token = %q, want the empty link skipped and the numbering to start at 1", copies[0])
	}
}

// TestBuildJDOfflineActionsFreezesArgsPerToken pins that no two copy tokens share one Args map. A
// shared map would let one link be rewritten through another's token -- the exact immutability
// the PendingIntent model exists to provide.
func TestBuildJDOfflineActionsFreezesArgsPerToken(t *testing.T) {
	t.Parallel()

	actions := buildJDOfflineActions([]animeRunOutcome{{
		animeID:     "anime-7",
		manualLinks: []ManualLink{{Episode: 1, Links: []string{"https://one.example", "https://two.example"}}},
	}})

	var copies []int
	for i, action := range actions {
		if action.Intent == "clipboard.copy" {
			copies = append(copies, i)
		}
	}
	actions[copies[0]].Args["text"] = "rewritten"
	if got := actions[copies[1]].Args["text"]; !strings.HasPrefix(got, "https://two.example") {
		t.Fatalf("second token's text = %q, want it untouched by a write through the first", got)
	}
}

package download

import (
	"testing"

	"autoreas-bridge/internal/notification"
)

// TestBuildRunDetailRowsNamesFailedAndManualAnimesAheadOfTheQuietGroup is the mandatory group-
// boundary mutation target: an off-by-one in what the summary row heads must fail this test.
// Two uneventful animes (checked, with nothing new to fetch) must sit under exactly one summary
// row with CollapsedCount == 2, while the failed and manual animes each keep their own row above
// it.
//
// This test used to require exactly 3 rows, because the two uneventful animes were counted and
// then DISCARDED -- their ids and names never reached the record. That is the defect this slice
// removes, so the expectation moved from 3 to 5 deliberately.
func TestBuildRunDetailRowsNamesFailedAndManualAnimesAheadOfTheQuietGroup(t *testing.T) {
	t.Parallel()

	outcomes := []animeRunOutcome{
		{animeID: "anime-ok-1", animeName: "OK Anime One", checked: true, upToDate: true},
		{animeID: "anime-ok-2", animeName: "OK Anime Two", checked: true, upToDate: true},
		{animeID: "anime-failed", animeName: "Failed Anime", failed: true, episodesFailed: 2, failureKind: FailureKindHosterDown},
		{animeID: "anime-manual", animeName: "Manual Anime", manualLinks: []ManualLink{{Anime: "Manual Anime", Episode: 3}}},
	}

	rows := buildRunDetailRows(outcomes)

	if len(rows) != 5 {
		t.Fatalf("rows = %#v, want exactly 5 (1 failed + 1 manual + 1 summary + the 2 anime it heads) -- an off-by-one here must fail this test", rows)
	}
	requireRowsName(t, rows, "anime-ok-1", "anime-ok-2")

	var failedRow, manualRow, collapsedRow *notification.DetailItem
	for i := range rows {
		row := &rows[i]
		switch {
		case row.CollapsedCount > 0:
			collapsedRow = row
		case row.RefID == "anime-failed":
			failedRow = row
		case row.RefID == "anime-manual":
			manualRow = row
		}
	}

	if failedRow == nil {
		t.Fatal("no row for the failed anime")
	}
	if failedRow.Name != "Failed Anime" || failedRow.Status != "failed" {
		t.Fatalf("failed row = %#v, want Name=%q Status=%q", failedRow, "Failed Anime", "failed")
	}

	if manualRow == nil {
		t.Fatal("no row for the manual-link anime")
	}
	if manualRow.Name != "Manual Anime" || manualRow.Status != "manual" {
		t.Fatalf("manual row = %#v, want Name=%q Status=%q", manualRow, "Manual Anime", "manual")
	}
	if manualRow.Detail != "Manual Anime (ep 3)" {
		t.Fatalf("manual row Detail = %q, want %q -- a single manual link still has to be named", manualRow.Detail, "Manual Anime (ep 3)")
	}

	if collapsedRow == nil {
		t.Fatal("no collapsed summary row for the 2 uneventful animes")
	}
	if collapsedRow.CollapsedCount != 2 {
		t.Fatalf("collapsedRow.CollapsedCount = %d, want exactly 2", collapsedRow.CollapsedCount)
	}
}

// TestBuildRunDetailRowsReturnsNilForAnEmptyOutcomeSlice pins the only case that must produce
// zero rows: an empty outcome slice has nothing to name and nothing to collapse either.
func TestBuildRunDetailRowsReturnsNilForAnEmptyOutcomeSlice(t *testing.T) {
	t.Parallel()

	if rows := buildRunDetailRows(nil); rows != nil {
		t.Fatalf("rows = %#v, want nil for an empty outcome slice", rows)
	}
}

// TestBuildRunDetailRowsHeadsExactlyOneUneventfulAnimeWithASummaryRow pins the group threshold
// at its tightest boundary: a `> 1` mutant (emitting no summary row when there is only ONE quiet
// anime under it) would survive against
// TestBuildRunDetailRowsNamesFailedAndManualAnimesAheadOfTheQuietGroup above, because that
// test's 2 quiet animes stay > 1 either way -- this is the test that actually pins the `> 0`
// boundary, confirmed by hand-mutation before it existed.
func TestBuildRunDetailRowsHeadsExactlyOneUneventfulAnimeWithASummaryRow(t *testing.T) {
	t.Parallel()

	outcomes := []animeRunOutcome{
		{animeID: "anime-failed", animeName: "Failed Anime", failed: true, failureKind: FailureKindHosterDown},
		{animeID: "anime-ok", animeName: "OK Anime", checked: true, upToDate: true},
	}

	rows := buildRunDetailRows(outcomes)

	if len(rows) != 3 {
		t.Fatalf("rows = %#v, want exactly 3 (1 failed + 1 summary + the single quiet anime it heads)", rows)
	}

	var collapsedRow *notification.DetailItem
	for i := range rows {
		if rows[i].CollapsedCount > 0 {
			collapsedRow = &rows[i]
		}
	}
	if collapsedRow == nil {
		t.Fatal("no summary row for the single uneventful anime -- a `> 1` boundary mutant must fail this test")
	}
	if collapsedRow.CollapsedCount != 1 {
		t.Fatalf("collapsedRow.CollapsedCount = %d, want exactly 1", collapsedRow.CollapsedCount)
	}
	// The sentence has its own boundary at one: the heading must speak for the anime it lists,
	// not report it as an anime the record could not carry.
	if collapsedRow.Detail != "1 anime finished without incident" {
		t.Fatalf("collapsedRow.Detail = %q, want %q", collapsedRow.Detail, "1 anime finished without incident")
	}
	if rows[2].RefID != "anime-ok" || rows[2].Name != "OK Anime" {
		t.Fatalf("rows[2] = %#v, want the quiet anime named under its own heading", rows[2])
	}
}

// TestBuildRunDetailRowsGivesAnAnimeThatDownloadedEpisodesItsOwnRow pins the rule the collapse
// used to get backwards. An anime that actually fetched episodes is the eventful one -- folding
// it away left a fully successful run with nothing but a trailing summary line, which is what
// made the detail pane read as empty. Only "checked and there was nothing new", "already
// current" and "skipped" go under the quiet heading -- and now they go there NAMED.
func TestBuildRunDetailRowsGivesAnAnimeThatDownloadedEpisodesItsOwnRow(t *testing.T) {
	t.Parallel()

	outcomes := []animeRunOutcome{
		{
			animeID: "anime-downloaded", animeName: "Tensei shitara Slime Datta Ken 4th Season",
			checked: true, episodesFound: 3, episodesDownloaded: 3,
			firstEpisodeDownloaded: 14, lastEpisodeDownloaded: 16,
		},
		{animeID: "anime-current", animeName: "Current Anime", checked: true, upToDate: true},
		{animeID: "anime-skipped", animeName: "Skipped Anime", skipped: true},
	}

	rows := buildRunDetailRows(outcomes)

	if len(rows) != 4 {
		t.Fatalf("rows = %#v, want exactly 4 (the downloaded anime + 1 summary + the 2 quiet anime it heads)", rows)
	}
	if rows[0].RefType != "anime" || rows[0].RefID != "anime-downloaded" {
		t.Fatalf("rows[0] = %#v, want the downloaded anime referenced as an anime row", rows[0])
	}
	if rows[0].Name != "Tensei shitara Slime Datta Ken 4th Season" || rows[0].Status != "downloaded" {
		t.Fatalf("rows[0] = %#v, want Name=%q Status=%q", rows[0], "Tensei shitara Slime Datta Ken 4th Season", "downloaded")
	}
	if rows[0].Detail != "Episodes 14-16 -- ready to watch" {
		t.Fatalf("rows[0].Detail = %q, want %q", rows[0].Detail, "Episodes 14-16 -- ready to watch")
	}
	if rows[1].CollapsedCount != 2 {
		t.Fatalf("rows[1].CollapsedCount = %d, want exactly 2 (the up-to-date and the skipped anime)", rows[1].CollapsedCount)
	}
	if rows[2].RefID != "anime-current" || rows[2].Status != "up to date" {
		t.Fatalf("rows[2] = %#v, want the up-to-date anime named, not counted away", rows[2])
	}
	if rows[3].RefID != "anime-skipped" || rows[3].Status != "skipped" {
		t.Fatalf("rows[3] = %#v, want the skipped anime named, not counted away", rows[3])
	}
}

// TestBuildRunDetailRowsReportsAttentionOverSuccessForAnAnimeThatDownloadedThenFailed pins the
// precedence between the two eventful reasons. An anime can fetch two episodes and then lose the
// third on every hoster; the row has one status word, and it has to be the one that needs a
// human.
func TestBuildRunDetailRowsReportsAttentionOverSuccessForAnAnimeThatDownloadedThenFailed(t *testing.T) {
	t.Parallel()

	rows := buildRunDetailRows([]animeRunOutcome{{
		animeID: "anime-mixed", animeName: "Mixed Anime", checked: true,
		episodesDownloaded: 2, firstEpisodeDownloaded: 1, lastEpisodeDownloaded: 2,
		episodesFailed: 1, failed: true, failureKind: FailureKindHosterDown,
	}})

	if len(rows) != 1 {
		t.Fatalf("rows = %#v, want exactly 1", rows)
	}
	if rows[0].Status != "failed" {
		t.Fatalf("rows[0].Status = %q, want %q -- the failure outranks the two episodes that landed", rows[0].Status, "failed")
	}
}

// TestOutcomeRowDetailNamesTheEpisodesADownloadActuallyGot covers the shapes the detail line has
// to distinguish: one episode, a contiguous run of them, and a set the recorded first/last
// cannot describe as a range. The last must state the count rather than invent a range that
// never happened.
func TestOutcomeRowDetailNamesTheEpisodesADownloadActuallyGot(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		outcome animeRunOutcome
		want    string
	}{
		{
			name:    "one episode is named by its own number",
			outcome: animeRunOutcome{episodesDownloaded: 1, firstEpisodeDownloaded: 5, lastEpisodeDownloaded: 5},
			want:    "Episode 5 -- ready to watch",
		},
		{
			name:    "a contiguous run is named as a range",
			outcome: animeRunOutcome{episodesDownloaded: 3, firstEpisodeDownloaded: 14, lastEpisodeDownloaded: 16},
			want:    "Episodes 14-16 -- ready to watch",
		},
		{
			name:    "a gap falls back to the count that is actually true",
			outcome: animeRunOutcome{episodesDownloaded: 2, firstEpisodeDownloaded: 4, lastEpisodeDownloaded: 12},
			want:    "2 episode(s) downloaded -- ready to watch",
		},
		{
			name:    "no recorded episode numbers fall back to the count too",
			outcome: animeRunOutcome{episodesDownloaded: 4},
			want:    "4 episode(s) downloaded -- ready to watch",
		},
		{
			// The zero-value outcome is the one that makes the first-episode guard provable:
			// drop it and 0-0+1 == 1 reads as a contiguous single episode, so the row claims
			// "Episode 0" -- a number no anime has.
			name:    "one episode with no recorded number never claims episode zero",
			outcome: animeRunOutcome{episodesDownloaded: 1},
			want:    "1 episode(s) downloaded -- ready to watch",
		},
		{
			// Same for the single-episode branch: without the contiguity check it would name
			// episode 4 while the run actually got one episode somewhere between 4 and 12.
			name:    "one episode that cannot be bracketed falls back to the count",
			outcome: animeRunOutcome{episodesDownloaded: 1, firstEpisodeDownloaded: 4, lastEpisodeDownloaded: 12},
			want:    "1 episode(s) downloaded -- ready to watch",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := outcomeRowDetail(testCase.outcome); got != testCase.want {
				t.Fatalf("outcomeRowDetail() = %q, want %q", got, testCase.want)
			}
		})
	}
}

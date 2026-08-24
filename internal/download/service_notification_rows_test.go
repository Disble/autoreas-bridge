package download

import (
	"testing"

	"autoreas-bridge/internal/notification"
)

// TestBuildRunDetailRowsNamesFailedAndManualAnimesAndCollapsesTheRest is the mandatory collapse-
// boundary mutation target: an off-by-one in what gets folded into the summary row must fail
// this test. Two uneventful animes (neither failed nor carrying a manual link) must fold into
// exactly one trailing row with CollapsedCount == 2, while the failed and manual animes each keep
// their own row.
func TestBuildRunDetailRowsNamesFailedAndManualAnimesAndCollapsesTheRest(t *testing.T) {
	t.Parallel()

	outcomes := []animeRunOutcome{
		{animeID: "anime-ok-1", animeName: "OK Anime One", episodesDownloaded: 1},
		{animeID: "anime-ok-2", animeName: "OK Anime Two", episodesDownloaded: 1},
		{animeID: "anime-failed", animeName: "Failed Anime", failed: true, episodesFailed: 2, failureKind: FailureKindHosterDown},
		{animeID: "anime-manual", animeName: "Manual Anime", manualLinks: []ManualLink{{Anime: "Manual Anime", Episode: 3}}},
	}

	rows := buildRunDetailRows(outcomes)

	if len(rows) != 3 {
		t.Fatalf("rows = %#v, want exactly 3 (1 failed + 1 manual + 1 collapsed) -- an off-by-one here must fail this test", rows)
	}

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

// TestBuildRunDetailRowsCollapsesExactlyOneUneventfulAnimeIntoASummaryRow pins the collapse
// threshold at its tightest boundary: a `CollapsedCount > 1` mutant (dropping the summary row
// when there is only ONE uneventful anime to fold) would survive against
// TestBuildRunDetailRowsNamesFailedAndManualAnimesAndCollapsesTheRest above, because that test's
// 2 uneventful animes stay > 1 either way -- this is the test that actually pins the `> 0`
// boundary, confirmed by hand-mutation (`collapsedCount > 0` -> `collapsedCount > 1`) before this
// test existed.
func TestBuildRunDetailRowsCollapsesExactlyOneUneventfulAnimeIntoASummaryRow(t *testing.T) {
	t.Parallel()

	outcomes := []animeRunOutcome{
		{animeID: "anime-failed", animeName: "Failed Anime", failed: true, failureKind: FailureKindHosterDown},
		{animeID: "anime-ok", animeName: "OK Anime", episodesDownloaded: 1},
	}

	rows := buildRunDetailRows(outcomes)

	if len(rows) != 2 {
		t.Fatalf("rows = %#v, want exactly 2 (1 failed + 1 collapsed summary for the single uneventful anime)", rows)
	}

	var collapsedRow *notification.DetailItem
	for i := range rows {
		if rows[i].CollapsedCount > 0 {
			collapsedRow = &rows[i]
		}
	}
	if collapsedRow == nil {
		t.Fatal("no collapsed summary row for the single uneventful anime -- a `> 1` boundary mutant must fail this test")
	}
	if collapsedRow.CollapsedCount != 1 {
		t.Fatalf("collapsedRow.CollapsedCount = %d, want exactly 1", collapsedRow.CollapsedCount)
	}
}

package download

import (
	"fmt"
	"strings"
	"testing"

	"autoreas-bridge/internal/notification"
)

// uneventfulOutcomes builds count uneventful anime outcomes with distinct ids and names.
func uneventfulOutcomes(count int) []animeRunOutcome {
	outcomes := make([]animeRunOutcome, 0, count)
	for i := range count {
		outcomes = append(outcomes, animeRunOutcome{
			animeID:   fmt.Sprintf("anime-quiet-%d", i),
			animeName: fmt.Sprintf("Quiet Anime %d", i),
			checked:   true,
			upToDate:  true,
		})
	}
	return outcomes
}

// failedOutcomes builds count failed anime outcomes with distinct ids and names.
func failedOutcomes(count int) []animeRunOutcome {
	outcomes := make([]animeRunOutcome, 0, count)
	for i := range count {
		outcomes = append(outcomes, animeRunOutcome{
			animeID:     fmt.Sprintf("anime-broken-%d", i),
			animeName:   fmt.Sprintf("Broken Anime %d", i),
			checked:     true,
			failed:      true,
			failureKind: FailureKindHosterDown,
		})
	}
	return outcomes
}

// requireRowsName fails unless every id given has a row of its own. A quiet anime keeping its
// identity is the whole point of the group layout, so several tests need the same assertion.
func requireRowsName(t *testing.T, rows []notification.DetailItem, ids ...string) {
	t.Helper()
	for _, id := range ids {
		if _, found := rowByRefID(rows, id); !found {
			t.Fatalf("no row for %q -- a quiet anime must keep its identity, never be counted away: %#v", id, rows)
		}
	}
}

// summaryRowIndex returns the index of the record's single summary row, or -1.
func summaryRowIndex(rows []notification.DetailItem) int {
	for i := range rows {
		if rows[i].CollapsedCount > 0 {
			return i
		}
	}
	return -1
}

// TestBuildRunDetailRowsKeepsEveryUneventfulAnimeAsItsOwnRow is the regression this slice exists
// for. An uneventful anime used to be counted and then thrown away -- its id and name never
// reached the record -- and the summary line sent the reader to Downloads, which persists only
// aggregate counters and has no per-anime breakdown to show. Nothing may be discarded now.
func TestBuildRunDetailRowsKeepsEveryUneventfulAnimeAsItsOwnRow(t *testing.T) {
	t.Parallel()

	rows := buildRunDetailRows(uneventfulOutcomes(3))

	named := map[string]notification.DetailItem{}
	for _, row := range rows {
		if row.RefID != "" {
			named[row.RefID] = row
		}
	}
	if len(named) != 3 {
		t.Fatalf("rows = %#v, want one identified row per uneventful anime, got %d", rows, len(named))
	}
	for i := range 3 {
		id := fmt.Sprintf("anime-quiet-%d", i)
		row, ok := named[id]
		if !ok {
			t.Fatalf("no row for %q -- an uneventful anime must not be discarded: %#v", id, rows)
		}
		if row.RefType != "anime" || row.Name != fmt.Sprintf("Quiet Anime %d", i) {
			t.Fatalf("row for %q = %#v, want it to carry its real ref type and name", id, row)
		}
	}
}

// TestBuildRunDetailRowsPutsTheSummaryRowAheadOfTheGroupItHeads pins the layout contract. The
// summary row is no longer a tombstone for deleted anime: it is a heading over rows that are
// right there. A frontend that has not caught up renders a collapsedCount row as one dashed line
// and nothing else, so trailing it after the group would read as "and N MORE, elsewhere" -- the
// exact claim this change removes.
func TestBuildRunDetailRowsPutsTheSummaryRowAheadOfTheGroupItHeads(t *testing.T) {
	t.Parallel()

	rows := buildRunDetailRows(append(failedOutcomes(1), uneventfulOutcomes(2)...))

	if len(rows) != 4 {
		t.Fatalf("rows = %#v, want exactly 4 (1 failed + 1 summary + the 2 anime it heads)", rows)
	}
	if rows[0].RefID != "anime-broken-0" {
		t.Fatalf("rows[0] = %#v, want the anime that needs attention named first", rows[0])
	}
	if rows[1].CollapsedCount != 2 {
		t.Fatalf("rows[1] = %#v, want the summary row heading its 2 rows with CollapsedCount 2", rows[1])
	}
	if rows[1].RefID != "" || rows[1].Name != "" {
		t.Fatalf("rows[1] = %#v, want the summary row to name nothing of its own", rows[1])
	}
	if rows[1].Detail != "2 anime finished without incident" {
		t.Fatalf("rows[1].Detail = %q, want %q", rows[1].Detail, "2 anime finished without incident")
	}
	if rows[2].RefID != "anime-quiet-0" || rows[3].RefID != "anime-quiet-1" {
		t.Fatalf("rows[2:] = %#v, want the headed group immediately after the summary row", rows[2:])
	}
}

// TestBuildRunDetailRowsEmitsNoSummaryRowWhenNothingIsUneventful pins the zero boundary: a run
// where every anime had something to report must carry no heading at all, because a summary row
// with CollapsedCount 0 renders as an ordinary nameless row -- a cover placeholder with no title.
func TestBuildRunDetailRowsEmitsNoSummaryRowWhenNothingIsUneventful(t *testing.T) {
	t.Parallel()

	rows := buildRunDetailRows(failedOutcomes(2))

	if len(rows) != 2 {
		t.Fatalf("rows = %#v, want exactly 2 -- no heading over an empty group", rows)
	}
	if index := summaryRowIndex(rows); index != -1 {
		t.Fatalf("rows[%d] = %#v, want no summary row at all", index, rows[index])
	}
}

// TestBuildRunDetailRowsBoundsHowManyAnimeOneRecordNames pins the cap and, more importantly,
// that exceeding it is REPORTED rather than silently swallowed. 60 uneventful anime must yield
// 50 named rows under a heading that stands for all 60 and says 10 are missing.
func TestBuildRunDetailRowsBoundsHowManyAnimeOneRecordNames(t *testing.T) {
	t.Parallel()

	rows := buildRunDetailRows(uneventfulOutcomes(60))

	if len(rows) != 51 {
		t.Fatalf("len(rows) = %d, want exactly 51 (50 named anime + 1 summary row)", len(rows))
	}
	summary := rows[0]
	if summary.CollapsedCount != 60 {
		t.Fatalf("summary.CollapsedCount = %d, want 60 -- it stands for every anime, listed or not", summary.CollapsedCount)
	}
	if !strings.Contains(summary.Detail, "50 anime finished without incident") {
		t.Fatalf("summary.Detail = %q, want it to name the 50 rows it heads", summary.Detail)
	}
	if !strings.Contains(summary.Detail, "10 more") {
		t.Fatalf("summary.Detail = %q, want it to say 10 anime are not listed", summary.Detail)
	}
}

// TestBuildRunDetailRowsNamesEveryAnimeWhenTheRunFitsExactlyInTheCap pins the other side of that
// boundary: at exactly the cap nothing is missing, so the heading must not claim anything is.
func TestBuildRunDetailRowsNamesEveryAnimeWhenTheRunFitsExactlyInTheCap(t *testing.T) {
	t.Parallel()

	rows := buildRunDetailRows(uneventfulOutcomes(50))

	if len(rows) != 51 {
		t.Fatalf("len(rows) = %d, want exactly 51 (50 named anime + 1 summary row)", len(rows))
	}
	if rows[0].Detail != "50 anime finished without incident" {
		t.Fatalf("summary.Detail = %q, want no missing-anime clause at exactly the cap", rows[0].Detail)
	}
	if rows[0].CollapsedCount != 50 {
		t.Fatalf("summary.CollapsedCount = %d, want 50", rows[0].CollapsedCount)
	}
}

// TestBuildRunDetailRowsSpendsTheCapOnTheAnimeThatNeedAttentionFirst pins the allocation rule.
// A row the user must act on is never dropped to make room for one that finished quietly, and
// what does not fit is still counted in the summary row.
func TestBuildRunDetailRowsSpendsTheCapOnTheAnimeThatNeedAttentionFirst(t *testing.T) {
	t.Parallel()

	rows := buildRunDetailRows(append(failedOutcomes(51), uneventfulOutcomes(5)...))

	if len(rows) != 51 {
		t.Fatalf("len(rows) = %d, want exactly 51 (50 failed anime + 1 summary row)", len(rows))
	}
	for i := range 50 {
		if rows[i].Status != "failed" {
			t.Fatalf("rows[%d] = %#v, want the cap spent on the anime that failed", i, rows[i])
		}
	}
	summary := rows[50]
	if summary.CollapsedCount != 6 {
		t.Fatalf("summary.CollapsedCount = %d, want 6 (1 failed + 5 quiet anime the record cannot carry)", summary.CollapsedCount)
	}
	if !strings.Contains(summary.Detail, "6 anime this run touched are not listed") {
		t.Fatalf("summary.Detail = %q, want it to report all 6 missing anime", summary.Detail)
	}
}

// TestOutcomeRowVocabularyForAnAnimeThatFinishedQuietly pins the words a quiet anime gets. It
// must not borrow the failure vocabulary: "failed", "manual" and "downloaded" all claim
// something that did not happen.
func TestOutcomeRowVocabularyForAnAnimeThatFinishedQuietly(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		outcome    animeRunOutcome
		wantStatus string
		wantDetail string
	}{
		{
			name:       "an anime the run never checked is skipped",
			outcome:    animeRunOutcome{skipped: true},
			wantStatus: "skipped",
			wantDetail: "Skipped -- it was not ready to download on this run",
		},
		{
			name:       "an anime with nothing newer online is up to date",
			outcome:    animeRunOutcome{checked: true, upToDate: true},
			wantStatus: "up to date",
			wantDetail: "Already has every episode that is out -- nothing new to download",
		},
		{
			name:       "an anime that found episodes and got none of them says so",
			outcome:    animeRunOutcome{checked: true, episodesFound: 3},
			wantStatus: "checked",
			wantDetail: "3 new episode(s) found, none downloaded",
		},
		{
			name:       "an outcome that reports nothing at all still reads honestly",
			outcome:    animeRunOutcome{checked: true},
			wantStatus: "checked",
			wantDetail: "Checked -- nothing new to download",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := outcomeRowStatus(testCase.outcome); got != testCase.wantStatus {
				t.Fatalf("outcomeRowStatus() = %q, want %q", got, testCase.wantStatus)
			}
			if got := outcomeRowDetail(testCase.outcome); got != testCase.wantDetail {
				t.Fatalf("outcomeRowDetail() = %q, want %q", got, testCase.wantDetail)
			}
		})
	}
}

// TestBuildRunDetailRowsNamesAnAnimeThatFoundEpisodesAndGotNoneOutsideTheQuietGroup pins which
// outcomes the heading is allowed to speak for. "Finished without incident" is false for an
// anime that found three episodes and downloaded none -- a stopped run leaves exactly that --
// so it keeps a row above the heading rather than inside its group.
func TestBuildRunDetailRowsNamesAnAnimeThatFoundEpisodesAndGotNoneOutsideTheQuietGroup(t *testing.T) {
	t.Parallel()

	rows := buildRunDetailRows([]animeRunOutcome{
		{animeID: "anime-empty-handed", animeName: "Empty Handed", checked: true, episodesFound: 3},
		{animeID: "anime-quiet", animeName: "Quiet", checked: true, upToDate: true},
	})

	if len(rows) != 3 {
		t.Fatalf("rows = %#v, want exactly 3 (the empty-handed anime + 1 summary + the quiet one)", rows)
	}
	if rows[0].RefID != "anime-empty-handed" {
		t.Fatalf("rows[0] = %#v, want the empty-handed anime named above the heading", rows[0])
	}
	if rows[1].CollapsedCount != 1 {
		t.Fatalf("rows[1] = %#v, want the heading to stand for the quiet anime alone", rows[1])
	}
}

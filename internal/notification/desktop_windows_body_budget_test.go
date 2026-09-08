//go:build windows

package notification

import (
	"fmt"
	"strings"
	"testing"
	"unicode/utf8"
)

// observedWindowsBodyCeiling is the widest folded body one of the user's real Action Center
// captures rendered IN FULL: a 40-character body plus two 76/77-character rows, separated by
// line breaks. It is the floor the adapter's budget must clear -- a bound tighter than this
// would drop rows Windows was demonstrably willing to show.
//
// Written here as a literal for the same reason the download body tests are: pinning the
// production constant against itself proves nothing.
const observedWindowsBodyCeiling = 195

// queuedRows builds count run-started rows with names long enough that a handful of them blow
// past any sane body budget.
func queuedRows(count int) []DetailItem {
	rows := make([]DetailItem, 0, count)
	for index := range count {
		rows = append(rows, DetailItem{
			RefType: "anime",
			RefID:   fmt.Sprintf("a-%d", index),
			Name:    fmt.Sprintf("Nijuuseiki Denki Mokuroku %d", index),
			Status:  "queued",
			Detail:  "waiting for this run to reach it",
		})
	}
	return rows
}

// TestWindowsToastBoundsTheBodyItFolds is the gap: desktopToastBody folded EVERY row, and
// buildRunDetailRows emits up to fifty of them. A scheduled run therefore pushed a ~2500
// character body into a single <text> element and let Windows decide where to cut.
//
// The budget is in runes, not bytes: the anime that exposed this ("Eureka·Evrika") carries a
// multi-byte character, and a byte-counted budget would fold fewer rows for it than for an
// ASCII-named anime of the same visible width.
func TestWindowsToastBoundsTheBodyItFolds(t *testing.T) {
	t.Parallel()

	body := desktopToastBody(Notification{
		Body: "Download check started (scheduled) -- 50 anime queued.",
		Rows: queuedRows(50),
	})

	if spent := utf8.RuneCountInString(body); spent > 260 {
		t.Fatalf("folded body spends %d runes, want it bounded:\n%s", spent, body)
	}
}

// TestWindowsToastKeepsWhatWindowsDemonstrablyShows is the other side of that bound. A budget
// set too low is not a safe default -- it deletes rows the medium would have rendered.
func TestWindowsToastKeepsWhatWindowsDemonstrablyShows(t *testing.T) {
	t.Parallel()

	body := desktopToastBody(Notification{
		Body: "Download check started (missed_startup).",
		Rows: []DetailItem{
			{RefType: "anime", RefID: "a-1", Name: "Nijuuseiki Denki Mokuroku: Eureka Evrika", Status: "queued", Detail: "waiting for this run to reach it"},
			{RefType: "anime", RefID: "a-2", Name: "Tensei shitara Slime Datta Ken 4th Season", Status: "queued", Detail: "waiting for this run to reach it"},
		},
	})

	for _, want := range []string{"Nijuuseiki De", "Tensei shitar"} {
		if !strings.Contains(body, want) {
			t.Fatalf("the row naming %q did not survive the fold:\n%s", want, body)
		}
	}
	// Both rows arrive AND the fold now costs well under what that capture spent, because each
	// name was shortened to keep its row on one rendered line. The bound below is what makes the
	// two assertions say something together: without it, dropping a row would also satisfy the
	// budget, and this test would pass for the wrong reason.
	if spent := utf8.RuneCountInString(body); spent >= observedWindowsBodyCeiling {
		t.Fatalf("the fold spends %d runes, want it under the %d that capture needed:\n%s", spent, observedWindowsBodyCeiling, body)
	}
}

// TestWindowsToastNeverSpendsTheBudgetOnItsOwnBody: the body's first line is the ONE thing that
// has to arrive, because it is where every count now lives. The budget bounds how many rows join
// it -- it never edits the sentence the producer wrote, however long that sentence is.
func TestWindowsToastNeverSpendsTheBudgetOnItsOwnBody(t *testing.T) {
	t.Parallel()

	long := strings.Repeat("x", 400)

	body := desktopToastBody(Notification{
		Body: long,
		Rows: []DetailItem{{RefType: "anime", RefID: "a-1", Name: "Frieren", Status: "queued", Detail: "waiting for this run to reach it"}},
	})

	if !strings.HasPrefix(body, long) {
		t.Fatalf("the adapter truncated the producer's own sentence:\n%s", body)
	}
}

// TestWindowsToastSpendsExactlyItsBudget pins BOTH sides of the boundary, which is the only way
// to pin it at all: a fixture that only fits leaves `> budget` and `>= budget` indistinguishable,
// and one that only overflows leaves a budget of 220 and one of 221 indistinguishable. The pair
// says the number is 220 and that a row landing on it is kept.
//
// Every length here is a literal for the same reason the download body tests are literals -- a
// case computed from desktopToastBodyBudget would follow that constant wherever it drifted and
// report success from either side of the boundary.
//
// The rows are deliberately NAMELESS, the shape a summary row has. A named row is shortened to
// the one-line bound before the budget ever sees it, which would make the two mechanisms fight
// over one fixture and pin neither; a nameless row's detail passes through whole, so its length
// is the length the budget weighs.
//
// A 100-rune body plus a 119-rune detail joins to exactly 220; 120 joins to 221.
func TestWindowsToastSpendsExactlyItsBudget(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name       string
		detailRune int
		wantKept   bool
		wantRunes  int
	}{
		{name: "a row landing on the last rune of the budget is kept", detailRune: 119, wantKept: true, wantRunes: 220},
		{name: "a row one rune past it is not", detailRune: 120, wantKept: false, wantRunes: 100},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			detail := strings.Repeat("D", testCase.detailRune)
			body := desktopToastBody(Notification{
				Body: strings.Repeat("B", 100),
				Rows: []DetailItem{{Status: "ok", Detail: detail, CollapsedCount: 3}},
			})

			if got := utf8.RuneCountInString(body); got != testCase.wantRunes {
				t.Fatalf("folded body spends %d runes, want %d:\n%s", got, testCase.wantRunes, body)
			}
			if strings.Contains(body, detail) != testCase.wantKept {
				t.Fatalf("row kept = %t, want %t:\n%s", !testCase.wantKept, testCase.wantKept, body)
			}
		})
	}
}

// TestWindowsToastFoldsASummaryRowStandingForOneAnime keeps the summary row's sentence covered
// now that the adapter has no branch dedicated to it.
//
// runDetailSummaryRow emits a row with a Detail, a CollapsedCount and NO name, and the fold
// reaches it through desktopToastRowLine's nameless path rather than through a collapsed-row
// special case. That path is the one thing standing between a run's "N anime finished without
// incident" line and a blank.
func TestWindowsToastFoldsASummaryRowStandingForOneAnime(t *testing.T) {
	t.Parallel()

	body := desktopToastBody(Notification{
		Body: "3 episode(s) downloaded.",
		Rows: []DetailItem{
			{Status: "ok", Detail: "1 anime finished without incident", CollapsedCount: 1},
		},
	})

	if !strings.Contains(body, "1 anime finished without incident") {
		t.Fatalf("a summary row standing for one anime lost its sentence:\n%s", body)
	}
}

// TestWindowsToastStopsAtTheFirstRowItCannotFit pins the ORDER. Rows arrive worst-first --
// buildRunDetailRows spends its allocation on the anime that need attention before the quiet
// ones -- so skipping over a row that does not fit to pick up a shorter one behind it would
// promote a quiet anime over a failed one.
//
// Nameless rows again, for the same reason the budget boundary uses them: a named row is
// shortened to the one-line bound long before it could overrun the budget, so a row big enough
// to be refused has to carry its length in the detail.
func TestWindowsToastStopsAtTheFirstRowItCannotFit(t *testing.T) {
	t.Parallel()

	body := desktopToastBody(Notification{
		Body: "2 of 3 animes failed to download.",
		Rows: []DetailItem{
			{Status: "ok", Detail: strings.Repeat("L", 190), CollapsedCount: 2},
			{Status: "ok", Detail: "Short row", CollapsedCount: 1},
		},
	})

	if strings.Contains(body, "Short row") {
		t.Fatalf("a later row jumped ahead of one the budget refused:\n%s", body)
	}
	if strings.Contains(body, "LLL") {
		t.Fatalf("the refused row was folded in anyway:\n%s", body)
	}
}

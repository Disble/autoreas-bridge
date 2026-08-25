package download

import (
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

// TestBuildRunStartedRowsNamesEveryAnimeTheRunWillTouch: a run that has begun says WHICH anime it
// is about, which is the whole point of the card. Until now "Download run started" was a sentence
// with no subject.
func TestBuildRunStartedRowsNamesEveryAnimeTheRunWillTouch(t *testing.T) {
	t.Parallel()

	rows := buildRunStartedRows([]contracts.MobileAnime{
		{ID: "anime-1", Name: "Bocchi the Rock"},
		{ID: "anime-2", Name: "Frieren"},
	})

	if len(rows) != 2 {
		t.Fatalf("rows = %#v, want one per anime", rows)
	}
	for i, want := range []struct{ id, name string }{{"anime-1", "Bocchi the Rock"}, {"anime-2", "Frieren"}} {
		if rows[i].RefID != want.id || rows[i].Name != want.name {
			t.Fatalf("row %d = %#v, want %s/%s", i, rows[i], want.id, want.name)
		}
		if rows[i].RefType != "anime" {
			t.Fatalf("row %d RefType = %q, want anime", i, rows[i].RefType)
		}
	}
}

// TestBuildRunStartedRowsClaimsNoOutcome is the honesty guard. The run has not processed anything
// yet, so a row must not borrow the vocabulary a finished run writes -- "downloaded", "failed",
// "up to date" and "checked" each claim something that has not happened.
func TestBuildRunStartedRowsClaimsNoOutcome(t *testing.T) {
	t.Parallel()

	rows := buildRunStartedRows([]contracts.MobileAnime{{ID: "anime-1", Name: "Bocchi the Rock"}})

	for _, forbidden := range []string{"downloaded", "failed", "manual", "up to date", "checked", "skipped"} {
		if rows[0].Status == forbidden {
			t.Fatalf("a started row claims outcome %q before the run has processed anything", forbidden)
		}
	}
	if rows[0].Status != "queued" {
		t.Fatalf("row Status = %q, want queued", rows[0].Status)
	}
}

// TestBuildRunStartedRowsSkipsAnAnimeItCannotAddress: a row with no id addresses no record, and
// the cover lookup the pane runs against it would resolve to nothing.
func TestBuildRunStartedRowsSkipsAnAnimeItCannotAddress(t *testing.T) {
	t.Parallel()

	rows := buildRunStartedRows([]contracts.MobileAnime{
		{Name: "No ID"},
		{ID: "anime-2", Name: "Frieren"},
	})

	if len(rows) != 1 || rows[0].RefID != "anime-2" {
		t.Fatalf("rows = %#v, want only the addressable anime", rows)
	}
}

// TestBuildRunStartedRowsBoundsWhatItNames: a scheduled run can select fifty anime, and a
// notification that lists everything is a log. The overflow collapses into the same summary row
// the finished-run builder already uses.
func TestBuildRunStartedRowsBoundsWhatItNames(t *testing.T) {
	t.Parallel()

	animes := make([]contracts.MobileAnime, 0, 60)
	for i := range 60 {
		animes = append(animes, contracts.MobileAnime{ID: string(rune('a'+i%26)) + string(rune('0'+i/26)), Name: "Anime"})
	}

	rows := buildRunStartedRows(animes)

	named := 0
	collapsed := 0
	for _, row := range rows {
		if row.CollapsedCount > 0 {
			collapsed += row.CollapsedCount
			continue
		}
		named++
	}
	if named != 50 {
		t.Fatalf("named rows = %d, want the same 50 cap the finished-run rows use", named)
	}
	if collapsed != 10 {
		t.Fatalf("collapsed count = %d, want the 10 it could not name", collapsed)
	}
}

// TestBuildRunStartedRowsIsEmptyWhenNothingWasSelected: a run with nothing to do names nothing,
// rather than rendering an empty block.
func TestBuildRunStartedRowsIsEmptyWhenNothingWasSelected(t *testing.T) {
	t.Parallel()

	if rows := buildRunStartedRows(nil); rows != nil {
		t.Fatalf("rows = %#v, want none", rows)
	}
}

// TestStartedRowsCarryNoPerRowToken pins the level split for this kind: the run is in flight, so
// the only sensible verb is to watch it happen, and that is the whole-notification "Open
// Downloads" it already carries. A row-level button here would have nothing to offer.
func TestStartedRowsCarryNoPerRowToken(t *testing.T) {
	t.Parallel()

	for _, action := range runWideActions(kindRunStarted, "run-1") {
		if action.RowRef != "" {
			t.Fatalf("a started notification carries a row-bound token %#v", action)
		}
	}
}

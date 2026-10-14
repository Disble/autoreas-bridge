package episodes_test

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime/episodes"
)

// TestApplyEditsStoresEveryEditorChangeInOneWrite covers the three edits an Editor save carries:
// a manual value replaces any value, a confirmed measured reading never overwrites a manual row,
// and a clear deletes the row. The anime is marked pending once.
func TestApplyEditsStoresEveryEditorChangeInOneWrite(t *testing.T) {
	ctx := context.Background()
	s, clock := openTestStore(t)
	must(t, s.SetManual(ctx, "a", 1, 1000))
	_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 2, DurationMS: 2000}, {Episode: 3, DurationMS: 3000}})
	must(t, err)
	before, err := s.PendingAnnounce(ctx)
	must(t, err)
	must(t, s.ClearPending(ctx, before[0]))
	clock.ms = 9

	changed, err := s.ApplyEdits(ctx, "a", []episodes.Edit{
		{Episode: 1, DurationMS: 1500, Source: episodes.SourceMeasured},
		{Episode: 2, DurationMS: 2500, Source: episodes.SourceManual},
		{Episode: 3, Clear: true},
		{Episode: 4, DurationMS: 4000, Source: episodes.SourceMeasured},
	})
	must(t, err)

	if changed != 3 {
		t.Fatalf("want 3 rows changed (manual kept, manual set, cleared, added), got %d", changed)
	}
	assertRows(t, s, "a", []episodes.Duration{
		row("a", 1, 1000, episodes.SourceManual, 1),
		row("a", 2, 2500, episodes.SourceManual, 9),
		row("a", 4, 4000, episodes.SourceMeasured, 9),
	})
	after, err := s.PendingAnnounce(ctx)
	must(t, err)
	if len(after) != 1 || after[0] != (episodes.Pending{AnimeID: "a", MarkedAtMS: 9}) {
		t.Fatalf("want one pending mark at 9, got %+v", after)
	}
}

// TestApplyEditsValidatesEveryEditBeforeWritingAny proves a bad edit saves nothing.
func TestApplyEditsValidatesEveryEditBeforeWritingAny(t *testing.T) {
	ctx := context.Background()
	for _, tc := range []struct {
		name string
		bad  episodes.Edit
		want error
	}{
		{name: "episode below one", bad: episodes.Edit{Episode: 0, DurationMS: 1, Source: episodes.SourceManual}, want: episodes.ErrInvalidEpisode},
		{name: "no duration", bad: episodes.Edit{Episode: 2, Source: episodes.SourceManual}, want: episodes.ErrInvalidDuration},
		{name: "unknown source", bad: episodes.Edit{Episode: 2, DurationMS: 1, Source: "guess"}, want: episodes.ErrInvalidSource},
		{name: "clear of episode zero", bad: episodes.Edit{Episode: 0, Clear: true}, want: episodes.ErrInvalidEpisode},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, _ := openTestStore(t)

			changed, err := s.ApplyEdits(ctx, "a", []episodes.Edit{
				{Episode: 1, DurationMS: 1000, Source: episodes.SourceManual},
				tc.bad,
			})

			if !errors.Is(err, tc.want) || changed != 0 {
				t.Fatalf("want %v and nothing changed, got %v (%d)", tc.want, err, changed)
			}
			assertRows(t, s, "a", nil)
		})
	}

	s, _ := openTestStore(t)
	if _, err := s.ApplyEdits(ctx, "", []episodes.Edit{{Episode: 1, Clear: true}}); !errors.Is(err, episodes.ErrEmptyAnimeID) {
		t.Fatalf("want ErrEmptyAnimeID, got %v", err)
	}
}

// TestApplyEditsThatChangeNothingMarkNothing proves a no-op save is silent.
func TestApplyEditsThatChangeNothingMarkNothing(t *testing.T) {
	ctx := context.Background()
	s, _ := openTestStore(t)
	must(t, s.SetManual(ctx, "a", 1, 1000))
	before, err := s.PendingAnnounce(ctx)
	must(t, err)
	must(t, s.ClearPending(ctx, before[0]))

	changed, err := s.ApplyEdits(ctx, "a", []episodes.Edit{
		{Episode: 1, DurationMS: 1000, Source: episodes.SourceManual},
		{Episode: 7, Clear: true},
	})
	must(t, err)

	if changed != 0 {
		t.Fatalf("want nothing changed, got %d", changed)
	}
	if after, err := s.PendingAnnounce(ctx); err != nil || len(after) != 0 {
		t.Fatalf("a no-op save must mark nothing, got %+v (%v)", after, err)
	}
}

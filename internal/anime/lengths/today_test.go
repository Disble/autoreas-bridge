package lengths

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// readerStub answers the one Today read from a fixed map and records every read it served.
type readerStub struct {
	durations map[string][]episodes.Duration
	err       error
	asked     [][]string
}

func (r *readerStub) ByAnimeIDs(_ context.Context, animeIDs []string) (map[string][]episodes.Duration, error) {
	r.asked = append(r.asked, animeIDs)
	return r.durations, r.err
}

func TestTodayMarksKeepsOneMarkPerRowInOrderFromOneRead(t *testing.T) {
	t.Parallel()

	reader := &readerStub{durations: map[string][]episodes.Duration{
		"long":  stored(1, 24*time.Minute, 2, 45*time.Minute),
		"plain": stored(1, 24*time.Minute, 2, 24*time.Minute),
	}}
	requests := []Request{
		{AnimeID: "plain", Kind: kindOf(TVKind), Progress: 1},
		{AnimeID: "long", Kind: kindOf(TVKind), Progress: 1},
		{AnimeID: "unmeasured", Kind: kindOf(TVKind), Progress: 1},
	}

	marks := NewToday(reader).TodayMarks(context.Background(), requests)

	want := []*Mark{nil, {Episode: 2, Minutes: 45}, nil}
	if len(marks) != len(want) {
		t.Fatalf("one mark per row: want %d, got %d", len(want), len(marks))
	}
	for i := range want {
		if !equalMark(marks[i], want[i]) {
			t.Errorf("row %d: want %v, got %v", i, want[i], marks[i])
		}
	}
	if len(reader.asked) != 1 {
		t.Fatalf("the day must be read in one query, got %d reads", len(reader.asked))
	}
	if got := reader.asked[0]; len(got) != 3 || got[0] != "plain" || got[1] != "long" || got[2] != "unmeasured" {
		t.Errorf("the read must name every row of the day, got %v", got)
	}
}

func TestTodayMarksOnAFailedReadMarksNothing(t *testing.T) {
	t.Parallel()

	reader := &readerStub{
		durations: map[string][]episodes.Duration{"long": stored(2, 45*time.Minute)},
		err:       errors.New("database is closed"),
	}

	marks := NewToday(reader).TodayMarks(context.Background(),
		[]Request{{AnimeID: "long", Kind: kindOf(TVKind), Progress: 1}})

	if len(marks) != 1 || marks[0] != nil {
		t.Fatalf("a failed read must leave every row unmarked, got %v", marks)
	}
}

func TestTodayMarksOnAnEmptyDayReadsNothing(t *testing.T) {
	t.Parallel()

	reader := &readerStub{}

	marks := NewToday(reader).TodayMarks(context.Background(), nil)

	if len(marks) != 0 {
		t.Fatalf("an empty day has no marks, got %v", marks)
	}
	if len(reader.asked) != 0 {
		t.Errorf("an empty day must not read the store, got %v", reader.asked)
	}
}

// TestTodayMarksReadsTheRealStore proves the adapter against the real store at SQLite: what the
// backfill or the landed recording stored is exactly what Today marks.
func TestTodayMarksReadsTheRealStore(t *testing.T) {
	t.Parallel()

	db := sqlitedb.Open(t, episodes.SchemaTables()...)
	store := episodes.NewStore(db, time.Now)
	ctx := context.Background()
	if _, err := store.FillGaps(ctx, "long", []episodes.Reading{
		{Episode: 1, DurationMS: (24 * time.Minute).Milliseconds()},
		{Episode: 2, DurationMS: (47 * time.Minute).Milliseconds()},
	}); err != nil {
		t.Fatalf("fill: %v", err)
	}

	marks := NewToday(store).TodayMarks(ctx, []Request{
		{AnimeID: "long", Kind: kindOf(TVKind), Progress: 1},
		{AnimeID: "long", Kind: kindOf(TVKind), Progress: 0},
	})

	if len(marks) != 2 || !equalMark(marks[0], &Mark{Episode: 2, Minutes: 47}) || marks[1] != nil {
		t.Fatalf("want [Ep. 2 · 47 min, nil], got %v", marks)
	}
}

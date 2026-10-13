package episodes_test

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// testClock is the store's injected clock; tests move ms between writes.
type testClock struct{ ms int64 }

// now returns the clock's current instant.
func (c *testClock) now() time.Time { return time.UnixMilli(c.ms) }

// openTestDB opens a production-shaped in-memory database (one connection)
// with this package's schema; its cleanup fails the test on a leaked
// transaction or result set.
func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	return sqlitedb.Open(t, episodes.SchemaTables()...)
}

// openTestStore returns a store over a fresh database with its clock at 1.
func openTestStore(t *testing.T) (*episodes.Store, *testClock) {
	t.Helper()
	clock := &testClock{ms: 1}
	return episodes.NewStore(openTestDB(t), clock.now), clock
}

// row builds an expected stored duration.
func row(animeID string, episode int, durationMS int64, source string, at int64) episodes.Duration {
	return episodes.Duration{AnimeID: animeID, Episode: episode, DurationMS: durationMS, Source: source, UpdatedAtMS: at}
}

// must fails the test on a setup write error.
func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("setup write: %v", err)
	}
}

// assertRows compares one anime's stored durations with want.
func assertRows(t *testing.T, s *episodes.Store, animeID string, want []episodes.Duration) {
	t.Helper()
	got, err := s.ByAnime(context.Background(), animeID)
	if err != nil {
		t.Fatalf("ByAnime(%q): %v", animeID, err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ByAnime(%q) = %+v, want %+v", animeID, got, want)
	}
}

// pendingIDs returns the anime ids waiting for announcement, oldest first.
func pendingIDs(t *testing.T, s *episodes.Store) []string {
	t.Helper()
	pending, err := s.PendingAnnounce(context.Background())
	if err != nil {
		t.Fatalf("PendingAnnounce: %v", err)
	}
	var ids []string
	for _, p := range pending {
		ids = append(ids, p.AnimeID)
	}
	return ids
}

// clearAllPending drops every mark, so a test sees only its own act's marks.
func clearAllPending(t *testing.T, s *episodes.Store) {
	t.Helper()
	pending, err := s.PendingAnnounce(context.Background())
	must(t, err)
	for _, p := range pending {
		must(t, s.ClearPending(context.Background(), p))
	}
}

func TestFillGapsInsertsOnlyEpisodesWithoutARow(t *testing.T) {
	ctx := context.Background()
	s, clock := openTestStore(t)
	must(t, s.SetManual(ctx, "a", 1, 1000))

	clock.ms = 2
	inserted, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 5000}, {Episode: 2, DurationMS: 6000}})
	if err != nil {
		t.Fatalf("FillGaps: %v", err)
	}
	if inserted != 1 {
		t.Fatalf("FillGaps inserted = %d, want 1", inserted)
	}
	assertRows(t, s, "a", []episodes.Duration{row("a", 1, 1000, episodes.SourceManual, 1), row("a", 2, 6000, episodes.SourceMeasured, 2)})
}

func TestSetManualOverwritesTheValueAndItsSource(t *testing.T) {
	ctx := context.Background()
	s, clock := openTestStore(t)
	_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 5000}})
	must(t, err)

	clock.ms = 2
	if err := s.SetManual(ctx, "a", 1, 7000); err != nil {
		t.Fatalf("SetManual: %v", err)
	}
	assertRows(t, s, "a", []episodes.Duration{row("a", 1, 7000, episodes.SourceManual, 2)})
}

func TestConfirmMeasuredKeepsManualRows(t *testing.T) {
	ctx := context.Background()
	s, clock := openTestStore(t)
	must(t, s.SetManual(ctx, "a", 1, 1000))
	_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 2, DurationMS: 2000}, {Episode: 4, DurationMS: 4000}})
	must(t, err)

	clock.ms = 3
	changed, err := s.ConfirmMeasured(ctx, "a", []episodes.Reading{
		{Episode: 1, DurationMS: 9000}, {Episode: 2, DurationMS: 9100}, {Episode: 3, DurationMS: 9200}, {Episode: 4, DurationMS: 4000},
	})
	if err != nil {
		t.Fatalf("ConfirmMeasured: %v", err)
	}
	if changed != 2 {
		t.Fatalf("ConfirmMeasured changed = %d, want 2", changed)
	}
	assertRows(t, s, "a", []episodes.Duration{
		row("a", 1, 1000, episodes.SourceManual, 1),
		row("a", 2, 9100, episodes.SourceMeasured, 3),
		row("a", 3, 9200, episodes.SourceMeasured, 3),
		row("a", 4, 4000, episodes.SourceMeasured, 1),
	})
}

func TestClearDeletesOnlyThatEpisode(t *testing.T) {
	ctx := context.Background()
	s, _ := openTestStore(t)
	_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 1000}, {Episode: 2, DurationMS: 2000}})
	must(t, err)
	_, err = s.FillGaps(ctx, "b", []episodes.Reading{{Episode: 1, DurationMS: 3000}})
	must(t, err)

	if err := s.Clear(ctx, "a", 1); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	assertRows(t, s, "a", []episodes.Duration{row("a", 2, 2000, episodes.SourceMeasured, 1)})
	assertRows(t, s, "b", []episodes.Duration{row("b", 1, 3000, episodes.SourceMeasured, 1)})
}

// TestWritesMarkTheAnimePendingOnlyWhenARowChanges tables every write: a
// write that changes at least one row marks exactly its anime, and a write
// that changes nothing marks nothing. Every case starts from anime "a" with
// manual episode 1 (1000 ms) and measured episode 2 (2000 ms), marks cleared.
func TestWritesMarkTheAnimePendingOnlyWhenARowChanges(t *testing.T) {
	cases := []struct {
		name string
		act  func(context.Context, *episodes.Store) error
		want []string
	}{
		{name: "fill a gap", want: []string{"a"}, act: func(ctx context.Context, s *episodes.Store) error {
			_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 3, DurationMS: 3000}})
			return err
		}},
		{name: "fill with no gap", act: func(ctx context.Context, s *episodes.Store) error {
			_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 9000}, {Episode: 2, DurationMS: 9000}})
			return err
		}},
		{name: "manual new value", want: []string{"a"}, act: func(ctx context.Context, s *episodes.Store) error {
			return s.SetManual(ctx, "a", 1, 1500)
		}},
		{name: "manual over a measured row with the same value", want: []string{"a"}, act: func(ctx context.Context, s *episodes.Store) error {
			return s.SetManual(ctx, "a", 2, 2000)
		}},
		{name: "manual identical value", act: func(ctx context.Context, s *episodes.Store) error {
			return s.SetManual(ctx, "a", 1, 1000)
		}},
		{name: "confirm a changed measured row", want: []string{"a"}, act: func(ctx context.Context, s *episodes.Store) error {
			_, err := s.ConfirmMeasured(ctx, "a", []episodes.Reading{{Episode: 2, DurationMS: 2500}})
			return err
		}},
		{name: "confirm only manual and identical rows", act: func(ctx context.Context, s *episodes.Store) error {
			_, err := s.ConfirmMeasured(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 9000}, {Episode: 2, DurationMS: 2000}})
			return err
		}},
		{name: "clear a stored episode", want: []string{"a"}, act: func(ctx context.Context, s *episodes.Store) error {
			return s.Clear(ctx, "a", 2)
		}},
		{name: "clear a missing episode", act: func(ctx context.Context, s *episodes.Store) error {
			return s.Clear(ctx, "a", 3)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			s, _ := openTestStore(t)
			must(t, s.SetManual(ctx, "a", 1, 1000))
			_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 2, DurationMS: 2000}})
			must(t, err)
			clearAllPending(t, s)

			if err := tc.act(ctx, s); err != nil {
				t.Fatalf("act: %v", err)
			}
			if got := pendingIDs(t, s); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("pending = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestDurationWriteRollsBackWhenMarkingFails proves the mark shares the
// duration write's transaction: with the pending table gone, the write
// fails and leaves no duration behind.
func TestDurationWriteRollsBackWhenMarkingFails(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	s := episodes.NewStore(db, (&testClock{ms: 1}).now)
	if _, err := db.Exec(`DROP TABLE durations_pending_announce`); err != nil {
		t.Fatalf("drop pending table: %v", err)
	}

	if _, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 1000}}); err == nil {
		t.Fatal("FillGaps succeeded without a pending table")
	}
	assertRows(t, s, "a", nil)
}

func TestClearPendingKeepsAMarkRenewedAfterItWasRead(t *testing.T) {
	ctx := context.Background()
	s, clock := openTestStore(t)
	must(t, s.SetManual(ctx, "b", 1, 1000))
	clock.ms = 2
	must(t, s.SetManual(ctx, "a", 1, 1000))
	read, err := s.PendingAnnounce(ctx)
	must(t, err)
	if want := []episodes.Pending{{AnimeID: "b", MarkedAtMS: 1}, {AnimeID: "a", MarkedAtMS: 2}}; !reflect.DeepEqual(read, want) {
		t.Fatalf("PendingAnnounce = %+v, want %+v", read, want)
	}

	// Same clock instant: the renewal must still differ from the read mark.
	must(t, s.SetManual(ctx, "a", 1, 1100))
	for _, p := range read {
		must(t, s.ClearPending(ctx, p))
	}
	if got := pendingIDs(t, s); !reflect.DeepEqual(got, []string{"a"}) {
		t.Fatalf("pending after clearing the read marks = %v, want [a]", got)
	}
}

func TestByAnimeIDsReturnsEachListedAnimeInEpisodeOrder(t *testing.T) {
	ctx := context.Background()
	s, _ := openTestStore(t)
	_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 2, DurationMS: 2000}, {Episode: 1, DurationMS: 1000}})
	must(t, err)
	_, err = s.FillGaps(ctx, "b", []episodes.Reading{{Episode: 1, DurationMS: 3000}})
	must(t, err)
	_, err = s.FillGaps(ctx, "c", []episodes.Reading{{Episode: 1, DurationMS: 4000}})
	must(t, err)

	got, err := s.ByAnimeIDs(ctx, []string{"a", "b", "missing"})
	if err != nil {
		t.Fatalf("ByAnimeIDs: %v", err)
	}
	want := map[string][]episodes.Duration{
		"a": {row("a", 1, 1000, episodes.SourceMeasured, 1), row("a", 2, 2000, episodes.SourceMeasured, 1)},
		"b": {row("b", 1, 3000, episodes.SourceMeasured, 1)},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ByAnimeIDs = %+v, want %+v", got, want)
	}
}

func TestByAnimeIDsReturnsTheRowsOfASingleAnime(t *testing.T) {
	ctx := context.Background()
	s, _ := openTestStore(t)
	_, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 2, DurationMS: 2000}, {Episode: 1, DurationMS: 1000}})
	must(t, err)

	got, err := s.ByAnimeIDs(ctx, []string{"a"})
	want := map[string][]episodes.Duration{
		"a": {row("a", 1, 1000, episodes.SourceMeasured, 1), row("a", 2, 2000, episodes.SourceMeasured, 1)},
	}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("ByAnimeIDs = (%+v, %v), want (%+v, nil)", got, err, want)
	}
}

// TestByAnimeIDsAnswersAnEmptyListWithoutQuerying uses a closed database:
// an empty list must return an empty, non-nil map without a query, so
// callers such as Today with no anime never reach SQLite.
func TestByAnimeIDsAnswersAnEmptyListWithoutQuerying(t *testing.T) {
	db := openTestDB(t)
	s := episodes.NewStore(db, (&testClock{ms: 1}).now)
	closeDB(t, db)

	got, err := s.ByAnimeIDs(context.Background(), nil)
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("ByAnimeIDs(nil) = (%#v, %v), want (empty non-nil map, nil)", got, err)
	}
}

// countingWrite is one store write under test, returning the count the
// write reports (0 for writes that report none) and its error.
type countingWrite func(context.Context, *episodes.Store) (int, error)

// fillOne fills episode 1 of anime "a"; the shared act of the failure rows.
func fillOne(ctx context.Context, s *episodes.Store) (int, error) {
	return s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 1000}})
}

// TestWritesRejectInvalidInputAndStoreNothing tables each write's input
// validation: the error names the broken rule, the reported count is zero,
// and neither a duration nor a mark is written, even when only a later
// reading of a batch is invalid.
func TestWritesRejectInvalidInputAndStoreNothing(t *testing.T) {
	valid := episodes.Reading{Episode: 1, DurationMS: 1000}
	cases := []struct {
		name string
		act  countingWrite
		want error
	}{
		{name: "fill empty anime id", want: episodes.ErrEmptyAnimeID, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return s.FillGaps(ctx, "", []episodes.Reading{valid})
		}},
		{name: "fill episode zero after a valid reading", want: episodes.ErrInvalidEpisode, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return s.FillGaps(ctx, "a", []episodes.Reading{valid, {Episode: 0, DurationMS: 1000}})
		}},
		{name: "fill zero duration after a valid reading", want: episodes.ErrInvalidDuration, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return s.FillGaps(ctx, "a", []episodes.Reading{valid, {Episode: 2, DurationMS: 0}})
		}},
		{name: "manual empty anime id", want: episodes.ErrEmptyAnimeID, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return 0, s.SetManual(ctx, "", 1, 1000)
		}},
		{name: "manual episode zero", want: episodes.ErrInvalidEpisode, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return 0, s.SetManual(ctx, "a", 0, 1000)
		}},
		{name: "manual negative duration", want: episodes.ErrInvalidDuration, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return 0, s.SetManual(ctx, "a", 1, -1)
		}},
		{name: "confirm empty anime id", want: episodes.ErrEmptyAnimeID, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return s.ConfirmMeasured(ctx, "", []episodes.Reading{valid})
		}},
		{name: "confirm zero duration after a valid reading", want: episodes.ErrInvalidDuration, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return s.ConfirmMeasured(ctx, "a", []episodes.Reading{valid, {Episode: 2, DurationMS: 0}})
		}},
		{name: "clear empty anime id", want: episodes.ErrEmptyAnimeID, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return 0, s.Clear(ctx, "", 1)
		}},
		{name: "clear episode zero", want: episodes.ErrInvalidEpisode, act: func(ctx context.Context, s *episodes.Store) (int, error) {
			return 0, s.Clear(ctx, "a", 0)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, _ := openTestStore(t)
			if n, err := tc.act(context.Background(), s); n != 0 || !errors.Is(err, tc.want) {
				t.Fatalf("result = (%d, %v), want (0, %v)", n, err, tc.want)
			}
			assertRows(t, s, "a", nil)
			if got := pendingIDs(t, s); got != nil {
				t.Fatalf("pending = %v, want none", got)
			}
		})
	}
}

func TestWritesAcceptTheSmallestEpisodeAndDuration(t *testing.T) {
	ctx := context.Background()
	s, _ := openTestStore(t)
	if n, err := s.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 1}}); n != 1 || err != nil {
		t.Fatalf("FillGaps = (%d, %v), want (1, nil)", n, err)
	}
	must(t, s.SetManual(ctx, "b", 1, 1))
	got, err := s.ByAnimeIDs(ctx, []string{"a", "b"})
	must(t, err)
	want := map[string][]episodes.Duration{
		"a": {row("a", 1, 1, episodes.SourceMeasured, 1)},
		"b": {row("b", 1, 1, episodes.SourceManual, 1)},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stored = %+v, want %+v", got, want)
	}
}

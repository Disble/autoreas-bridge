package backfill_test

import (
	"context"
	"maps"
	"slices"
	"sync"
	"testing"

	"autoreas-bridge/internal/anime/backfill"
	"autoreas-bridge/internal/logger"
)

// fourAnime returns a fixture with anime a, b, c and d, one missing episode each.
func fourAnime(t *testing.T) *fixture {
	t.Helper()
	return newFixture(t,
		active("a", folderWith(t, "A - 01.mkv")), active("b", folderWith(t, "B - 01.mkv")),
		active("c", folderWith(t, "C - 01.mkv")), active("d", folderWith(t, "D - 01.mkv")))
}

// holdFirst makes the first probe signal entered and block until release is closed.
func holdFirst(f *fixture, release <-chan struct{}) {
	var once sync.Once
	f.prober.entered = make(chan string, 8)
	f.prober.hold = func(ctx context.Context, _ string) error {
		once.Do(func() { <-release })
		return nil
	}
}

func TestTriggerDuringAPassQueuesOneMergedRepeat(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		during []backfill.Scope
		want   []string
	}{
		{name: "two lists merge", during: []backfill.Scope{backfill.Only("b"), backfill.Only("c")},
			want: []string{"A - 01.mkv", "B - 01.mkv", "C - 01.mkv"}},
		{name: "every anime absorbs a later list", during: []backfill.Scope{backfill.All(), backfill.Only("b")},
			want: []string{"A - 01.mkv", "B - 01.mkv", "C - 01.mkv", "D - 01.mkv"}},
		{name: "every anime absorbs an earlier list", during: []backfill.Scope{backfill.Only("b"), backfill.All()},
			want: []string{"A - 01.mkv", "B - 01.mkv", "C - 01.mkv", "D - 01.mkv"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			f := fourAnime(t)
			release := make(chan struct{})
			holdFirst(f, release)
			b := f.backfill(f.prober)

			b.Trigger(backfill.Only("a"))
			<-f.prober.entered
			for _, scope := range tc.during {
				b.Trigger(scope)
			}
			close(release)
			b.Wait()

			if got := f.catalog.calls.Load(); got != 2 {
				t.Errorf("a pass plus exactly one repeat: want 2 passes, got %d", got)
			}
			if got := f.prober.probedNames(); !slices.Equal(got, tc.want) {
				t.Errorf("probed: want %v, got %v", tc.want, got)
			}
		})
	}
}

func TestTriggerWhileIdleRunsOnePass(t *testing.T) {
	t.Parallel()

	f := fourAnime(t)
	b := f.backfill(f.prober)

	b.Trigger(backfill.Only("d"))
	b.Wait()
	b.Trigger(backfill.Only())
	b.Wait()

	if got := f.catalog.calls.Load(); got != 1 {
		t.Errorf("one pass per trigger and none for an empty scope: want 1, got %d", got)
	}
	if got, want := f.prober.probedNames(), []string{"D - 01.mkv"}; !slices.Equal(got, want) {
		t.Errorf("probed: want %v, got %v", want, got)
	}
}

func TestStopEndsTheRunningPassAndRefusesNewOnes(t *testing.T) {
	t.Parallel()

	f := newFixture(t, active("a", folderWith(t, "A - 01.mkv", "A - 02.mkv", "A - 03.mkv")), active("b", folderWith(t, "B - 01.mkv")))
	f.prober.entered = make(chan string, 8)
	f.prober.hold = func(ctx context.Context, _ string) error {
		<-ctx.Done()
		return ctx.Err()
	}
	b := f.backfill(f.prober)

	b.Trigger(backfill.All())
	<-f.prober.entered
	<-f.prober.entered
	b.Trigger(backfill.All())
	b.Stop()
	b.Trigger(backfill.All())
	b.Wait()

	if got, want := f.prober.probedNames(), []string{"A - 01.mkv", "A - 02.mkv"}; !slices.Equal(got, want) {
		t.Errorf("no file is probed after the stop: want %v, got %v", want, got)
	}
	if got := f.catalog.calls.Load(); got != 1 {
		t.Errorf("neither the queued repeat nor a later trigger runs: want 1 pass, got %d", got)
	}
	if got := f.stored(t, "a"); len(got) != 0 {
		t.Errorf("a cancelled probe stores nothing, got %v", got)
	}
	if want := map[string]int{"a": 1}; !maps.Equal(f.store.reads, want) {
		t.Errorf("no anime is visited after the stop: want %v, got %v", want, f.store.reads)
	}
}

func TestAPanickingPassEndsOnlyThatPass(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name     string
		logs     *logRecords
		wantLogs []logEntry
	}{
		{name: "the panic is logged once as an error", logs: &logRecords{},
			wantLogs: []logEntry{{level: logger.LevelError, eventType: "anime.backfill"}}},
		{name: "without a logger the panic is still contained"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			f := fourAnime(t)
			f.catalog.panicFirst = true
			f.logs = tc.logs
			b := f.backfill(f.prober)

			b.Trigger(backfill.All())
			b.Wait()
			var afterPanic []logEntry
			if tc.logs != nil {
				afterPanic = tc.logs.recorded()
			}
			b.Trigger(backfill.Only("a"))
			b.Wait()

			if got, want := f.prober.probedNames(), []string{"A - 01.mkv"}; !slices.Equal(got, want) {
				t.Errorf("the next trigger still runs a pass: want %v, got %v", want, got)
			}
			// Checked after each pass: the panicking pass logs the error, the healthy one nothing.
			if tc.logs != nil && (!slices.Equal(afterPanic, tc.wantLogs) || !slices.Equal(tc.logs.recorded(), tc.wantLogs)) {
				t.Errorf("logs: want %v after each pass, got %v then %v", tc.wantLogs, afterPanic, tc.logs.recorded())
			}
		})
	}
}

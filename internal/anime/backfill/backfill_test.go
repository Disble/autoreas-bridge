package backfill_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/backfill"
	"autoreas-bridge/internal/anime/duration/probe"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// episodeRuntime is the reading the fake prober answers unless a file has its own.
const episodeRuntime = 24 * time.Minute

// fakeProber measures by basename, records every call, and proves no call ever happens while the
// database connection is in use, which is how a transaction held across a probe would show.
type fakeProber struct {
	db       *sql.DB
	runtimes map[string]time.Duration
	errs     map[string]error
	// hold, when set, runs inside every probe; it may block and returns the probe's error.
	hold    func(ctx context.Context, basename string) error
	entered chan string

	mu     sync.Mutex
	probed []string
	busy   int
	active atomic.Int32
	peak   atomic.Int32
}

// Probe implements backfill.Prober.
func (p *fakeProber) Probe(ctx context.Context, path string) (time.Duration, error) {
	name := filepath.Base(path)
	p.mu.Lock()
	p.probed = append(p.probed, name)
	if p.db.Stats().InUse != 0 {
		p.busy++
	}
	p.mu.Unlock()

	now := p.active.Add(1)
	defer p.active.Add(-1)
	for peak := p.peak.Load(); now > peak && !p.peak.CompareAndSwap(peak, now); peak = p.peak.Load() {
	}
	if p.entered != nil {
		p.entered <- name
	}
	if p.hold != nil {
		if err := p.hold(ctx, name); err != nil {
			return 0, err
		}
	}
	if err := p.errs[name]; err != nil {
		return 0, err
	}
	if runtime, ok := p.runtimes[name]; ok {
		return runtime, nil
	}
	return episodeRuntime, nil
}

// probedNames returns the probed basenames, sorted.
func (p *fakeProber) probedNames() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return slices.Sorted(slices.Values(p.probed))
}

// fakeCatalog lists a fixed set of anime and counts the passes that asked; with panicFirst set,
// the first pass panics instead.
type fakeCatalog struct {
	anime      []backfill.Anime
	panicFirst bool
	err        error
	calls      atomic.Int32
}

// ListAnime implements backfill.Catalog.
func (c *fakeCatalog) ListAnime(context.Context) ([]backfill.Anime, error) {
	if c.calls.Add(1) == 1 && c.panicFirst {
		panic("catalog unavailable")
	}
	return c.anime, c.err
}

// countingStore is the real store, counting reads and FillGaps calls per anime.
type countingStore struct {
	*episodes.Store
	mu    sync.Mutex
	reads map[string]int
	fills map[string]int
	// readErr and fillErr, when set, fail every read or write instead of delegating it.
	readErr, fillErr error
}

// ByAnime counts the read and delegates it.
func (s *countingStore) ByAnime(ctx context.Context, animeID string) ([]episodes.Duration, error) {
	s.mu.Lock()
	s.reads[animeID]++
	s.mu.Unlock()
	if s.readErr != nil {
		return nil, s.readErr
	}
	return s.Store.ByAnime(ctx, animeID)
}

// FillGaps counts the call and delegates it.
func (s *countingStore) FillGaps(ctx context.Context, animeID string, readings []episodes.Reading) (int, error) {
	s.mu.Lock()
	s.fills[animeID]++
	s.mu.Unlock()
	if s.fillErr != nil {
		return 0, s.fillErr
	}
	return s.Store.FillGaps(ctx, animeID, readings)
}

// fixture is one backfill over real SQLite, the real media inventory and the real assigner.
type fixture struct {
	// logs, when set before backfill is called, receives the backfill's log entries.
	logs    *logRecords
	store   *countingStore
	prober  *fakeProber
	catalog *fakeCatalog
}

// newFixture returns a fixture listing anime. Its cleanup fails the test when any probe ran while
// the database connection was in use.
func newFixture(t *testing.T, anime ...backfill.Anime) *fixture {
	t.Helper()
	db := sqlitedb.Open(t, episodes.SchemaTables()...)
	f := &fixture{
		store:   &countingStore{Store: episodes.NewStore(db, func() time.Time { return time.UnixMilli(1) }), reads: map[string]int{}, fills: map[string]int{}},
		prober:  &fakeProber{db: db},
		catalog: &fakeCatalog{anime: anime},
	}
	t.Cleanup(func() {
		if f.prober.busy != 0 {
			t.Errorf("%d probes ran while the database connection was in use", f.prober.busy)
		}
	})
	return f
}

// backfill builds the Backfill under test with prober as its probe, logging to f.logs when set.
func (f *fixture) backfill(prober backfill.Prober) *backfill.Backfill {
	var log logger.Logger
	if f.logs != nil {
		log = f.logs
	}
	return backfill.New(backfill.Deps{
		Catalog:   f.catalog,
		Inventory: media.New(map[string]bool{".mkv": true}),
		Assigner:  identity.NewAssigner(),
		Prober:    prober,
		Store:     f.store,
		Logger:    log,
	})
}

// stored returns one anime's stored readings, in episode order.
func (f *fixture) stored(t *testing.T, animeID string) []episodes.Reading {
	t.Helper()
	rows, err := f.store.Store.ByAnime(context.Background(), animeID)
	if err != nil {
		t.Fatalf("read durations: %v", err)
	}
	got := []episodes.Reading{}
	for _, row := range rows {
		got = append(got, episodes.Reading{Episode: row.Episode, DurationMS: row.DurationMS})
	}
	return got
}

// folderWith creates a folder holding one empty media file per name.
func folderWith(t *testing.T, names ...string) string {
	t.Helper()
	folder := t.TempDir()
	for _, name := range names {
		if err := os.WriteFile(filepath.Join(folder, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	return folder
}

// active is an active anime with a folder.
func active(id, folder string) backfill.Anime {
	return backfill.Anime{ID: id, Active: true, Folder: folder}
}

// minutes is a runtime in milliseconds.
func minutes(n int64) int64 { return n * 60_000 }

func TestRunFillsOnlyEpisodesWithoutARow(t *testing.T) {
	t.Parallel()

	f := newFixture(t, active("a", folderWith(t, "Show - 01.mkv", "Show - 02.mkv", "Show - 03.mkv", "Show - 04.mkv", "Show - 05.mkv")))
	if _, err := f.store.Store.FillGaps(context.Background(), "a", []episodes.Reading{{Episode: 1, DurationMS: 1_000}}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// A reading below one millisecond is no duration at all; storing it would fail the whole anime.
	// One millisecond is the smallest duration and is stored.
	f.prober.runtimes = map[string]time.Duration{"Show - 03.mkv": 500 * time.Microsecond, "Show - 05.mkv": time.Millisecond}

	f.backfill(f.prober).Run(context.Background(), backfill.All())

	if got, want := f.prober.probedNames(), []string{"Show - 02.mkv", "Show - 03.mkv", "Show - 04.mkv", "Show - 05.mkv"}; !slices.Equal(got, want) {
		t.Errorf("only episodes without a row are probed: want %v, got %v", want, got)
	}
	want := []episodes.Reading{{Episode: 1, DurationMS: 1_000}, {Episode: 2, DurationMS: minutes(24)}, {Episode: 4, DurationMS: minutes(24)}, {Episode: 5, DurationMS: 1}}
	if got := f.stored(t, "a"); !slices.Equal(got, want) {
		t.Errorf("stored: want %v, got %v", want, got)
	}
	if f.store.fills["a"] != 1 {
		t.Errorf("one write per anime per pass, got %d", f.store.fills["a"])
	}
}

func TestRunMeasuresOnlyActiveAnimeAndConfidentFiles(t *testing.T) {
	t.Parallel()

	f := newFixture(t,
		backfill.Anime{ID: "inactive", Folder: folderWith(t, "Old - 01.mkv")},
		backfill.Anime{ID: "folderless", Active: true},
		active("gone", filepath.Join(t.TempDir(), "gone")),
		active("mixed", folderWith(t, "Show - 03.5.mkv", "A - 04.mkv", "B - 04.mkv", "Show - 05.mkv", "Extra.mkv")),
		active("complete", folderWith(t, "Done - 01.mkv")),
		active("outside", folderWith(t, "Other - 01.mkv")),
	)
	if _, err := f.store.Store.FillGaps(context.Background(), "complete", []episodes.Reading{{Episode: 1, DurationMS: 1_000}}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	f.backfill(f.prober).Run(context.Background(), backfill.Only("inactive", "folderless", "gone", "mixed", "complete"))

	if got, want := f.prober.probedNames(), []string{"Show - 05.mkv"}; !slices.Equal(got, want) {
		t.Errorf("only the confidently assigned missing file of an active anime is probed: want %v, got %v", want, got)
	}
	if got, want := f.stored(t, "mixed"), []episodes.Reading{{Episode: 5, DurationMS: minutes(24)}}; !slices.Equal(got, want) {
		t.Errorf("stored: want %v, got %v", want, got)
	}
	if want := map[string]int{"gone": 1, "mixed": 1, "complete": 1}; !maps.Equal(f.store.reads, want) {
		t.Errorf("only active anime with a folder, in scope, are visited: want %v, got %v", want, f.store.reads)
	}
	if want := map[string]int{"mixed": 1}; !maps.Equal(f.store.fills, want) {
		t.Errorf("only an anime with readings is written: want %v, got %v", want, f.store.fills)
	}
}

func TestRunProbesAtMostTwoFilesAtATime(t *testing.T) {
	t.Parallel()

	names := []string{"S - 01.mkv", "S - 02.mkv", "S - 03.mkv", "S - 04.mkv", "S - 05.mkv", "S - 06.mkv", "S - 07.mkv", "S - 08.mkv"}
	f := newFixture(t, active("a", folderWith(t, names...)))
	release := make(chan struct{})
	f.prober.entered = make(chan string, len(names))
	f.prober.hold = func(context.Context, string) error { <-release; return nil }

	done := make(chan struct{})
	go func() { f.backfill(f.prober).Run(context.Background(), backfill.All()); close(done) }()
	<-f.prober.entered
	<-f.prober.entered
	close(release)
	<-done

	if peak := f.prober.peak.Load(); peak != backfill.MaxConcurrentProbes {
		t.Errorf("want exactly %d probes at a time, peak was %d", backfill.MaxConcurrentProbes, peak)
	}
	if got := len(f.stored(t, "a")); got != len(names) {
		t.Errorf("every file is still measured: want %d rows, got %d", len(names), got)
	}
}

func TestRunStopsOnlyWhenTheProbeBinaryIsMissing(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		prober    func(f *fixture) backfill.Prober
		wantCalls int
		wantB     []episodes.Reading
	}{
		{name: "a missing ffprobe ends the pass", prober: func(f *fixture) backfill.Prober {
			return &countingProber{inner: probe.NewFFProbe(filepath.Join(os.TempDir(), "no-such-dir", "ffprobe"))}
		}, wantCalls: 1, wantB: []episodes.Reading{}},
		{name: "an unreadable file skips only its episode", prober: func(f *fixture) backfill.Prober {
			f.prober.errs = map[string]error{"A - 01.mkv": errors.New("probe: exit status 1")}
			return &countingProber{inner: f.prober}
		}, wantCalls: 2, wantB: []episodes.Reading{{Episode: 1, DurationMS: minutes(24)}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			f := newFixture(t, active("a", folderWith(t, "A - 01.mkv")), active("b", folderWith(t, "B - 01.mkv")))
			prober := tc.prober(f).(*countingProber)

			f.backfill(prober).Run(context.Background(), backfill.All())

			if got := prober.calls.Load(); got != int32(tc.wantCalls) {
				t.Errorf("want %d probe calls, got %d", tc.wantCalls, got)
			}
			if got := f.stored(t, "a"); len(got) != 0 {
				t.Errorf("a failed reading writes nothing, got %v", got)
			}
			if got := f.stored(t, "b"); !slices.Equal(got, tc.wantB) {
				t.Errorf("anime b: want %v, got %v", tc.wantB, got)
			}
		})
	}
}

// countingProber counts the calls it forwards to inner.
type countingProber struct {
	inner backfill.Prober
	calls atomic.Int32
}

// Probe counts the call and forwards it.
func (p *countingProber) Probe(ctx context.Context, path string) (time.Duration, error) {
	p.calls.Add(1)
	return p.inner.Probe(ctx, path)
}

// logEntry is one recorded log call.
type logEntry struct{ level, eventType string }

// logRecords is a logger.Logger recording the level and event type of every entry.
type logRecords struct {
	mu      sync.Mutex
	entries []logEntry
}

// Logf records one entry.
func (l *logRecords) Logf(_, level string, fields logger.Fields, _ string, _ ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.entries = append(l.entries, logEntry{level: level, eventType: fields.EventType})
}

// Debugf records a debug entry.
func (l *logRecords) Debugf(domain, format string, args ...any) {
	l.Logf(domain, logger.LevelDebug, logger.Fields{}, format, args...)
}

// Infof records an info entry.
func (l *logRecords) Infof(domain, format string, args ...any) {
	l.Logf(domain, logger.LevelInfo, logger.Fields{}, format, args...)
}

// Warnf records a warn entry.
func (l *logRecords) Warnf(domain, format string, args ...any) {
	l.Logf(domain, logger.LevelWarn, logger.Fields{}, format, args...)
}

// Errorf records an error entry.
func (l *logRecords) Errorf(domain, format string, args ...any) {
	l.Logf(domain, logger.LevelError, logger.Fields{}, format, args...)
}

// recorded returns the recorded entries.
func (l *logRecords) recorded() []logEntry {
	l.mu.Lock()
	defer l.mu.Unlock()
	return slices.Clone(l.entries)
}

func TestPassFailuresAreLoggedAsWarnings(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name    string
		breakIt func(f *fixture)
	}{
		{name: "the catalog cannot list", breakIt: func(f *fixture) { f.catalog.err = errors.New("no snapshots") }},
		{name: "the stored rows cannot be read", breakIt: func(f *fixture) { f.store.readErr = errors.New("locked") }},
		{name: "the readings cannot be written", breakIt: func(f *fixture) { f.store.fillErr = errors.New("locked") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			f := newFixture(t, active("a", folderWith(t, "A - 01.mkv")))
			f.logs = &logRecords{}
			tc.breakIt(f)

			f.backfill(f.prober).Run(context.Background(), backfill.All())

			want := []logEntry{{level: logger.LevelWarn, eventType: "anime.backfill"}}
			if got := f.logs.recorded(); !slices.Equal(got, want) {
				t.Errorf("want %v, got %v", want, got)
			}
		})
	}
}

func TestAHealthyPassLogsNothing(t *testing.T) {
	t.Parallel()

	f := newFixture(t, active("a", folderWith(t, "A - 01.mkv")), active("gone", filepath.Join(t.TempDir(), "gone")))
	f.logs = &logRecords{}
	f.prober.errs = map[string]error{"A - 01.mkv": errors.New("probe: exit status 1")}

	f.backfill(f.prober).Run(context.Background(), backfill.All())

	if got := f.logs.recorded(); len(got) != 0 {
		t.Errorf("an unreadable folder or file is a silence, got %v", got)
	}
}

// TestAMissingBinaryStartsNoNewProbe pins that once a probe reports the binary missing, no new
// probe starts, even with free slots and files left: the second probe is held until the first has
// returned, and both report the missing binary before they free their slot.
func TestAMissingBinaryStartsNoNewProbe(t *testing.T) {
	t.Parallel()

	names := []string{"S - 01.mkv", "S - 02.mkv", "S - 03.mkv", "S - 04.mkv", "S - 05.mkv", "S - 06.mkv"}
	f := newFixture(t, active("a", folderWith(t, names...)), active("b", folderWith(t, "B - 01.mkv")))
	missing := fmt.Errorf("probe: %w", &exec.Error{Name: "ffprobe", Err: exec.ErrNotFound})
	f.prober.errs = map[string]error{}
	for _, name := range names {
		f.prober.errs[name] = missing
	}
	firstReturned := make(chan struct{})
	f.prober.hold = func(_ context.Context, name string) error {
		if name == names[0] {
			close(firstReturned)
		} else {
			<-firstReturned
		}
		return nil
	}

	f.backfill(f.prober).Run(context.Background(), backfill.All())

	if got := len(f.prober.probedNames()); got > backfill.MaxConcurrentProbes {
		t.Errorf("no probe starts after the binary is missing: want at most %d calls, got %d", backfill.MaxConcurrentProbes, got)
	}
	if want := map[string]int{"a": 1}; !maps.Equal(f.store.reads, want) {
		t.Errorf("the pass ends at the missing binary: want %v visited, got %v", want, f.store.reads)
	}
}

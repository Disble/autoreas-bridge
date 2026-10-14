package durationedit

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// videoExtensions is the extension set these tests count as episodes.
var videoExtensions = map[string]bool{".mkv": true, ".mp4": true}

// folderWith writes one small file per name into a fresh folder.
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

// byName answers each probe from a basename-to-runtime map; a missing name fails the probe.
type byName struct {
	runtimes map[string]time.Duration
	err      error
	asked    []string
	onProbe  func(path string)
}

func (p *byName) Probe(_ context.Context, path string) (time.Duration, error) {
	p.asked = append(p.asked, filepath.Base(path))
	if p.onProbe != nil {
		p.onProbe(path)
	}
	if p.err != nil {
		return 0, p.err
	}
	runtime, ok := p.runtimes[filepath.Base(path)]
	if !ok {
		return 0, errors.New("cannot read file")
	}
	return runtime, nil
}

// fixture is a service over a real store and a real folder inventory.
type fixture struct {
	store   *episodes.Store
	service *Service
	prober  *byName
}

// newFixture builds the fixture with an empty prober.
func newFixture(t *testing.T) fixture {
	t.Helper()

	store := episodes.NewStore(sqlitedb.Open(t, episodes.SchemaTables()...), time.Now)
	prober := &byName{runtimes: map[string]time.Duration{}}
	return fixture{store: store, prober: prober,
		service: New(store, media.New(videoExtensions), identity.NewAssigner(), prober)}
}

// intOf returns a pointer to v.
func intOf(v int) *int { return &v }

func TestSectionListsStoredFilesAndTotalWithTheirSource(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	ctx := context.Background()
	_, err := f.store.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: (47 * time.Minute).Milliseconds()}})
	if err != nil {
		t.Fatalf("fill: %v", err)
	}
	if err := f.store.SetManual(ctx, "a", 2, (24 * time.Minute).Milliseconds()); err != nil {
		t.Fatalf("manual: %v", err)
	}
	if err := f.store.SetManual(ctx, "a", 8, (62 * time.Minute).Milliseconds()); err != nil {
		t.Fatalf("manual: %v", err)
	}
	folder := folderWith(t, "Show - 01.mkv", "Show - 02.mkv", "Show - 03.mkv", "Show - 13.mkv")

	section, err := f.service.Section(ctx, Anime{ID: "a", Folder: folder, TotalEpisodes: intOf(3), Kind: intOf(0)})
	if err != nil {
		t.Fatalf("section: %v", err)
	}

	want := []Row{
		{Episode: 1, DurationMS: (47 * time.Minute).Milliseconds(), Minutes: 47, Long: true, Source: SourceMeasured},
		{Episode: 2, DurationMS: (24 * time.Minute).Milliseconds(), Minutes: 24, Source: SourceManual},
		{Episode: 3, Source: SourceNotMeasuredFileFound},
		{Episode: 8, DurationMS: (62 * time.Minute).Milliseconds(), Minutes: 62, Long: true, Source: SourceManualNoFile},
		{Episode: 13, Source: SourceNotMeasuredFileFound},
	}
	assertRows(t, section.Rows, want)
	if section.FolderStatus != FolderFound || !section.TV {
		t.Errorf("want a found folder of a TV anime, got %+v", section)
	}
	if len(section.BeyondTotal) != 1 || section.BeyondTotal[0] != 13 {
		t.Errorf("want only episode 13 beyond the total of 3, not the file at the total, got %v", section.BeyondTotal)
	}
}

func TestSectionWithoutAFolderOrTotal(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	ctx := context.Background()
	if err := f.store.SetManual(ctx, "a", 4, (47 * time.Minute).Milliseconds()); err != nil {
		t.Fatalf("manual: %v", err)
	}

	for _, tc := range []struct {
		name   string
		anime  Anime
		status string
		want   []Row
	}{
		{name: "no folder keeps a manual row as manual", anime: Anime{ID: "a", Kind: intOf(0)}, status: FolderNone,
			want: []Row{{Episode: 4, DurationMS: (47 * time.Minute).Milliseconds(), Minutes: 47, Long: true, Source: SourceManual}}},
		{name: "a missing folder shows saved durations", status: FolderMissing,
			anime: Anime{ID: "a", Folder: filepath.Join(t.TempDir(), "gone"), Kind: intOf(0)},
			want:  []Row{{Episode: 4, DurationMS: (47 * time.Minute).Milliseconds(), Minutes: 47, Long: true, Source: SourceManual}}},
		{name: "a movie never runs long", anime: Anime{ID: "a", Kind: intOf(3)}, status: FolderNone,
			want: []Row{{Episode: 4, DurationMS: (47 * time.Minute).Milliseconds(), Minutes: 47, Source: SourceManual}}},
		{name: "nothing stored and nothing known lists nothing", anime: Anime{ID: "empty"}, status: FolderNone},
		{name: "a known total lists every episode as not measured", anime: Anime{ID: "empty", TotalEpisodes: intOf(2)},
			status: FolderNone, want: []Row{{Episode: 1, Source: SourceNotMeasured}, {Episode: 2, Source: SourceNotMeasured}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			section, err := f.service.Section(ctx, tc.anime)
			if err != nil {
				t.Fatalf("section: %v", err)
			}
			if section.FolderStatus != tc.status {
				t.Errorf("want folder %s, got %s", tc.status, section.FolderStatus)
			}
			wantTV := tc.anime.Kind != nil && *tc.anime.Kind == 0
			if section.TV != wantTV {
				t.Errorf("want TV %v for kind %v, got %v", wantTV, tc.anime.Kind, section.TV)
			}
			assertRows(t, section.Rows, tc.want)
			if section.BeyondTotal != nil {
				t.Errorf("want nothing beyond the total, got %v", section.BeyondTotal)
			}
		})
	}
}

func TestSectionReportsAFailedRead(t *testing.T) {
	t.Parallel()

	service := New(failingDurations{}, media.New(videoExtensions), identity.NewAssigner(), &byName{})
	if _, err := service.Section(context.Background(), Anime{ID: "a"}); err == nil {
		t.Fatal("a failed read must be returned")
	}
	if _, err := service.Reanalyze(context.Background(), Anime{ID: "a"}, nil); err == nil {
		t.Fatal("a failed read must be returned")
	}
}

// failingDurations fails every read.
type failingDurations struct{}

func (failingDurations) ByAnime(context.Context, string) ([]episodes.Duration, error) {
	return nil, errors.New("database is closed")
}

// assertRows compares two row lists element by element.
func assertRows(t *testing.T, got, want []Row) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("want %d rows, got %d: %+v", len(want), len(got), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("row %d: want %+v, got %+v", i, want[i], got[i])
		}
	}
}

package notice

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// proberAnswers is a Prober that records what it was asked and answers with a fixed reading.
type proberAnswers struct {
	runtime time.Duration
	err     error
	paths   []string
}

func (p *proberAnswers) Probe(_ context.Context, path string) (time.Duration, error) {
	p.paths = append(p.paths, path)
	if p.err != nil {
		return 0, p.err
	}
	return p.runtime, nil
}

// notifierRecords is a Notifier that records every notification it was handed.
type notifierRecords struct{ got []notification.Notification }

func (n *notifierRecords) Notify(_ context.Context, got notification.Notification) error {
	n.got = append(n.got, got)
	return nil
}

// folderWith creates a folder holding one media file per name.
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

// touchedLast makes name the most recently modified file in folder.
func touchedLast(t *testing.T, folder, name string) {
	t.Helper()

	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(filepath.Join(folder, name), later, later); err != nil {
		t.Fatalf("chtimes %s: %v", name, err)
	}
}

// tv is the stored type of an Anime (TV). It deliberately passes the literal 0 the contract
// documents (tipo=0, "Anime (TV)") instead of the package constant, so that changing the constant
// cannot silently change what these tests believe the stored contract says.
func tv() *int {
	kind := 0
	return &kind
}

// newCoordinator returns a Coordinator reading folders with the real media inventory.
func newCoordinator(t *testing.T, prober Prober, notifier notification.Notifier) *Coordinator {
	t.Helper()

	return New(media.New(map[string]bool{".mp4": true, ".mkv": true}), prober, notifier)
}

func TestEpisodeLandedNotifiesOnceForALongTVEpisode(t *testing.T) {
	t.Parallel()

	folder := folderWith(t, "Show - 01.mp4", "Show - 02.mp4")
	touchedLast(t, folder, "Show - 02.mp4")

	prober := &proberAnswers{runtime: 45 * time.Minute}
	notifier := &notifierRecords{}
	newCoordinator(t, prober, notifier).EpisodeLanded(context.Background(), folder, tv(), 2, "anime-1", "Show")

	if len(notifier.got) != 1 {
		t.Fatalf("a long episode is exactly one notice, got %d (%v)", len(notifier.got), notifier.got)
	}
	got := notifier.got[0]
	if got.Title != "Capítulo largo" {
		t.Errorf("the title must state the fact, got %q", got.Title)
	}
	if len(got.Rows) != 1 || got.Rows[0].Name != "Show" || got.Rows[0].RefID != "anime-1" {
		t.Errorf("the notice must carry the anime as a row, got %v", got.Rows)
	}
	if got.Rows[0].RefType != "anime" {
		t.Errorf("the row must reference the anime, got RefType %q", got.Rows[0].RefType)
	}
	if got.Rows[0].Detail != "El capítulo descargado dura 45 minutos" {
		t.Errorf("the row must state the measured runtime, got %q", got.Rows[0].Detail)
	}
	if !strings.Contains(got.Body, "Episodio 2") {
		t.Errorf("the body must name the episode, got %q", got.Body)
	}
	if !strings.Contains(got.Body, "45") {
		t.Errorf("the notice must carry the measured runtime, got %q", got.Body)
	}
	if got.Level != notification.LevelInfo {
		t.Errorf("the notice is informational, never a warning: got level %q", got.Level)
	}
	if got.Source != "anime" || got.Kind != KindEpisodeLong {
		t.Errorf("unexpected routing: source %q kind %q", got.Source, got.Kind)
	}
	if len(prober.paths) != 1 || !strings.HasSuffix(prober.paths[0], "Show - 02.mp4") {
		t.Errorf("only the file that landed may be measured, got %v", prober.paths)
	}
}

func TestEpisodeLandedStaysSilent(t *testing.T) {
	t.Parallel()

	kind := func(v int) *int { return &v }
	ordinary := folderWith(t, "Show - 01.mp4")

	for _, tc := range []struct {
		name       string
		folder     func(t *testing.T) string
		kind       *int
		prober     *proberAnswers
		wantProbes int
	}{
		{name: "an ordinary runtime", folder: func(*testing.T) string { return ordinary }, kind: tv(),
			prober: &proberAnswers{runtime: 24 * time.Minute}, wantProbes: 1},
		{name: "a short runtime", folder: func(*testing.T) string { return ordinary }, kind: tv(),
			prober: &proberAnswers{runtime: 12 * time.Minute}, wantProbes: 1},
		{name: "an anime that is not TV", folder: func(*testing.T) string { return ordinary }, kind: kind(3),
			prober: &proberAnswers{runtime: 45 * time.Minute}},
		{name: "an anime with no stored type", folder: func(*testing.T) string { return ordinary }, kind: nil,
			prober: &proberAnswers{runtime: 45 * time.Minute}},
		{name: "an absent folder", folder: func(t *testing.T) string { return filepath.Join(t.TempDir(), "gone") },
			kind: tv(), prober: &proberAnswers{runtime: 45 * time.Minute}},
		{name: "a folder with no media", folder: func(t *testing.T) string { return t.TempDir() },
			kind: tv(), prober: &proberAnswers{runtime: 45 * time.Minute}},
		{name: "a probe that cannot read the file", folder: func(*testing.T) string { return ordinary }, kind: tv(),
			prober: &proberAnswers{err: errors.New("ffprobe: not found")}, wantProbes: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			notifier := &notifierRecords{}
			newCoordinator(t, tc.prober, notifier).EpisodeLanded(context.Background(), tc.folder(t), tc.kind, 8, "anime-1", "Show")

			if len(notifier.got) != 0 {
				t.Fatalf("expected silence, got %v", notifier.got)
			}
			// The gate order is part of the decision: a type that cannot qualify must stop the work
			// before any file is read, while an ordinary runtime is only known after measuring.
			if len(tc.prober.paths) != tc.wantProbes {
				t.Errorf("want %d probes, got %d (%v)", tc.wantProbes, len(tc.prober.paths), tc.prober.paths)
			}
		})
	}
}

func TestLandedMediaRefusesWhatItCannotTrust(t *testing.T) {
	t.Parallel()

	entries := func(mtime string, mutators ...func(*identity.Entry)) []identity.Entry {
		e := identity.Entry{Basename: "Show - 01.mp4", MtimeNs: mtime}
		for _, m := range mutators {
			m(&e)
		}
		return []identity.Entry{e}
	}

	for _, tc := range []struct {
		name    string
		entries []identity.Entry
		want    string
	}{
		{name: "the newest file wins", entries: []identity.Entry{
			{Basename: "Show - 01.mp4", MtimeNs: "100"},
			{Basename: "Show - 02.mp4", MtimeNs: "200"},
		}, want: "Show - 02.mp4"},
		{name: "a file with no readable time is not a candidate", entries: []identity.Entry{
			{Basename: "Show - 01.mp4", MtimeNs: ""},
			{Basename: "Show - 02.mp4", MtimeNs: "200"},
		}, want: "Show - 02.mp4"},
		{name: "a time that is not a number is not a candidate", entries: []identity.Entry{
			{Basename: "Show - 01.mp4", MtimeNs: "not-a-number"},
			{Basename: "Show - 02.mp4", MtimeNs: "200"},
		}, want: "Show - 02.mp4"},
		{name: "a tie goes to the first in name order", entries: []identity.Entry{
			{Basename: "Show - 01.mp4", MtimeNs: "200"},
			{Basename: "Show - 02.mp4", MtimeNs: "200"},
		}, want: "Show - 01.mp4"},
		{name: "a file that could not be described is never used", entries: entries("200",
			func(e *identity.Entry) { e.Err = "access denied" }), want: ""},
		{name: "a file that changed while being listed is never used", entries: entries("200",
			func(e *identity.Entry) { e.Changed = true }), want: ""},
		{name: "an empty folder offers nothing", entries: nil, want: ""},
		{name: "a reading at the epoch is still a reading", entries: entries("0"), want: "Show - 01.mp4"},
		{name: "a reading before the epoch is still a reading", entries: entries("-1000000000"),
			want: "Show - 01.mp4"},
		{name: "the largest representable reading is still a reading", entries: entries("9223372036854775807"),
			want: "Show - 01.mp4"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, ok := landedMedia(tc.entries)
			if tc.want == "" {
				if ok {
					t.Fatalf("expected no landed file, got %q", got.Basename)
				}
				return
			}
			if !ok || got.Basename != tc.want {
				t.Fatalf("want %q, got %q (ok=%v)", tc.want, got.Basename, ok)
			}
		})
	}
}

func TestEpisodeLandedSurvivesAWiredNotifierThatFails(t *testing.T) {
	t.Parallel()

	folder := folderWith(t, "Show - 01.mp4")
	notifier := failingNotifier{}
	newCoordinator(t, &proberAnswers{runtime: 45 * time.Minute}, notifier).
		EpisodeLanded(context.Background(), folder, tv(), 8, "anime-1", "Show")
}

// failingNotifier reports a delivery failure, which must never reach the download run.
type failingNotifier struct{}

func (failingNotifier) Notify(context.Context, notification.Notification) error {
	return errors.New("notification adapter down")
}

// openDurations returns a duration store over a fresh production-shaped database.
func openDurations(t *testing.T) *episodes.Store {
	t.Helper()

	return episodes.NewStore(sqlitedb.Open(t, episodes.SchemaTables()...), func() time.Time { return time.UnixMilli(1) })
}

// storedReadings returns one anime's stored episodes and durations, in episode order.
func storedReadings(t *testing.T, store *episodes.Store, animeID string) []episodes.Reading {
	t.Helper()

	rows, err := store.ByAnime(context.Background(), animeID)
	if err != nil {
		t.Fatalf("read durations: %v", err)
	}
	got := []episodes.Reading{}
	for _, row := range rows {
		got = append(got, episodes.Reading{Episode: row.Episode, DurationMS: row.DurationMS})
	}
	return got
}

// TestEpisodeLandedStoresTheReadingOfEveryType pins S9 and the all-types rule: every successful
// reading of the landed file is stored for its episode, whatever the anime type, while the notice
// itself stays TV-only and a failed reading stores nothing.
func TestEpisodeLandedStoresTheReadingOfEveryType(t *testing.T) {
	t.Parallel()

	movie := 3
	for _, tc := range []struct {
		name        string
		kind        *int
		prober      *proberAnswers
		want        []episodes.Reading
		wantNotices int
	}{
		{name: "a long TV episode", kind: tv(), prober: &proberAnswers{runtime: 45 * time.Minute},
			want: []episodes.Reading{{Episode: 8, DurationMS: 2_700_000}}, wantNotices: 1},
		{name: "an ordinary TV episode", kind: tv(), prober: &proberAnswers{runtime: 24 * time.Minute},
			want: []episodes.Reading{{Episode: 8, DurationMS: 1_440_000}}},
		{name: "an anime that is not TV", kind: &movie, prober: &proberAnswers{runtime: 45 * time.Minute},
			want: []episodes.Reading{{Episode: 8, DurationMS: 2_700_000}}},
		{name: "an anime with no stored type", kind: nil, prober: &proberAnswers{runtime: 90 * time.Second},
			want: []episodes.Reading{{Episode: 8, DurationMS: 90_000}}},
		{name: "a probe that cannot read the file", kind: &movie,
			prober: &proberAnswers{err: errors.New("ffprobe: not found")}, want: []episodes.Reading{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			store := openDurations(t)
			notifier := &notifierRecords{}
			newCoordinator(t, tc.prober, notifier).WithRecorder(store).
				EpisodeLanded(context.Background(), folderWith(t, "Show - 08.mp4"), tc.kind, 8, "anime-1", "Show")

			if got := storedReadings(t, store, "anime-1"); !slices.Equal(got, tc.want) {
				t.Errorf("stored readings: want %v, got %v", tc.want, got)
			}
			if len(notifier.got) != tc.wantNotices {
				t.Errorf("want %d notices, got %d (%v)", tc.wantNotices, len(notifier.got), notifier.got)
			}
		})
	}
}

// TestEpisodeLandedNeverOverwritesAStoredEpisode pins S6: the landed reading only fills a gap, so
// an episode that already has a row keeps it, and the notice still speaks from the file it measured.
func TestEpisodeLandedNeverOverwritesAStoredEpisode(t *testing.T) {
	t.Parallel()

	store := openDurations(t)
	if _, err := store.FillGaps(context.Background(), "anime-1", []episodes.Reading{{Episode: 8, DurationMS: 1_000}}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	notifier := &notifierRecords{}
	newCoordinator(t, &proberAnswers{runtime: 45 * time.Minute}, notifier).WithRecorder(store).
		EpisodeLanded(context.Background(), folderWith(t, "Show - 08.mp4"), tv(), 8, "anime-1", "Show")

	if got, want := storedReadings(t, store, "anime-1"), []episodes.Reading{{Episode: 8, DurationMS: 1_000}}; !slices.Equal(got, want) {
		t.Errorf("a stored episode must stay as it was: want %v, got %v", want, got)
	}
	if len(notifier.got) != 1 {
		t.Errorf("the notice must still speak for the long file it measured, got %d", len(notifier.got))
	}
}

// failingRecorder refuses every write, which must never reach the notice or the download run.
type failingRecorder struct{ calls int }

// FillGaps records the call and fails it.
func (r *failingRecorder) FillGaps(context.Context, string, []episodes.Reading) (int, error) {
	r.calls++
	return 0, errors.New("database locked")
}

// TestEpisodeLandedSurvivesARecorderThatFails pins that a failed write is swallowed like a failed
// delivery: the notice is raised exactly as it would be without a recorder.
func TestEpisodeLandedSurvivesARecorderThatFails(t *testing.T) {
	t.Parallel()

	folder := folderWith(t, "Show - 08.mp4")
	without, with := &notifierRecords{}, &notifierRecords{}
	recorder := &failingRecorder{}
	newCoordinator(t, &proberAnswers{runtime: 45 * time.Minute}, without).
		EpisodeLanded(context.Background(), folder, tv(), 8, "anime-1", "Show")
	newCoordinator(t, &proberAnswers{runtime: 45 * time.Minute}, with).WithRecorder(recorder).
		EpisodeLanded(context.Background(), folder, tv(), 8, "anime-1", "Show")

	if recorder.calls != 1 {
		t.Errorf("the reading must be offered once, got %d", recorder.calls)
	}
	if !reflect.DeepEqual(with.got, without.got) || len(with.got) != 1 {
		t.Errorf("a failed write must not change the notice: want %v, got %v", without.got, with.got)
	}
}

// TestEpisodeLandedRecordsOnlyAConfidentPair pins the confidence gate (analysis section 3): the
// landed reading is stored only when the identity assignment gives the landed file exactly the
// episode the download reported, because an automatic write is never overwritten. The notice does
// not depend on the gate and speaks for the long file it measured in every case.
func TestEpisodeLandedRecordsOnlyAConfidentPair(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name  string
		files []string
		want  []episodes.Reading
	}{
		{name: "the file carries the reported episode", files: []string{"Show - 07.mp4", "Show - 08.mp4"},
			want: []episodes.Reading{{Episode: 8, DurationMS: 2_700_000}}},
		{name: "the file carries another episode", files: []string{"Show - 09.mp4"}, want: []episodes.Reading{}},
		{name: "the file carries no number", files: []string{"Show.mp4"}, want: []episodes.Reading{}},
		{name: "the file carries a fractional number", files: []string{"Show - 08.5.mp4"}, want: []episodes.Reading{}},
		{name: "two files claim the episode", files: []string{"A - 08.mp4", "B - 08.mp4"}, want: []episodes.Reading{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			folder := folderWith(t, tc.files...)
			touchedLast(t, folder, tc.files[len(tc.files)-1])
			store := openDurations(t)
			notifier := &notifierRecords{}
			newCoordinator(t, &proberAnswers{runtime: 45 * time.Minute}, notifier).WithRecorder(store).
				EpisodeLanded(context.Background(), folder, tv(), 8, "anime-1", "Show")

			if got := storedReadings(t, store, "anime-1"); !slices.Equal(got, tc.want) {
				t.Errorf("stored readings: want %v, got %v", tc.want, got)
			}
			if len(notifier.got) != 1 {
				t.Errorf("the notice is unchanged by the gate: want 1, got %d", len(notifier.got))
			}
		})
	}
}

package anime

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/duration/probe"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/anime/notice"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/config"
)

// readingStub answers every probe with one runtime and records what it was asked.
type readingStub struct {
	runtime time.Duration
	asked   []string
}

func (s *readingStub) Probe(_ context.Context, path string) (time.Duration, error) {
	s.asked = append(s.asked, path)
	return s.runtime, nil
}

// byNameReading answers long for a file whose name starts with "Long" and ordinary otherwise, so two
// rows in one read can disagree.
type byNameReading struct {
	long     time.Duration
	ordinary time.Duration
	asked    []string
}

func (s *byNameReading) Probe(_ context.Context, path string) (time.Duration, error) {
	s.asked = append(s.asked, path)
	if strings.HasPrefix(filepath.Base(path), "Long") {
		return s.long, nil
	}
	return s.ordinary, nil
}

// scheduleQuery answers the one read a schedule needs. The embedded interface leaves every other method
// to panic if the read path ever reaches one, which is what a test wants.
type scheduleQuery struct {
	EpisodeQuery
	animes []contracts.MobileAnime
}

func (q scheduleQuery) ListMobileAnimes(context.Context) ([]contracts.MobileAnime, error) {
	return q.animes, nil
}

// dayAnime is one anime of the day pointing at folder.
func dayAnime(id, folder string, progress float64, kind *int) contracts.MobileAnime {
	return contracts.MobileAnime{
		ID:              id,
		Name:            id,
		Active:          1,
		EpisodesWatched: progress,
		Kind:            kind,
		Folder:          &folder,
		Days:            []contracts.MobileAnimeDay{{Day: "Monday", Order: 1}},
	}
}

// episodeFolder writes one file per name into a fresh folder.
func episodeFolder(t *testing.T, names ...string) string {
	t.Helper()

	folder := t.TempDir()
	for _, name := range names {
		if err := os.WriteFile(filepath.Join(folder, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	return folder
}

// markedRows is the schedule of the day under test, and the mark each of its rows must carry.
func markedRows(t *testing.T) ([]contracts.MobileAnime, map[string]bool) {
	t.Helper()

	tv := 0
	return []contracts.MobileAnime{
		dayAnime("Long", episodeFolder(t, "Long - 01.mp4", "Long - 02.mp4"), 1, &tv),
		dayAnime("Short", episodeFolder(t, "Short - 01.mp4", "Short - 02.mp4"), 1, &tv),
		dayAnime("Gone", filepath.Join(t.TempDir(), "gone"), 1, &tv),
		dayAnime("Empty", episodeFolder(t), 1, &tv),
	}, map[string]bool{"Long": true, "Short": false, "Gone": false, "Empty": false}
}

func TestListEpisodeScheduleMarksOnlyTheRowWhoseNextEpisodeRunsLong(t *testing.T) {
	t.Parallel()

	animes, want := markedRows(t)
	prober := &byNameReading{long: 45 * time.Minute, ordinary: 24 * time.Minute}
	service := NewEpisodeService(EpisodeServiceDeps{
		Query: scheduleQuery{animes: animes},
		Marks: notice.New(media.New(config.VideoFileExtensions), prober, nil),
	})

	items, err := service.ListEpisodeSchedule(context.Background(), EpisodeScheduleQuery{Day: "Monday"})
	if err != nil {
		t.Fatalf("list schedule: %v", err)
	}
	if len(items) != len(animes) {
		t.Fatalf("one row per active anime: want %d, got %d", len(animes), len(items))
	}
	for _, item := range items {
		if item.LongNextEpisode != want[item.AnimeID] {
			t.Errorf("%s: want mark %v, got %v", item.AnimeID, want[item.AnimeID], item.LongNextEpisode)
		}
	}
}

func TestListEpisodeScheduleWithoutCoordinationMarksNothingAndFailsNothing(t *testing.T) {
	t.Parallel()

	animes, _ := markedRows(t)
	service := NewEpisodeService(EpisodeServiceDeps{Query: scheduleQuery{animes: animes}})

	items, err := service.ListEpisodeSchedule(context.Background(), EpisodeScheduleQuery{Day: "Monday"})
	if err != nil {
		t.Fatalf("an unwired coordination must not fail the read: %v", err)
	}
	for _, item := range items {
		if item.LongNextEpisode {
			t.Errorf("%s: nothing can be marked without a coordination", item.AnimeID)
		}
	}
}

func TestListEpisodeScheduleMeasuresTheNextEpisodeAndWritesNothing(t *testing.T) {
	t.Parallel()

	tv := 0
	folder := episodeFolder(t, "Show - 01.mp4", "Show - 02.mp4")
	before := folderContents(t, folder)
	prober := &readingStub{runtime: 45 * time.Minute}
	service := NewEpisodeService(EpisodeServiceDeps{
		Query: scheduleQuery{animes: []contracts.MobileAnime{dayAnime("Show", folder, 1, &tv)}},
		Marks: notice.New(media.New(config.VideoFileExtensions), prober, nil),
	})

	items, err := service.ListEpisodeSchedule(context.Background(), EpisodeScheduleQuery{Day: "Monday"})
	if err != nil {
		t.Fatalf("list schedule: %v", err)
	}
	if len(items) != 1 || !items[0].LongNextEpisode {
		t.Fatalf("want one marked row, got %v", items)
	}
	if len(prober.asked) != 1 || !strings.HasSuffix(prober.asked[0], "Show - 02.mp4") {
		t.Errorf("only the next episode may be measured, got %v", prober.asked)
	}
	// Acceptance case 8: the read measures and speaks, and writes nothing at all.
	if after := folderContents(t, folder); after != before {
		t.Errorf("the folder must be untouched:\nbefore:\n%s\nafter:\n%s", before, after)
	}
}

// folderContents lists what a folder holds, so a test can prove nothing was written.
func folderContents(t *testing.T, folder string) string {
	t.Helper()

	entries, err := os.ReadDir(folder)
	if err != nil {
		t.Fatalf("read %s: %v", folder, err)
	}
	var listing strings.Builder
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			t.Fatalf("info %s: %v", entry.Name(), err)
		}
		listing.WriteString(entry.Name() + "@" + info.ModTime().String() + "\n")
	}
	return listing.String()
}

// TestListEpisodeScheduleCostWithRealProbes measures what a day of anime really costs, which is the
// number the rejected duration cache was waiting for. It is logged, not asserted: the point is the
// reading, and a slow machine must not turn it into a failure.
func TestListEpisodeScheduleCostWithRealProbes(t *testing.T) {
	t.Parallel()

	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is not on PATH, so no real episodes can be produced here")
	}

	const rows = 8
	animes := make([]contracts.MobileAnime, 0, rows)
	tv := 0
	for i := 0; i < rows; i++ {
		folder := t.TempDir()
		path := filepath.Join(folder, "Show - 02.mp4")
		run := exec.Command(ffmpeg, "-v", "error", "-f", "lavfi",
			"-i", "testsrc=duration=1860:size=16x16:rate=1",
			"-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path, "-y")
		if out, err := run.CombinedOutput(); err != nil {
			t.Fatalf("ffmpeg could not produce the fixture: %v (%s)", err, out)
		}
		animes = append(animes, dayAnime("Show"+strconv.Itoa(i), folder, 1, &tv))
	}

	service := NewEpisodeService(EpisodeServiceDeps{
		Query: scheduleQuery{animes: animes},
		Marks: notice.New(media.New(config.VideoFileExtensions), probe.NewFFProbe(""), nil),
	})

	started := time.Now()
	items, err := service.ListEpisodeSchedule(context.Background(), EpisodeScheduleQuery{Day: "Monday"})
	if err != nil {
		t.Fatalf("list schedule: %v", err)
	}
	elapsed := time.Since(started)

	for _, item := range items {
		if !item.LongNextEpisode {
			t.Fatalf("%s: a real thirty-one minute episode must be marked, got %v", item.AnimeID, items)
		}
	}
	t.Logf("dia con %d filas, ffprobe real: %v en total (%v por fila)",
		len(items), elapsed, elapsed/time.Duration(len(items)))
}

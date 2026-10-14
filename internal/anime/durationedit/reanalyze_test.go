package durationedit

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
)

// ms returns minutes as milliseconds.
func ms(minutes time.Duration) int64 { return (minutes * time.Minute).Milliseconds() }

// resultsByEpisode maps each review row's episode to its result.
func resultsByEpisode(review Review) map[int]string {
	results := map[int]string{}
	for _, row := range review.Rows {
		results[row.Episode] = row.Result
	}
	return results
}

func TestReanalyzeComparesEveryReadingAndWritesNothing(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	ctx := context.Background()
	if _, err := f.store.FillGaps(ctx, "a", []episodes.Reading{
		{Episode: 1, DurationMS: ms(24)}, {Episode: 2, DurationMS: ms(23)}, {Episode: 4, DurationMS: ms(24)},
	}); err != nil {
		t.Fatalf("fill: %v", err)
	}
	if err := f.store.SetManual(ctx, "a", 3, ms(24)); err != nil {
		t.Fatalf("manual: %v", err)
	}
	before, err := f.store.ByAnime(ctx, "a")
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	folder := folderWith(t, "Show - 01.mkv", "Show - 02.mkv", "Show - 03.mkv", "Show - 04.mkv", "Show - 05.mkv",
		"Show - 05.5.mkv")
	f.prober.runtimes = map[string]time.Duration{
		"Show - 01.mkv": 24*time.Minute + 10*time.Second, "Show - 02.mkv": 46 * time.Minute,
		"Show - 03.mkv": 47 * time.Minute, "Show - 05.mkv": 25 * time.Minute,
	}
	var seen []Progress

	review, err := f.service.Reanalyze(ctx, Anime{ID: "a", Folder: folder}, func(p Progress) { seen = append(seen, p) })
	if err != nil {
		t.Fatalf("reanalyze: %v", err)
	}

	if review.Status != StatusOK || review.FilesRecognized != 5 {
		t.Fatalf("want ok with 5 files recognized, got %+v", review)
	}
	assertResults(t, review, map[int]string{1: ResultUnchanged, 2: ResultUpdate, 3: ResultManualKept, 4: ResultUnreadable,
		5: ResultAdd, 0: ResultSkipped})
	update := review.Rows[2]
	if update.Episode != 2 || update.CurrentMinutes != 23 || update.MeasuredMinutes != 46 || update.MeasuredMS != ms(46) ||
		update.CurrentSource != episodes.SourceMeasured || update.Basename != "Show - 02.mkv" {
		t.Errorf("the update row must carry both values, got %+v", update)
	}
	if skipped := review.Rows[0]; skipped.Basename != "Show - 05.5.mkv" || skipped.Detail == "" {
		t.Errorf("the half episode must be skipped with its reason, got %+v", skipped)
	}
	if len(seen) != 5 || seen[0] != (Progress{Index: 1, Total: 5, Episode: 1}) || seen[4] != (Progress{Index: 5, Total: 5, Episode: 5}) {
		t.Errorf("want progress before each of the 5 files, got %+v", seen)
	}
	assertUnchanged(t, f.store, before)
}

// assertResults checks the review holds exactly the wanted result per episode.
func assertResults(t *testing.T, review Review, want map[int]string) {
	t.Helper()

	got := resultsByEpisode(review)
	if len(got) != len(want) {
		t.Fatalf("want results %v, got %v (%+v)", want, got, review.Rows)
	}
	for episode, result := range want {
		if got[episode] != result {
			t.Errorf("episode %d: want %s, got %s", episode, result, got[episode])
		}
	}
}

// assertUnchanged checks anime a still stores exactly before.
func assertUnchanged(t *testing.T, store *episodes.Store, before []episodes.Duration) {
	t.Helper()

	after, err := store.ByAnime(context.Background(), "a")
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(after) != len(before) {
		t.Fatalf("a re-analysis must write nothing: before %+v, after %+v", before, after)
	}
	for i := range before {
		if after[i] != before[i] {
			t.Errorf("a re-analysis must write nothing: before %+v, after %+v", before[i], after[i])
		}
	}
}

func TestReanalyzeStatuses(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	ctx := context.Background()

	for _, tc := range []struct {
		name   string
		folder string
		want   string
	}{
		{name: "no folder", want: StatusNoFolder},
		{name: "a missing folder", folder: filepath.Join(t.TempDir(), "gone"), want: StatusFolderMissing},
		{name: "a folder with no recognizable episode", folder: folderWith(t, "notes.mkv"), want: StatusNoFiles},
		{name: "an empty folder", folder: folderWith(t), want: StatusNoFiles},
	} {
		review, err := f.service.Reanalyze(ctx, Anime{ID: "a", Folder: tc.folder}, nil)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if review.Status != tc.want {
			t.Errorf("%s: want %s, got %+v", tc.name, tc.want, review)
		}
		if len(f.prober.asked) != 0 {
			t.Errorf("%s: nothing may be probed, got %v", tc.name, f.prober.asked)
		}
	}
}

func TestReanalyzeStopsWhenTheProbeIsMissing(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	f.prober.err = &exec.Error{Name: "ffprobe", Err: exec.ErrNotFound}
	folder := folderWith(t, "Show - 01.mkv", "Show - 02.mkv")

	review, err := f.service.Reanalyze(context.Background(), Anime{ID: "a", Folder: folder}, nil)
	if err != nil {
		t.Fatalf("reanalyze: %v", err)
	}

	if review.Status != StatusProbeUnavailable || len(review.Rows) != 0 || review.FilesRecognized != 2 {
		t.Fatalf("want probe unavailable and no rows, got %+v", review)
	}
	if len(f.prober.asked) != 1 {
		t.Errorf("a missing probe must stop at the first file, got %v", f.prober.asked)
	}
}

func TestReanalyzeInterruptedWhenTheFolderStopsResponding(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	ctx := context.Background()
	if _, err := f.store.FillGaps(ctx, "a", []episodes.Reading{{Episode: 3, DurationMS: ms(24)}}); err != nil {
		t.Fatalf("fill: %v", err)
	}
	folder := folderWith(t, "Show - 01.mkv", "Show - 02.mkv", "Show - 03.mkv")
	f.prober.runtimes = map[string]time.Duration{"Show - 01.mkv": 46 * time.Minute}
	f.prober.onProbe = func(path string) {
		if filepath.Base(path) == "Show - 02.mkv" {
			if err := os.RemoveAll(folder); err != nil {
				t.Errorf("remove folder: %v", err)
			}
		}
	}

	review, err := f.service.Reanalyze(ctx, Anime{ID: "a", Folder: folder}, nil)
	if err != nil {
		t.Fatalf("reanalyze: %v", err)
	}

	if review.Status != StatusInterrupted || len(review.Rows) != 3 {
		t.Fatalf("want interrupted with one row per file, got %+v", review)
	}
	want := map[int]string{1: ResultAdd, 2: ResultNotReached, 3: ResultNotReached}
	got := resultsByEpisode(review)
	for episode, result := range want {
		if got[episode] != result {
			t.Errorf("episode %d: want %s, got %s", episode, result, got[episode])
		}
	}
	if kept := review.Rows[2]; kept.CurrentMinutes != 24 || kept.MeasuredMS != 0 {
		t.Errorf("an episode not reached keeps its current value, got %+v", kept)
	}
}

func TestReanalyzeCancelledLeavesTheRestNotReached(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	folder := folderWith(t, "Show - 01.mkv", "Show - 02.mkv", "Show - 03.mkv")
	f.prober.runtimes = map[string]time.Duration{"Show - 01.mkv": 24 * time.Minute}
	ctx, cancel := context.WithCancel(context.Background())
	f.prober.onProbe = func(string) { cancel() }

	review, err := f.service.Reanalyze(ctx, Anime{ID: "a", Folder: folder}, nil)
	if err != nil {
		t.Fatalf("reanalyze: %v", err)
	}

	if review.Status != StatusCancelled || len(review.Rows) != 3 {
		t.Fatalf("want cancelled with one row per file, got %+v", review)
	}
	if got := resultsByEpisode(review); got[1] != ResultAdd || got[2] != ResultNotReached || got[3] != ResultNotReached || len(f.prober.asked) != 1 {
		t.Errorf("a cancel must stop before the next file, got %v after %v", got, f.prober.asked)
	}
}

func TestComparedRefusesARuntimeBelowOneMillisecond(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	folder := folderWith(t, "Show - 01.mkv")
	f.prober.runtimes = map[string]time.Duration{"Show - 01.mkv": time.Microsecond}

	review, err := f.service.Reanalyze(context.Background(), Anime{ID: "a", Folder: folder}, nil)
	if err != nil {
		t.Fatalf("reanalyze: %v", err)
	}

	if len(review.Rows) != 1 || review.Rows[0].Result != ResultUnreadable || review.Rows[0].MeasuredMS != 0 ||
		review.Rows[0].MeasuredMinutes != 0 {
		t.Fatalf("a sub-millisecond reading is no duration, got %+v", review.Rows)
	}

	f.prober.runtimes = map[string]time.Duration{"Show - 01.mkv": time.Millisecond}
	review, err = f.service.Reanalyze(context.Background(), Anime{ID: "a", Folder: folder}, nil)
	if err != nil {
		t.Fatalf("reanalyze: %v", err)
	}
	if len(review.Rows) != 1 || review.Rows[0].Result != ResultAdd || review.Rows[0].MeasuredMS != 1 {
		t.Fatalf("one millisecond is the shortest duration, got %+v", review.Rows)
	}
}

func TestReanalyzeKeepsSkippedFilesInTheirNameOrder(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	folder := folderWith(t, "Show - 01.mkv", "Show - 05.5.mkv", "Show - 06.5.mkv")
	f.prober.runtimes = map[string]time.Duration{"Show - 01.mkv": 24 * time.Minute}

	review, err := f.service.Reanalyze(context.Background(), Anime{ID: "a", Folder: folder}, nil)
	if err != nil {
		t.Fatalf("reanalyze: %v", err)
	}

	if len(review.Rows) != 3 || review.Rows[0].Basename != "Show - 05.5.mkv" || review.Rows[1].Basename != "Show - 06.5.mkv" ||
		review.Rows[2].Episode != 1 {
		t.Fatalf("want the two skipped files first, in name order, then episode 1, got %+v", review.Rows)
	}
}

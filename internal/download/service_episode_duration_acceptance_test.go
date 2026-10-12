package download

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/anime/notice"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/notification"
)

// fixedReading answers every probe with one runtime, which is how a test states a duration without
// owning a media file. It records the paths it was asked about.
type fixedReading struct {
	runtime time.Duration
	err     error
	paths   []string
}

func (f *fixedReading) Probe(_ context.Context, path string) (time.Duration, error) {
	f.paths = append(f.paths, path)
	if f.err != nil {
		return 0, f.err
	}
	return f.runtime, nil
}

// noticesHeard records every notice the real coordinator raised.
type noticesHeard struct{ got []notification.Notification }

func (n *noticesHeard) Notify(_ context.Context, got notification.Notification) error {
	n.got = append(n.got, got)
	return nil
}

// pathACase is one acceptance case of the download path, stated as data so the test body stays flat.
type pathACase struct {
	name        string
	files       []string
	absent      bool
	newest      string
	kind        *int
	prober      *fixedReading
	wantNotices int
	wantProbes  int
}

func TestPathAAcceptance(t *testing.T) {
	t.Parallel()

	for _, tc := range pathACases() {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			runPathACase(t, tc)
		})
	}
}

// pathACases is the acceptance table: one row per case the scope names for the download path.
func pathACases() []pathACase {
	tv, notTV := 0, 3

	return []pathACase{
		{name: "1 a landed episode over thirty minutes notifies once",
			files: []string{"Show - 01.mp4", "Show - 08.mp4"}, newest: "Show - 08.mp4", kind: &tv,
			prober: &fixedReading{runtime: 45 * time.Minute}, wantNotices: 1, wantProbes: 1},
		{name: "2 a landed episode of ordinary length stays silent",
			files: []string{"Show - 08.mp4"}, kind: &tv,
			prober: &fixedReading{runtime: 24 * time.Minute}, wantProbes: 1},
		{name: "3 an anime that is not TV is never measured",
			files: []string{"Show - 08.mp4"}, kind: &notTV,
			prober: &fixedReading{runtime: 45 * time.Minute}},
		{name: "6 a folder nobody can read stays silent",
			absent: true, kind: &tv, prober: &fixedReading{runtime: 45 * time.Minute}},
		{name: "6 a folder holding no media stays silent",
			kind: &tv, prober: &fixedReading{runtime: 45 * time.Minute}},
		{name: "7 a probe that cannot read the file stays silent",
			files: []string{"Show - 08.mp4"}, kind: &tv,
			prober: &fixedReading{err: errors.New("ffprobe: executable not found")}, wantProbes: 1},
	}
}

// runPathACase drives the real chain from the place a download is declared complete: the download
// service hands the landed episode to the real coordinator, which reads the folder with the real
// inventory and the pipeline's own extension set, measures, classifies, and speaks only when the
// runtime is long.
func runPathACase(t *testing.T, tc pathACase) {
	t.Helper()

	dir := prepareFolder(t, tc)
	before := folderListing(t, dir)
	notifier := &noticesHeard{}
	coordinator := notice.New(media.New(config.VideoFileExtensions), tc.prober, notifier)
	service := NewService(ServiceDeps{EpisodeDurationNotice: coordinator})
	anime := contracts.MobileAnime{ID: "anime-1", Name: "Show", Folder: &dir, Kind: tc.kind}

	service.completeDownloadedEpisode(context.Background(), "run-1", anime, 8)

	if len(notifier.got) != tc.wantNotices {
		t.Fatalf("want %d notices, got %d (%v)", tc.wantNotices, len(notifier.got), notifier.got)
	}
	if tc.wantNotices == 1 && !strings.Contains(notifier.got[0].Body, "Show - 08.mp4") {
		t.Errorf("the notice must name the file that landed, got %q", notifier.got[0].Body)
	}
	if len(tc.prober.paths) != tc.wantProbes {
		t.Errorf("want %d probes, got %d (%v)", tc.wantProbes, len(tc.prober.paths), tc.prober.paths)
	}
	// Acceptance case 8: the feature reads and speaks, and writes nothing at all.
	if after := folderListing(t, dir); after != before {
		t.Errorf("the folder must be untouched:\nbefore:\n%s\nafter:\n%s", before, after)
	}
}

// prepareFolder builds the folder one case points at. An absent folder is returned as a path that
// does not exist, because that is the state under test.
func prepareFolder(t *testing.T, tc pathACase) string {
	t.Helper()

	folder := t.TempDir()
	if tc.absent {
		return filepath.Join(folder, "gone")
	}

	for _, name := range tc.files {
		if err := os.WriteFile(filepath.Join(folder, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	// Stated rather than left to the clock: two files written in the same instant would otherwise
	// make which one landed a matter of timing.
	if tc.newest != "" {
		later := time.Now().Add(time.Hour)
		if err := os.Chtimes(filepath.Join(folder, tc.newest), later, later); err != nil {
			t.Fatalf("chtimes %s: %v", tc.newest, err)
		}
	}

	return folder
}

// folderListing describes what a folder holds, so a test can prove nothing was written.
func folderListing(t *testing.T, folder string) string {
	t.Helper()

	entries, err := os.ReadDir(folder)
	if err != nil {
		// An absent folder is one of the states under test, so it is described instead of failing the
		// fixture: the same description before and after still proves nothing changed.
		return "unreadable: " + err.Error()
	}

	var listing strings.Builder
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			t.Fatalf("info %s: %v", entry.Name(), err)
		}
		listing.WriteString(entry.Name())
		listing.WriteString("@")
		listing.WriteString(info.ModTime().String())
		listing.WriteString("\n")
	}
	return listing.String()
}

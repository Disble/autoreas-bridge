package desktop

import (
	"context"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime/duration/probe"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/anime/notice"
	"autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/notification"
)

// noticesSeen records every notice the wired coordination raised.
type noticesSeen struct{ got []notification.Notification }

// Notify records one notice.
func (n *noticesSeen) Notify(_ context.Context, got notification.Notification) error {
	n.got = append(n.got, got)
	return nil
}

// realEpisode writes a real video file of the requested length into a fresh folder and returns it.
//
// A real file is the point: the extension set, the inventory, ffprobe and the constant rule are all
// exercised on an artifact that really carries this runtime, instead of a number handed to a fake.
func realEpisode(t *testing.T, seconds int, name string) string {
	t.Helper()

	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is not on PATH, so no real episode can be produced here")
	}
	folder := t.TempDir()
	path := filepath.Join(folder, name)
	run := exec.Command(ffmpeg, "-v", "error", "-f", "lavfi",
		"-i", "testsrc=duration="+strconv.Itoa(seconds)+":size=16x16:rate=1",
		"-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path, "-y")
	if out, err := run.CombinedOutput(); err != nil {
		t.Fatalf("ffmpeg could not produce the fixture: %v (%s)", err, out)
	}
	return folder
}

// TestTheWiredNoticeSpeaksForARealLongEpisode is the acceptance that no unit could make on its own: it
// drives the production wiring — the pipeline's extension set, the real inventory, the real ffprobe
// and the constant rule — against a real file that really runs for thirty-one minutes.
func TestTheWiredNoticeSpeaksForARealLongEpisode(t *testing.T) {
	folder := realEpisode(t, 1860, "Show - 08.mp4")
	notifier := &noticesSeen{}
	tv := 0

	newEpisodeDurationNotice(notifier).EpisodeLanded(context.Background(), folder, &tv, 8, "anime-1", "Show")

	if len(notifier.got) != 1 {
		t.Fatalf("a real long episode is exactly one notice, got %d (%v)", len(notifier.got), notifier.got)
	}
	if len(notifier.got[0].Rows) != 1 || notifier.got[0].Rows[0].Name != "Show" {
		t.Errorf("the notice must carry the anime as a row, got %v", notifier.got[0].Rows)
	}
	if !strings.Contains(notifier.got[0].Body, "31") {
		t.Errorf("the notice must carry the measured runtime, got %q", notifier.got[0].Body)
	}
}

// TestTheWiredNoticeIgnoresARealFileThatIsNotOnThePath guards the degradation the design accepts: with
// no ffprobe there is no reading, so there is no notice, and nothing is invented to fill the gap.
func TestTheWiredNoticeIgnoresARealFileThatIsNotOnThePath(t *testing.T) {
	folder := realEpisode(t, 1860, "Show - 08.mp4")
	notifier := &noticesSeen{}
	tv := 0

	missing := notice.New(media.New(config.VideoFileExtensions),
		probe.NewFFProbe("definitely-not-an-ffprobe-binary"), notifier)
	missing.EpisodeLanded(context.Background(), folder, &tv, 8, "anime-1", "Show")

	if len(notifier.got) != 0 {
		t.Fatalf("without a probe there is no reading and no notice, got %v", notifier.got)
	}
}

package notice

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/notification"
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

// tv is the stored type of an Anime (TV).
func tv() *int {
	kind := TVKind
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
	newCoordinator(t, prober, notifier).EpisodeLanded(context.Background(), folder, tv())

	if len(notifier.got) != 1 {
		t.Fatalf("a long episode is exactly one notice, got %d (%v)", len(notifier.got), notifier.got)
	}
	got := notifier.got[0]
	if got.Title == "" {
		t.Error("the notice must carry a title")
	}
	if !strings.Contains(got.Body, "Show - 02.mp4") {
		t.Errorf("the notice must name the file that landed, got %q", got.Body)
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
			newCoordinator(t, tc.prober, notifier).EpisodeLanded(context.Background(), tc.folder(t), tc.kind)

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
		{name: "a file that could not be described is never used", entries: entries("200",
			func(e *identity.Entry) { e.Err = "access denied" }), want: ""},
		{name: "a file that changed while being listed is never used", entries: entries("200",
			func(e *identity.Entry) { e.Changed = true }), want: ""},
		{name: "an empty folder offers nothing", entries: nil, want: ""},
		{name: "an entry at the epoch is not a real reading", entries: entries("0"), want: ""},
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
		EpisodeLanded(context.Background(), folder, tv())
}

// failingNotifier reports a delivery failure, which must never reach the download run.
type failingNotifier struct{}

func (failingNotifier) Notify(context.Context, notification.Notification) error {
	return errors.New("notification adapter down")
}

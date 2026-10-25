package download

import (
	"context"
	"errors"
	"sync"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/logger"
)

// renameCall records one RenameLatestEpisode invocation so tests can assert on
// the canonical name and episode number the pipeline passed down.
type renameCall struct {
	folder    string
	canonical string
	episode   int
}

// svcFakeRenamer records rename requests and can be made to fail, so tests can
// prove a rename failure never costs the run.
type svcFakeRenamer struct {
	mu      sync.Mutex
	calls   []renameCall
	err     error
	onCall  func()
	renamed string
}

func (f *svcFakeRenamer) RenameLatestEpisode(folder, canonicalName string, episode int) (string, error) {
	f.mu.Lock()
	f.calls = append(f.calls, renameCall{folder: folder, canonical: canonicalName, episode: episode})
	onCall := f.onCall
	err := f.err
	renamed := f.renamed
	f.mu.Unlock()
	if onCall != nil {
		onCall()
	}
	if err != nil {
		return "", err
	}
	return renamed, nil
}

// recorded returns a copy of the rename requests seen so far.
func (f *svcFakeRenamer) recorded() []renameCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]renameCall(nil), f.calls...)
}

var _ filesystem.Renamer = (*svcFakeRenamer)(nil)

// renameEventRecorder counts structured log events by event type, so a test can
// assert on which outcome the pipeline actually reported.
type renameEventRecorder struct {
	mu     sync.Mutex
	events []string
}

func (r *renameEventRecorder) Debugf(string, string, ...any) {}
func (r *renameEventRecorder) Infof(string, string, ...any)  {}
func (r *renameEventRecorder) Warnf(string, string, ...any)  {}
func (r *renameEventRecorder) Errorf(string, string, ...any) {}

func (r *renameEventRecorder) Logf(_, _ string, fields logger.Fields, _ string, _ ...any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, fields.EventType)
}

// count returns how many log entries carried the given event type.
func (r *renameEventRecorder) count(eventType string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	total := 0
	for _, event := range r.events {
		if event == eventType {
			total++
		}
	}
	return total
}

var _ logger.Logger = (*renameEventRecorder)(nil)

// renameScenario wires a three-episode catch-up whose downloads all succeed.
func renameScenario(t *testing.T) (ServiceDeps, string) {
	t.Helper()
	deps := baseDeps(t)
	folder := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/rename/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/rename/3/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/rename/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
			"https://jkanime.net/rename/2/": {{URL: "http://mediafire.example/2", Hoster: "Mediafire"}},
			"https://jkanime.net/rename/3/": {{URL: "http://mediafire.example/3", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-1",
		Name:      "NegaPosi Angler",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: todayDiaName(deps.Clock()), Order: 0}},
		SourceURL: new("https://jkanime.net/rename/"),
		Folder:    new(folder),
	}}}
	counter := newCatchupCounter(map[string]int{folder: 0})
	deps.Counter = counter
	deps.JD = &recordingCatchupJD{counter: counter}
	return deps, folder
}

// The canonical name and the episode number both come from the pipeline, which
// already knows exactly which episode it enqueued. Nothing here re-parses a
// hoster filename -- that is the whole reason the feature exists.
func TestRunOnceRenamesEachDownloadedEpisodeWithTheCanonicalNameAndNumber(t *testing.T) {
	t.Parallel()

	deps, folder := renameScenario(t)
	jd := deps.JD.(*recordingCatchupJD)
	deps.RenameEpisodes = func(context.Context) bool { return true }

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("run: %v", err)
	}

	// The base name carries no extension: JD appends the one it actually downloaded,
	// which is the whole reason the rename moved off the filesystem.
	want := []jdRenameCall{
		{destination: folder, base: "NegaPosi Angler - 01"},
		{destination: folder, base: "NegaPosi Angler - 02"},
		{destination: folder, base: "NegaPosi Angler - 03"},
	}
	got := jd.recordedRenames()
	if len(got) != len(want) {
		t.Fatalf("rename calls = %#v, want %#v", got, want)
	}
	for i, call := range want {
		if got[i] != call {
			t.Fatalf("rename call %d = %#v, want %#v", i, got[i], call)
		}
	}
}

func TestRunOnceDoesNotRenameWhenTheSettingIsDisabled(t *testing.T) {
	t.Parallel()

	deps, _ := renameScenario(t)
	fake := &svcFakeRenamer{renamed: "renamed.mp4"}
	deps.Renamer = fake
	deps.RenameEpisodes = func(context.Context) bool { return false }

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("run: %v", err)
	}

	if got := fake.recorded(); len(got) != 0 {
		t.Fatalf("rename calls = %#v, want none while the setting is off", got)
	}
}

// Renaming is a convenience layered on top of a download that already
// succeeded. Letting it fail the run would trade a working episode on disk for
// a cosmetic problem.
func TestRunOnceReportsSuccessWhenRenamingFails(t *testing.T) {
	t.Parallel()

	deps, _ := renameScenario(t)
	deps.JD.(*recordingCatchupJD).renameErr = errors.New("target already exists")
	deps.RenameEpisodes = func(context.Context) bool { return true }

	events := &renameEventRecorder{}
	deps.Logger = events

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if result.Status != RunStatusOK {
		t.Fatalf("status = %q, want %q", result.Status, RunStatusOK)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("run %q not persisted", result.RunID)
	}
	if run.EpisodesDownloaded != 3 || run.EpisodesFailed != 0 {
		t.Fatalf("run = %#v, want 3 downloaded and 0 failed", run)
	}

	// The logs are the only trace a silently unrenamed folder leaves, so a failed
	// rename must not also announce a successful one.
	if got := events.count("download.renamed"); got != 0 {
		t.Fatalf("download.renamed logged %d times, want 0 after a rename failure", got)
	}
	if got := events.count("download.rename_failed"); got != 3 {
		t.Fatalf("download.rename_failed logged %d times, want 3", got)
	}
}

// Production wiring can leave the JD seam nil; with the rename now delegated to
// JDownloader that is the seam which must degrade to "do not rename", never to a panic.
//
// This is exercised directly rather than through RunOnce: a nil JD fails the whole run as
// jd_offline long before an episode completes, so the run-level path can no longer reach
// this guard at all.
func TestRenameDownloadedEpisodeSurvivesANilJDSeam(t *testing.T) {
	t.Parallel()

	deps, folder := renameScenario(t)
	deps.JD = nil
	deps.RenameEpisodes = func(context.Context) bool { return true }

	anime := contracts.MobileAnime{ID: "anime-1", Name: "NegaPosi Angler", Folder: new(folder)}

	// The assertion is the absence of a panic: a missing seam must be a no-op.
	NewService(deps).renameDownloadedEpisode(context.Background(), "run-1", anime, 1)
}

// An unset seam is the default in every existing test and in any wiring that
// predates the feature, so it must mean "off".
func TestRunOnceDoesNotRenameWhenTheSeamIsUnset(t *testing.T) {
	t.Parallel()

	deps, _ := renameScenario(t)
	fake := &svcFakeRenamer{renamed: "renamed.mp4"}
	deps.Renamer = fake
	deps.RenameEpisodes = nil

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("run: %v", err)
	}

	if got := fake.recorded(); len(got) != 0 {
		t.Fatalf("rename calls = %#v, want none when the seam is unset", got)
	}
}

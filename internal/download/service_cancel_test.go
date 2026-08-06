package download

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/download/sites"
)

// ctxHonoringStore rejects writes made with a cancelled context, the way a real
// SQLite store does. The plain fake ignores ctx entirely, which would hide the
// whole point of the terminal-row guarantee: a stopped run must still finalize.
type ctxHonoringStore struct {
	*svcFakeDownloadStore
}

func (s ctxHonoringStore) OpenRun(ctx context.Context, run Run) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return s.svcFakeDownloadStore.OpenRun(ctx, run)
}

func (s ctxHonoringStore) UpdateRunProgress(ctx context.Context, run Run) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return s.svcFakeDownloadStore.UpdateRunProgress(ctx, run)
}

func (s ctxHonoringStore) FinalizeRun(ctx context.Context, run Run) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return s.svcFakeDownloadStore.FinalizeRun(ctx, run)
}

// cancellingJD cancels the run context once the given episode has been enqueued,
// standing in for the user pressing Stop while a download is in flight.
type cancellingJD struct {
	*svcFakeJDClient
	counter     *catchupCounter
	cancel      context.CancelFunc
	cancelAfter int
	enqueued    int
}

func (j *cancellingJD) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	j.enqueued++
	if err := j.svcFakeJDClient.AddAndStart(ctx, deviceName, req); err != nil {
		return err
	}
	j.counter.markRecursiveDownloaded(req.Destination)
	j.counter.Flatten(req.Destination)
	if j.enqueued >= j.cancelAfter {
		j.cancel()
	}
	return nil
}

// cancellableSoloRun wires a three-episode catch-up whose JD client cancels the
// run context after the first episode lands.
func cancellableSoloRun(t *testing.T, cancelAfter int) (ServiceDeps, contracts.MobileAnime, context.Context, context.CancelFunc) {
	t.Helper()

	deps := baseDeps(t)
	folder := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/solo/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/solo/3/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/solo/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
			"https://jkanime.net/solo/2/": {{URL: "http://mediafire.example/2", Hoster: "Mediafire"}},
			"https://jkanime.net/solo/3/": {{URL: "http://mediafire.example/3", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry

	counter := newCatchupCounter(map[string]int{folder: 0})
	deps.Counter = counter
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) { counter.Flatten(folder) }}
	deps.Store = ctxHonoringStore{svcFakeDownloadStore: newsvcFakeDownloadStore()}

	ctx, cancel := context.WithCancel(context.Background())
	deps.JD = &cancellingJD{
		svcFakeJDClient: &svcFakeJDClient{},
		counter:         counter,
		cancel:          cancel,
		cancelAfter:     cancelAfter,
	}

	anime := contracts.MobileAnime{
		ID:        "anime-1",
		Name:      "Solo Anime",
		Active:    1,
		SourceURL: ptrStr("https://jkanime.net/solo/"),
		Folder:    ptrStr(folder),
	}
	return deps, anime, ctx, cancel
}

// Stopping a run is a user action, not a failure: the row must reach a terminal
// "canceled" status rather than being left "running" until the next startup
// reconcile relabels it "interrupted".
func TestRunAnimeFinalizesACancelledRunAsCanceled(t *testing.T) {
	t.Parallel()

	deps, anime, ctx, cancel := cancellableSoloRun(t, 1)
	defer cancel()

	result, err := NewService(deps).RunAnime(ctx, "manual_anime", anime)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusCanceled {
		t.Fatalf("expected status %q, got %q", RunStatusCanceled, result.Status)
	}

	store := deps.Store.(ctxHonoringStore)
	run, ok := store.getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q to be persisted despite the cancelled context", result.RunID)
	}
	if run.Status != RunStatusCanceled {
		t.Fatalf("expected the persisted row to be %q, got %q", RunStatusCanceled, run.Status)
	}
	if run.FinishedAtMs == nil {
		t.Fatalf("expected a cancelled run to carry a finish timestamp")
	}
}

// A stop that only takes effect at the end of the season would not be a stop.
func TestRunAnimeStopsRequestingFurtherEpisodesOnceCancelled(t *testing.T) {
	t.Parallel()

	deps, anime, ctx, cancel := cancellableSoloRun(t, 1)
	defer cancel()

	result, err := NewService(deps).RunAnime(ctx, "manual_anime", anime)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	jd := deps.JD.(*cancellingJD)
	if jd.enqueued != 1 {
		t.Fatalf("expected the run to stop after the episode that was in flight, got %d enqueues", jd.enqueued)
	}
	store := deps.Store.(ctxHonoringStore)
	run, _ := store.getRun(result.RunID)
	if run.EpisodesDownloaded != 1 {
		t.Fatalf("expected exactly the finished episode to count, got %d", run.EpisodesDownloaded)
	}
	// Episodes never attempted because the user stopped are not failures. Without
	// the episode-loop check, episode 2 would enter the pipeline, find every hoster
	// refused, and be recorded as a failure the user never caused.
	if run.EpisodesFailed != 0 {
		t.Fatalf("expected a stopped run to report no failed episodes, got %d", run.EpisodesFailed)
	}
}

// cancelOnFirstHosterJD cancels the run while the FIRST hoster attempt is being
// enqueued, and reports failure so the pipeline would normally fall back.
type cancelOnFirstHosterJD struct {
	*svcFakeJDClient
	cancel   context.CancelFunc
	attempts []string
}

func (j *cancelOnFirstHosterJD) AddAndStart(_ context.Context, _ string, req jdownloader.EnqueueRequest) error {
	j.attempts = append(j.attempts, inferHosterFromURLs(req.URLs))
	j.cancel()
	return errors.New("hoster down")
}

// Falling back to the next hoster costs minutes of watching. A stop must not buy
// the user another hoster attempt.
func TestEnqueueStopsFallingBackToTheNextHosterOnceCancelled(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	deps.Hosters = &svcFakeHosterResolver{order: []HosterPriorityEntry{
		{Hoster: "Mediafire", Priority: 0, Enabled: true},
		{Hoster: "Mega", Priority: 1, Enabled: true},
	}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	jd := &cancelOnFirstHosterJD{svcFakeJDClient: &svcFakeJDClient{}, cancel: cancel}
	deps.JD = jd

	folder := t.TempDir()
	anime := contracts.MobileAnime{ID: "anime-1", Name: "Solo Anime", Active: 1, Folder: ptrStr(folder)}
	ordered := []hosterLink{
		{hoster: "Mediafire", links: []string{"http://mediafire.example/1"}},
		{hoster: "Mega", links: []string{"http://mega.example/1"}},
	}

	enqueued, _ := NewService(deps).enqueueWithFallback(ctx, "run-1", anime, ordered, 1)

	if enqueued {
		t.Fatalf("expected no successful enqueue")
	}
	if len(jd.attempts) != 1 {
		t.Fatalf("expected only the in-flight hoster to be attempted, got %v", jd.attempts)
	}
}

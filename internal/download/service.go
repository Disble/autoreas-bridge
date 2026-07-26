// Package download (this file) implements the orchestration Service (design.md §3.9, §5, §8;
// PR4b/Phase 6). Service.RunOnce is the single entry point invoked by both the schedule.Scheduler
// (trigger="scheduled") and a manual Wails-triggered check (trigger="manual"). It wires together
// every port this package and its siblings (sites, jdownloader, filesystem) define, but is itself
// Wails-free (depguard confines wailsapp/wails/v2 to the composition root, app.go).
//
// Pipeline per design §5: OpenRun (provisional "running") -> read today's active animes via
// AnimeQueryService (READ-ONLY, ADR-5) -> filter by today's Spanish weekday -> per-anime fan-out
// with failure isolation -> EvaluateAnimeForDownload (skip accounting) -> trigger decision
// (NeedsDownload, filesystem is source of truth, ADR-DISK) -> resolve site adapter -> scrape ->
// hoster-ordered enqueue with fallback -> filesystem completion poll -> flatten -> structured
// logging + download.* events + Notifier for user-notable moments -> FinalizeRun.
package download

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

// seasonModeDiaName is the legacy animes.dat sentinel value that marks an anime as a
// "season-mode" title — selected only when the user has enabled "modo temporada" instead of
// the normal weekday-based filter. Isolated here so the literal "Ver hoy" never appears more
// than once in the codebase (design.md Decision 2).
const seasonModeDiaName = "Ver hoy"

// Run status taxonomy (design.md §8): exactly one of these terminal values is ever written by
// FinalizeRun. "running" (defined in store.go's OpenRun default) is provisional-only and never
// terminal.
const (
	RunStatusOK            = "ok"
	RunStatusPartial       = "partial"
	RunStatusError         = "error"
	RunStatusJDOffline     = "jd_offline"
	RunStatusNoAnimesToday = "no_animes_today"
)

// Failure-kind classification (design.md §8, download-sites spec "Failure-Cause
// Classification"): recorded in error_summary / log Metadata, never silently dropped.
const (
	FailureKindCaptcha       = "captcha"
	FailureKindHosterDown    = "hoster_down"
	FailureKindSlowOrTimeout = "slow_or_timeout"
)

// ServiceDeps are the constructor seams for Service (design.md §3.9): every dependency is an
// interface or func so the whole orchestrator is unit-testable with fakes, no network/JD/disk
// access required. Animes is intentionally typed as contracts.AnimeQueryService -- ServiceDeps
// has NO write dependency on the anime context (download-orchestration spec "No Write-Back to
// the Anime Context", ADR-5).
type ServiceDeps struct {
	Animes    contracts.AnimeQueryService
	Sites     SiteRegistry
	Hosters   HosterResolver
	JD        jdownloader.JDClient
	Counter   filesystem.EpisodeCounter
	Flattener filesystem.Flattener
	Store     Store
	Notifier  notification.Notifier
	Bus       events.Bus
	Logger    logger.Logger
	Clock     func() time.Time
	NewRunID  func() string

	// JDDeviceName is the configured MyJDownloader device name used for EnsureOnline/AddAndStart.
	// Empty is valid in tests (fakes ignore it); production wiring (app.go) sources it from the
	// persisted JDConfig.
	JDDeviceName string

	// PollSleep is the injected sleep seam awaitHosterOutcome uses between filesystem/JD-status
	// re-checks (mirrors schedule.Clock/Timer's "nothing in this package ever sleeps on a real
	// clock" discipline). Defaults to a real time.Sleep in production (NewService); unit tests
	// inject a fast/no-op func so a slow_or_timeout path never actually blocks for
	// config.FilesystemCompletionPollTimeout (30 minutes).
	PollSleep func(d time.Duration)

	// SeasonMode reports whether "modo temporada" is enabled. When nil (or in tests that do not
	// set it) it defaults to always-false, i.e. normal weekday selection. Injected as a func —
	// like every other ServiceDeps seam — so download never imports the preferences context
	// (no cross-context coupling, ADR-5).
	SeasonMode func(ctx context.Context) bool
}

// RunResult is the summary RunOnce returns to its caller (the scheduler's RunFunc closure, or a
// manual-trigger Wails binding) -- callers needing the full persisted detail read it back via
// Store.ListRuns / the future ListDownloadRuns binding.
type RunResult struct {
	RunID  string
	Status string
}

// Service is the download orchestrator (design.md §3.9 "Service").
type Service struct {
	deps ServiceDeps
	jdMu sync.Mutex
}

// NewService builds a Service from the given deps, defaulting Clock/NewRunID when unset so
// production wiring (app.go) does not have to supply trivial seams explicitly.
func NewService(deps ServiceDeps) *Service {
	if deps.Clock == nil {
		deps.Clock = time.Now
	}
	if deps.NewRunID == nil {
		deps.NewRunID = defaultRunIDGenerator()
	}
	if deps.PollSleep == nil {
		deps.PollSleep = time.Sleep
	}
	if deps.SeasonMode == nil {
		deps.SeasonMode = func(context.Context) bool { return false }
	}
	return &Service{deps: deps}
}

// defaultRunIDGenerator returns a monotonic, collision-free run ID generator seeded off the wall
// clock at construction time -- good enough for the production single-process scheduler, which
// the concurrent-run guard in schedule.Scheduler already ensures never overlaps.
func defaultRunIDGenerator() func() string {
	return func() string {
		return "run-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
}

// animeRunOutcome is the per-anime fan-out result, isolated from every other anime in the run
// (download-orchestration spec "Per-Anime Fan-Out With Failure Isolation").
type animeRunOutcome struct {
	skipped bool
	checked bool
	// upToDate marks an anime that was evaluated but needed no download (nothing newer
	// online than on-disk, or season already complete on disk). It is NOT a skip -- the
	// anime still counts toward AnimesChecked -- but is tallied into UpToDateCount so the
	// run summary distinguishes "checked and current" from "checked and downloaded".
	upToDate           bool
	episodesFound      int
	episodesDownloaded int
	episodesFailed     int
	manualLinks        []ManualLink
	failed             bool
	failureKind        string
}

type animeProgressDelta = animeRunOutcome

// RunOnce executes one full download-check pipeline pass (design.md §5). It NEVER returns a
// non-nil error for ordinary per-anime or JD-offline degradation -- those are captured in the
// persisted run's Status/ErrorSummary instead, so a scheduler tick or manual trigger always
// completes cleanly. A non-nil error here signals an infrastructure-level failure to even open
// the run row (e.g. the store is unreachable), which the caller (scheduler/Wails binding) MUST
// surface rather than silently swallow.
func (s *Service) RunOnce(ctx context.Context, trigger string) (RunResult, error) {
	runID := s.deps.NewRunID()
	startedAt := s.deps.Clock()

	run := Run{
		RunID:       runID,
		StartedAtMs: startedAt.UnixMilli(),
		Trigger:     trigger,
		Status:      "running",
	}
	if s.deps.Store != nil {
		if err := s.deps.Store.OpenRun(ctx, run); err != nil {
			return RunResult{}, fmt.Errorf("download: open run %q: %w", runID, err)
		}
	}

	s.logf(logger.LevelInfo, runID, "", "download.run_started", nil,
		"download run %s started (trigger=%s)", runID, trigger)
	s.publish(events.DownloadRunStartedEvent{RunID: runID, Trigger: trigger, CorrelationID: runID})
	s.notify(ctx, notification.LevelInfo, runID,
		"Download run started", fmt.Sprintf("Download check started (%s).", trigger))

	result := s.execute(ctx, runID, startedAt, trigger, &run)
	s.finishRunLog(runID, &run)

	return result, nil
}

// RunAnime executes the same catch-up pipeline as RunOnce, but scoped to a single already
// selected anime. The caller owns selection/concurrency policy; the service still persists a
// normal download_runs row and emits the same download lifecycle events so the Downloads UI and
// run history refresh without a second code path.
func (s *Service) RunAnime(ctx context.Context, trigger string, anime contracts.MobileAnime) (RunResult, error) {
	runID := s.deps.NewRunID()
	startedAt := s.deps.Clock()

	run := Run{
		RunID:       runID,
		StartedAtMs: startedAt.UnixMilli(),
		Trigger:     trigger,
		Status:      "running",
	}
	if s.deps.Store != nil {
		if err := s.deps.Store.OpenRun(ctx, run); err != nil {
			return RunResult{}, fmt.Errorf("download: open run %q: %w", runID, err)
		}
	}

	s.logf(logger.LevelInfo, runID, anime.ID, "download.run_started", nil,
		"download run %s started (trigger=%s, anime=%s)", runID, trigger, anime.Name)
	s.publish(events.DownloadRunStartedEvent{RunID: runID, Trigger: trigger, CorrelationID: runID})
	s.notify(ctx, notification.LevelInfo, runID,
		"Anime download started", fmt.Sprintf("Download check started for %s.", anime.Name))

	result := s.executeAnimeLive(ctx, runID, &run, anime)
	s.finishRunLog(runID, &run)

	return result, nil
}

// execute runs the actual pipeline body and mutates run in place before FinalizeRun persists it.
// Splitting this out of RunOnce keeps the "always persist a terminal row" guarantee in one place
// (a defer would be more idiomatic, but explicit finalize calls at each early-return keep the
// terminal status selection readable per branch -- design §5's four sequence diagrams each have
// a distinct terminal status).
func (s *Service) execute(ctx context.Context, runID string, startedAt time.Time, trigger string, run *Run) RunResult {
	animes, err := s.listActiveAnimesToday(ctx)
	if err != nil {
		run.Status = RunStatusError
		run.ErrorSummary = err.Error()
		s.finalize(ctx, run)
		return RunResult{RunID: runID, Status: run.Status}
	}

	if len(animes) == 0 {
		run.Status = RunStatusNoAnimesToday
		s.finalize(ctx, run)
		return RunResult{RunID: runID, Status: run.Status}
	}

	return s.executeAnimes(ctx, runID, run, animes)
}

// executeAnimes runs the selected anime fan-out and finalizes its aggregate result. JDownloader
// is never contacted here -- the lazy jdGate defers EnsureOnline until an anime actually
// discovers a missing episode (see downloadAvailableEpisodes), so a run where every anime is
// already up to date, skipped, or fails at listing never launches the JDownloader exe.
func (s *Service) executeAnimes(ctx context.Context, runID string, run *Run, animes []contracts.MobileAnime) RunResult {
	var progressMu sync.Mutex
	applyDelta := func(delta animeProgressDelta) {
		progressMu.Lock()
		defer progressMu.Unlock()
		applyProgressDelta(run, delta)
		snapshot := cloneRun(*run)
		s.recordProgress(ctx, &snapshot)
	}

	gate := s.newJDGateForRun(ctx, runID, run, &progressMu)

	anyFailed, anySucceeded := s.processAnimes(ctx, runID, animes, gate, applyDelta)
	s.setRunCompletionStatus(ctx, runID, run, gate, anyFailed, anySucceeded)

	s.finalize(ctx, run)
	return RunResult{RunID: runID, Status: run.Status}
}

// newJDGateForRun builds a jdGate whose onResolve callback records JD availability on run
// (guarded by runMu -- the same mutex applyDelta uses) and publishes the JD status event/progress
// snapshot the first (and only) time any anime actually needs to launch JDownloader. If the gate
// never resolves, run.JDAvailable stays false and no JD status event is ever published.
func (s *Service) newJDGateForRun(ctx context.Context, runID string, run *Run, runMu *sync.Mutex) *jdGate {
	return newJDGate(s.ensureJDOnline, func(online bool) {
		runMu.Lock()
		run.JDAvailable = online
		snapshot := cloneRun(*run)
		runMu.Unlock()
		s.publish(events.DownloadJDStatusEvent{RunID: runID, Online: online, CorrelationID: runID})
		s.recordProgress(ctx, &snapshot)
	})
}

// processAnimes concurrently processes selected animes and summarizes their outcomes.
func (s *Service) processAnimes(ctx context.Context, runID string, animes []contracts.MobileAnime, gate *jdGate, applyDelta func(animeProgressDelta)) (bool, bool) {
	outcomes := make(chan animeRunOutcome, len(animes))
	var wg sync.WaitGroup
	for _, anime := range animes {
		anime := anime
		wg.Add(1)
		go func() { defer wg.Done(); outcomes <- s.processAnime(ctx, runID, anime, gate, applyDelta) }()
	}
	wg.Wait()
	close(outcomes)
	return summarizeAnimeOutcomes(outcomes)
}

// summarizeAnimeOutcomes reports whether any anime failed or succeeded.
func summarizeAnimeOutcomes(outcomes <-chan animeRunOutcome) (bool, bool) {
	anyFailed, anySucceeded := false, false
	for outcome := range outcomes {
		anyFailed = anyFailed || outcome.failed
		anySucceeded = anySucceeded || outcome.episodesDownloaded > 0 || (!outcome.failed && outcome.episodesFound == 0)
	}
	return anyFailed, anySucceeded
}

// setRunCompletionStatus assigns the terminal status and related notification.
func (s *Service) setRunCompletionStatus(ctx context.Context, runID string, run *Run, gate *jdGate, anyFailed, anySucceeded bool) {
	switch {
	case gate.knownOffline() && len(run.ManualLinks) > 0:
		run.Status = RunStatusJDOffline
		s.notify(ctx, notification.LevelWarning, runID, "MyJDownloader offline", fmt.Sprintf("%d episode(s) need manual download -- see run details.", len(run.ManualLinks)))
	case anyFailed && anySucceeded:
		run.Status = RunStatusPartial
		s.notify(ctx, notification.LevelWarning, runID, "Download run completed with errors", "Some animes failed to download -- see run details.")
	case anyFailed:
		run.Status = RunStatusError
		s.notify(ctx, notification.LevelError, runID, "Download run failed", "All animes failed to download -- see run details.")
	default:
		run.Status = RunStatusOK
		if run.EpisodesDownloaded > 0 {
			s.notify(ctx, notification.LevelSuccess, runID, "Download run completed", fmt.Sprintf("%d episode(s) downloaded.", run.EpisodesDownloaded))
		}
	}
}

// applyProgressDelta adds one anime's progress delta to the aggregate run.
func applyProgressDelta(run *Run, delta animeProgressDelta) {
	if delta.skipped {
		run.SkippedCount++
	}
	if delta.checked {
		run.AnimesChecked++
	}
	if delta.upToDate {
		run.UpToDateCount++
	}
	run.EpisodesFound += delta.episodesFound
	run.EpisodesDownloaded += delta.episodesDownloaded
	run.EpisodesFailed += delta.episodesFailed
	run.ManualLinks = append(run.ManualLinks, delta.manualLinks...)
}

// cloneRun copies a run and its mutable manual-link slice.
func cloneRun(run Run) Run {
	run.ManualLinks = append([]ManualLink(nil), run.ManualLinks...)
	return run
}

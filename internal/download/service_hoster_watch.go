package download

import (
	"context"
	"io/fs"
	"path/filepath"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
)

// hosterVerdict is classifyJDStatus's pure policy output (design.md "Split port (signals) from
// orchestration (classification)").
type hosterVerdict int

const (
	verdictDownloading hosterVerdict = iota
	// verdictFinishedOK exists for classifier completeness only -- it MUST NEVER be used to
	// declare run success; the filesystem poll remains the sole success authority (see
	// awaitHosterOutcome and download-orchestration spec "Filesystem Is Success Truth, JD Status
	// Is Failure Truth").
	verdictFinishedOK
	verdictDead
)

// classifyJDStatus resolves a DestinationStatus to exactly one hosterVerdict (download-sites spec
// "JD Status Classification by Destination Folder"). It uses ONLY the structured signals
// (Availability-derived counts, the Finished/Running/Skipped booleans) -- it MUST NEVER
// string-match a free-form Status field, which this neutral struct does not even carry.
func classifyJDStatus(st jdownloader.DestinationStatus) hosterVerdict {
	if !st.Matched {
		return verdictDownloading
	}

	if st.CrawlOnlineCount > 0 {
		return verdictDownloading
	}

	for _, link := range st.Links {
		if link.Running {
			return verdictDownloading
		}
	}

	for _, pkg := range st.PackageSignals {
		if pkg.RunningObserved && pkg.Running {
			return verdictDownloading
		}
	}

	if st.CrawlOfflineCount > 0 {
		return verdictDead
	}

	for _, link := range st.Links {
		if link.Finished {
			return verdictFinishedOK
		}
	}

	return verdictDownloading
}

// hosterOutcomeKind is awaitHosterOutcome's terminal result.
type hosterOutcomeKind int

const (
	hosterOutcomeSuccess hosterOutcomeKind = iota
	hosterOutcomeDead
	hosterOutcomeTimeout
)

// hosterOutcome is the result of watching a single hoster attempt to completion, failure, or
// timeout.
type hosterOutcome struct {
	kind hosterOutcomeKind
}

// hasPartFilesRecursive reports whether any file ending in ".part" exists under root, which is
// filesystem evidence that JDownloader has begun a download transfer.
func hasPartFilesRecursive(root string) bool {
	found := false
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() && len(d.Name()) > 5 && d.Name()[len(d.Name())-5:] == ".part" {
			found = true
			return filepath.SkipAll
		}
		return nil
	})
	return found
}

// detectDownloadStartPhase waits for filesystem evidence that JDownloader has begun a download
// transfer (FASE 1 of awaitHosterOutcome). Sleeps 20s for JD to begin, then checks for .part
// files up to 3 times at 20s intervals (60s total grace). Tests skip this via
// DetectStartPhaseDisabled=true.
//
// It returns the ordered timeline of the checks it made, so the caller can persist WHEN each
// probe ran and what it saw. attemptStart is the instant the attempt began (see probe); the
// disabled test seam returns before any probe is recorded, exactly as it returned no outcome
// before.
func (s *Service) detectDownloadStartPhase(ctx context.Context, runID, animeID, folder string, episode int, attemptStart time.Time) (bool, []probe) {
	if s.deps.DetectStartPhaseDisabled {
		return true, nil
	}

	pf := s.deps.HasPartFiles
	if pf == nil {
		pf = hasPartFilesRecursive
	}

	s.deps.PollSleep(20 * time.Second)

	var probes []probe
	for i := range 3 {
		found := pf(folder)
		probes = append(probes, probe{elapsedMs: s.deps.Clock().Sub(attemptStart).Milliseconds(), found: found})
		if found {
			s.logf(logger.LevelInfo, runID, animeID, "download.detect_start_succeeded",
				map[string]any{"episode": episode, "probes": probeMetadata(probes)},
				"anime %s: episode %d transfer evidence found on probe %d of the 60s grace", animeID, episode, len(probes))
			s.publish(events.DownloadEpisodeDownloadingEvent{RunID: runID, AnimeID: animeID, Episode: episode, CorrelationID: runID})
			return true, probes
		}

		if i < 2 {
			s.deps.PollSleep(20 * time.Second)
		}
	}

	return false, probes
}

// jdPreCheckIsDead queries JD once before the 60s grace to check whether CrawlOfflineCount
// already confirms the hoster is dead. If so a Remove+progress event fires and the caller
// can immediately fall back without waiting. Returns true when the hoster was confirmed dead.
func (s *Service) jdPreCheckIsDead(ctx context.Context, runID string, anime contracts.MobileAnime, hoster, folder string) bool {
	if s.deps.JD == nil {
		return false
	}
	status, err := s.deps.JD.PackageStatusByDestination(ctx, s.deps.JDDeviceName, folder)
	if err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.jd_status_query_failed",
			map[string]any{"hoster": hoster}, "anime %s: JD pre-check query failed for hoster %s: %v", anime.Name, hoster, err)
		return false
	}
	if classifyJDStatus(status) != verdictDead {
		return false
	}
	s.jdRemove(ctx, runID, anime, hoster, folder, exitPrecheckDead, &status)
	return true
}

// hasPositiveJDSignal reports whether JD has a confirmed-alive signal for a destination:
// crawl OnlineCount > 0, or any package/link is Running. Used after FASE 1's 60s grace to
// avoid false-dead verdicts when JD is simply slow to start the transfer (e.g. fallback hosters
// whose links are still being crawled).
func hasPositiveJDSignal(st jdownloader.DestinationStatus) bool {
	if st.CrawlOnlineCount > 0 {
		return true
	}
	for _, pkg := range st.PackageSignals {
		if pkg.RunningObserved && pkg.Running {
			return true
		}
	}
	for _, link := range st.Links {
		if link.Running {
			return true
		}
	}
	return false
}

// awaitHosterOutcome watches one hoster attempt through four assessments
// (docs/design/download-watcher-unified-phases.md):
//
//	PRE-CHECK: one JD API call — CrawlOfflineCount > 0 means immediate DEAD, no 60s wait.
//	FASE 1:    60s filesystem-only grace (.part + video checks).
//	FASE 1B:   after 60s of no filesystem evidence, one more JD API call:
//	           - DEAD (OfflineCount > 0)     → fallback
//	           - ALIVE (OnlineCount/Running) → DownloadEpisodeDownloadingEvent → FASE 2
//	           - UNKNOWN (no clear signal)   → firstHoster DEAD, fallback TIMEOUT
//	FASE 2:    downloading → completed (filesystem-only 15s tick, 30 min safety cap).
//
// JD API is called at most twice per hoster attempt; FASE 2 never calls it.
func (s *Service) awaitHosterOutcome(ctx context.Context, runID string, anime contracts.MobileAnime, hoster string, baselineCount int, episode int, isFirstHoster bool) hosterOutcome {
	// attemptStart anchors every probe offset this attempt records. What separates it from the
	// real enqueue instant is one mutex unlock and one error check, so it is enqueue-equivalent
	// for every decision the offsets serve -- and capturing it here costs this function no
	// signature change.
	attemptStart := s.deps.Clock()
	folder := derefOrEmpty(anime.Folder)
	if s.deps.Counter == nil {
		return hosterOutcome{kind: hosterOutcomeTimeout}
	}

	if s.downloadedEpisodeBaseline(folder) > baselineCount {
		s.flattenDownloadFolder(ctx, runID, anime)
		return hosterOutcome{kind: hosterOutcomeSuccess}
	}

	// ────────────────── PRE-CHECK ──────────────────
	if s.jdPreCheckIsDead(ctx, runID, anime, hoster, folder) {
		return hosterOutcome{kind: hosterOutcomeDead}
	}

	// ────────────────── FASE 1 ──────────────────
	started, probes := s.detectDownloadStartPhase(ctx, runID, anime.ID, folder, episode, attemptStart)
	if !started {
		if outcome := s.evaluateJDAfterGrace(ctx, runID, anime, hoster, folder, episode, isFirstHoster, probes); outcome != nil {
			return *outcome
		}
	}

	// ────────────────── FASE 2 ──────────────────
	deadline := s.deps.Clock().Add(config.FilesystemCompletionPollTimeout)
	for {
		if s.downloadedEpisodeBaseline(folder) > baselineCount {
			s.completeDownloadedEpisode(ctx, runID, anime, episode)
			return hosterOutcome{kind: hosterOutcomeSuccess}
		}

		if s.deps.Flattener != nil && s.downloadedEpisodeRecursive(folder) > baselineCount {
			_, _ = s.deps.Flattener.Flatten(ctx, folder)
		}

		if s.deps.Clock().After(deadline) || ctx.Err() != nil {
			return hosterOutcome{kind: hosterOutcomeTimeout}
		}
		s.deps.PollSleep(config.FilesystemCompletionPollInterval)
	}
}

// evaluateJDAfterGrace runs FASE 1B: after 60s without filesystem evidence, queries JD once more to
// determine whether the hoster is definitively dead (outcome Dead), unknown (outcome Timeout), or
// alive. When alive the Downloading event is published and a NIL outcome tells the caller to
// proceed to FASE 2 -- on that path no outcome struct exists at all, so there is no sentinel a
// later field could be stamped onto by mistake.
//
// probes is the detect phase's timeline; it is persisted here because this is where the failure to
// observe a transfer start is first recorded.
func (s *Service) evaluateJDAfterGrace(ctx context.Context, runID string, anime contracts.MobileAnime, hoster, folder string, episode int, isFirstHoster bool, probes []probe) *hosterOutcome {
	s.logf(logger.LevelWarn, runID, anime.ID, "download.detect_start_failed",
		map[string]any{"failureKind": FailureKindHosterDown, "hoster": hoster, "probes": probeMetadata(probes)},
		"anime %s: hoster %s has no .part evidence after 60s, checking JD", anime.Name, hoster)

	if s.deps.JD == nil {
		return firstHosterOutcome(isFirstHoster)
	}

	status, err := s.deps.JD.PackageStatusByDestination(ctx, s.deps.JDDeviceName, folder)
	if err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.jd_status_query_failed",
			map[string]any{"hoster": hoster}, "anime %s: JD post-grace query failed for hoster %s: %v", anime.Name, hoster, err)
		if isFirstHoster {
			s.jdRemove(ctx, runID, anime, hoster, folder, exitGraceQueryErrorFirst, nil)
		}
		return firstHosterOutcome(isFirstHoster)
	}

	if classifyJDStatus(status) == verdictDead {
		s.jdRemove(ctx, runID, anime, hoster, folder, exitGraceClassifiedDead, &status)
		return &hosterOutcome{kind: hosterOutcomeDead}
	}

	if hasPositiveJDSignal(status) {
		s.publish(events.DownloadEpisodeDownloadingEvent{RunID: runID, AnimeID: anime.ID, Episode: episode, CorrelationID: runID})
		return nil
	}

	if isFirstHoster {
		s.jdRemove(ctx, runID, anime, hoster, folder, exitGraceNoSignalFirst, &status)
	}
	return firstHosterOutcome(isFirstHoster)
}

// firstHosterOutcome maps a post-grace dead end to its outcome: the first hoster is declared dead
// so the run falls back immediately, while a fallback hoster only times out.
func firstHosterOutcome(isFirstHoster bool) *hosterOutcome {
	if isFirstHoster {
		return &hosterOutcome{kind: hosterOutcomeDead}
	}
	return &hosterOutcome{kind: hosterOutcomeTimeout}
}

// jdRemove removes JD packages for a destination and publishes a progress event. Best-effort:
// a failing Remove is Warn-logged and execution continues.
//
// The removal is destructive and irreversible, so it is recorded BEFORE it happens, on EVERY
// path -- a removal that succeeds used to leave no trace at all, which is exactly how two
// removals of finished work went unrecorded. stage names which of the four removal sites fired
// and is written into the message text as well as the metadata, because persisted metadata has
// no filter dimension. A nil status means no status was observed (see jdRemovedMetadata).
func (s *Service) jdRemove(ctx context.Context, runID string, anime contracts.MobileAnime, hoster, folder string, stage exitReason, status *jdownloader.DestinationStatus) {
	if s.deps.JD == nil {
		return
	}
	s.logf(logger.LevelWarn, runID, anime.ID, "download.jd_removed",
		jdRemovedMetadata(hoster, stage, status),
		"anime %s: removing JD packages for hoster %s at stage %s", anime.Name, hoster, stage)
	if err := s.deps.JD.RemoveByDestination(ctx, s.deps.JDDeviceName, folder); err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.jd_remove_failed",
			map[string]any{"hoster": hoster}, "anime %s: JD Remove failed for dead hoster %s (continuing): %v", anime.Name, hoster, err)
	}
	s.publish(events.DownloadRunProgressEvent{RunID: runID, CorrelationID: runID})
}

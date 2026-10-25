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
//
// kind is what the pipeline BRANCHES on and has three values; exit is what the pipeline RECORDS
// and has fourteen, because three attempt-level pairs share a kind while having opposite causes.
// Every terminal return stamps exit, so an outcome carrying exitUnset never leaves this file.
type hosterOutcome struct {
	kind hosterOutcomeKind
	exit exitReason
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

// detectDownloadStartPhase waits for filesystem evidence of the download (FASE 1 of
// awaitHosterOutcome). Every DetectStartProbeInterval, up to DetectStartGrace, it first re-counts
// the folder root against baselineCount -- a finished episode is already there -- and then looks
// for a .part file, which means JD has begun the transfer. Either signal ends the grace; the
// completion poll that follows confirms a landed episode on its first check. A .part file never
// counts as an episode, so checking the count first cannot report a transfer still in progress.
// Tests skip this via DetectStartPhaseDisabled=true.
//
// It returns the ordered timeline of the checks it made, so the caller can persist WHEN each
// probe ran and what it saw. attemptStart is the instant the attempt began (see probe); the
// disabled test seam returns before any probe is recorded, exactly as it returned no outcome
// before.
func (s *Service) detectDownloadStartPhase(ctx context.Context, runID string, anime contracts.MobileAnime, folder string, baselineCount, episode int, attemptStart time.Time) (bool, []probe) {
	if s.deps.DetectStartPhaseDisabled {
		return true, nil
	}

	pf := s.deps.HasPartFiles
	if pf == nil {
		pf = hasPartFilesRecursive
	}

	var probes []probe
	for range int(config.DetectStartGrace / config.DetectStartProbeInterval) {
		s.deps.PollSleep(config.DetectStartProbeInterval)
		landed := s.downloadedEpisodeBaseline(folder) > baselineCount
		found := !landed && pf(folder)
		probes = append(probes, probe{elapsedMs: s.deps.Clock().Sub(attemptStart).Milliseconds(), found: found, landed: landed})
		if landed || found {
			s.logAnimef(logger.LevelInfo, runID, anime, "download.detect_start_succeeded",
				map[string]any{"episode": episode, "probes": probeMetadata(probes)},
				"anime %s: episode %d evidence found on probe %d of the 60s grace", anime.ID, episode, len(probes))
			s.publish(events.DownloadEpisodeDownloadingEvent{RunID: runID, AnimeID: anime.ID, Episode: episode, CorrelationID: runID})
			return true, probes
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
		s.logAnimef(logger.LevelWarn, runID, anime, "download.jd_status_query_failed",
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
//	FASE 1:    60s filesystem-only grace, every 5s: episode count at the root, then .part.
//	FASE 1B:   after 60s of no filesystem evidence, one more JD API call:
//	           - DEAD (OfflineCount > 0)     → fallback
//	           - ALIVE (OnlineCount/Running) → DownloadEpisodeDownloadingEvent → FASE 2
//	           - UNKNOWN (no clear signal)   → firstHoster DEAD, fallback TIMEOUT
//	FASE 2:    downloading → completed (filesystem-only 5s tick, 30 min safety cap).
//
// JD API is called at most twice per hoster attempt; FASE 2 never calls it.
func (s *Service) awaitHosterOutcome(ctx context.Context, runID string, anime contracts.MobileAnime, hoster string, baselineCount, episode int, isFirstHoster bool) hosterOutcome {
	// attemptStart anchors every probe offset this attempt records. What separates it from the
	// real enqueue instant is one mutex unlock and one error check, so it is enqueue-equivalent
	// for every decision the offsets serve -- and capturing it here costs this function no
	// signature change.
	attemptStart := s.deps.Clock()
	// Once JD accepted the enqueue, Stop can no longer halt the transfer: JD keeps downloading on
	// its own. The attempt therefore runs to its end -- landed and renamed, hoster dead, or the
	// 30-minute cap -- and the run honours Stop at its quiet points instead: before the next
	// hoster is enqueued and after the episode is renamed. Without this, a stopped run would
	// abandon a file JD still delivers, and the rename would refuse the cancelled context.
	ctx = context.WithoutCancel(ctx)
	folder := derefOrEmpty(anime.Folder)
	if s.deps.Counter == nil {
		return hosterOutcome{kind: hosterOutcomeTimeout, exit: exitCounterUnavailable}
	}

	if s.downloadedEpisodeBaseline(folder) > baselineCount {
		s.completeDownloadedEpisode(ctx, runID, anime, episode)
		return hosterOutcome{kind: hosterOutcomeSuccess, exit: exitDiskAheadAtEntry}
	}

	// ────────────────── PRE-CHECK ──────────────────
	if s.jdPreCheckIsDead(ctx, runID, anime, hoster, folder) {
		return hosterOutcome{kind: hosterOutcomeDead, exit: exitPrecheckDead}
	}

	// ────────────────── FASE 1 ──────────────────
	started, probes := s.detectDownloadStartPhase(ctx, runID, anime, folder, baselineCount, episode, attemptStart)
	if landedDuringGrace(probes) {
		// Completed BEFORE any JD verdict: RenameEpisodeByDestination resolves the newest finished
		// link under the destination, so the rename works only while JD still holds the package
		// that evaluateJDAfterGrace may remove.
		s.completeDownloadedEpisode(ctx, runID, anime, episode)
		return hosterOutcome{kind: hosterOutcomeSuccess, exit: exitGraceDiskConfirmed}
	}
	if !started {
		attempt := graceAttempt{
			runID: runID, anime: anime, hoster: hoster, folder: folder,
			episode: episode, isFirstHoster: isFirstHoster, probes: probes,
		}
		if outcome := s.evaluateJDAfterGrace(ctx, attempt); outcome != nil {
			return *outcome
		}
	}

	// ────────────────── FASE 2 ──────────────────
	return s.pollForCompletion(ctx, runID, anime, folder, baselineCount, episode)
}

// pollForCompletion runs FASE 2: the filesystem-only completion poll, bounded by a safety cap. It
// is the only success authority -- JD's own "finished" verdict never declares one.
//
// Its only terminal points are the episode landing and the safety cap; a stopped run does not
// end it (see awaitHosterOutcome).
func (s *Service) pollForCompletion(ctx context.Context, runID string, anime contracts.MobileAnime, folder string, baselineCount, episode int) hosterOutcome {
	deadline := s.deps.Clock().Add(config.FilesystemCompletionPollTimeout)
	for {
		if s.downloadedEpisodeBaseline(folder) > baselineCount {
			s.completeDownloadedEpisode(ctx, runID, anime, episode)
			return hosterOutcome{kind: hosterOutcomeSuccess, exit: exitFSPollConfirmed}
		}

		// Stop is deliberately not checked here: awaitHosterOutcome detached the attempt from
		// the run's cancellation, because JD keeps downloading whatever this poll stops watching.
		if s.deps.Clock().After(deadline) {
			return hosterOutcome{kind: hosterOutcomeTimeout, exit: exitFSPollDeadline}
		}
		s.deps.PollSleep(config.FilesystemCompletionPollInterval)
	}
}

// landedDuringGrace reports whether the detect phase ended because a new episode appeared at the
// folder root. Only the last probe can say so, because the phase stops at the first signal.
func landedDuringGrace(probes []probe) bool {
	return len(probes) > 0 && probes[len(probes)-1].landed
}

// logDetectStartFailed persists the detect phase's probe timeline once the 60s grace has ended with
// no new episode at the root and no transfer evidence. The JD evaluation is its only caller.
//
// The entry records the DETECT PHASE's outcome, never the attempt's. It already appears today on
// attempts that go on to succeed through the completion poll, and the attempt's own terminal point
// is recorded by the per-attempt ledger and the episode-level entry instead.
func (s *Service) logDetectStartFailed(runID string, anime contracts.MobileAnime, hoster string, probes []probe) {
	s.logAnimef(logger.LevelWarn, runID, anime, "download.detect_start_failed",
		map[string]any{"failureKind": FailureKindHosterDown, "hoster": hoster, "probes": probeMetadata(probes)},
		"anime %s: hoster %s has no .part evidence after 60s, checking JD", anime.Name, hoster)
}

// evaluateJDAfterGrace runs FASE 1B: after 60s without filesystem evidence, queries JD once more to
// determine whether the hoster is definitively dead (outcome Dead), unknown (outcome Timeout), or
// alive. When alive the Downloading event is published and a NIL outcome tells the caller to
// proceed to FASE 2 -- on that path no outcome struct exists at all, so there is no sentinel a
// later field could be stamped onto by mistake.
//
// probes is the detect phase's timeline; it is persisted here because this is where the failure to
// observe a transfer start is first recorded.
func (s *Service) evaluateJDAfterGrace(ctx context.Context, a graceAttempt) *hosterOutcome {
	s.logDetectStartFailed(a.runID, a.anime, a.hoster, a.probes)

	if s.deps.JD == nil {
		return firstHosterOutcome(a.isFirstHoster, exitGraceClientAbsentFirst, exitGraceClientAbsentFallback)
	}

	status, err := s.deps.JD.PackageStatusByDestination(ctx, s.deps.JDDeviceName, a.folder)
	if err != nil {
		s.logAnimef(logger.LevelWarn, a.runID, a.anime, "download.jd_status_query_failed",
			map[string]any{"hoster": a.hoster}, "anime %s: JD post-grace query failed for hoster %s: %v", a.anime.Name, a.hoster, err)
		if a.isFirstHoster {
			s.jdRemove(ctx, a.runID, a.anime, a.hoster, a.folder, exitGraceQueryErrorFirst, nil)
		}
		return firstHosterOutcome(a.isFirstHoster, exitGraceQueryErrorFirst, exitGraceQueryErrorFallback)
	}

	if classifyJDStatus(status) == verdictDead {
		s.jdRemove(ctx, a.runID, a.anime, a.hoster, a.folder, exitGraceClassifiedDead, &status)
		return &hosterOutcome{kind: hosterOutcomeDead, exit: exitGraceClassifiedDead}
	}

	if hasPositiveJDSignal(status) {
		s.publish(events.DownloadEpisodeDownloadingEvent{RunID: a.runID, AnimeID: a.anime.ID, Episode: a.episode, CorrelationID: a.runID})
		return nil
	}

	if a.isFirstHoster {
		s.jdRemove(ctx, a.runID, a.anime, a.hoster, a.folder, exitGraceNoSignalFirst, &status)
	}
	return firstHosterOutcome(a.isFirstHoster, exitGraceNoSignalFirst, exitGraceNoSignalFallback)
}

// firstHosterOutcome maps a post-grace dead end to its outcome: the first hoster is declared dead
// so the run falls back immediately, while a fallback hoster only times out.
//
// Three different dead ends share this mapping, and each passes its OWN pair of exits. Collapsing
// the pair into one value would destroy the discriminator: the mirrored returns produce different
// kinds from different causes that need opposite fixes, and hosterOutcomeKind cannot say which.
func firstHosterOutcome(isFirstHoster bool, first, fallback exitReason) *hosterOutcome {
	if isFirstHoster {
		return &hosterOutcome{kind: hosterOutcomeDead, exit: first}
	}
	return &hosterOutcome{kind: hosterOutcomeTimeout, exit: fallback}
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
	s.logAnimef(logger.LevelWarn, runID, anime, "download.jd_removed",
		jdRemovedMetadata(hoster, stage, status),
		"anime %s: removing JD packages for hoster %s at stage %s", anime.Name, hoster, stage)
	if err := s.deps.JD.RemoveByDestination(ctx, s.deps.JDDeviceName, folder); err != nil {
		s.logAnimef(logger.LevelWarn, runID, anime, "download.jd_remove_failed",
			map[string]any{"hoster": hoster}, "anime %s: JD Remove failed for dead hoster %s (continuing): %v", anime.Name, hoster, err)
	}
	s.publish(events.DownloadRunProgressEvent{RunID: runID, CorrelationID: runID})
}

// graceAttempt is one hoster attempt as it stands when the 60-second detect grace
// ends with no filesystem evidence, which is exactly what the JD evaluation reads.
//
// A struct rather than a parameter list (SonarQube go:S107 on the eight-parameter
// version): hoster and folder sat adjacent as two strings, and swapping them compiled.
type graceAttempt struct {
	runID         string
	anime         contracts.MobileAnime
	hoster        string
	folder        string
	episode       int
	isFirstHoster bool
	probes        []probe
}

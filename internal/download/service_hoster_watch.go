package download

import (
	"context"
	"strings"

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
// (Availability-derived counts, the Finished/Running/Skipped booleans, StatusIconKey) -- it MUST
// NEVER string-match a free-form Status field, which this neutral struct does not even carry.
func classifyJDStatus(st jdownloader.DestinationStatus) hosterVerdict {
	if !st.Matched {
		// Nothing has crawled/enqueued for this destination yet -- "not yet observed", never a
		// false dead (download-sites spec "No matching package yet defaults to downloading").
		return verdictDownloading
	}

	if st.CrawlOnlineCount > 0 {
		// Any ONLINE crawl link outvotes a stale OFFLINE package on the same destination --
		// self-heals a failed Remove() on a fresh retry (design.md "dead = crawl OFFLINE-only OR
		// download error triad").
		return verdictDownloading
	}

	for _, link := range st.Links {
		if link.Running {
			return verdictDownloading
		}
	}

	if st.CrawlOfflineCount > 0 {
		return verdictDead
	}

	for _, link := range st.Links {
		if !link.Finished && !link.Running && !link.Skipped && isErrorStatusIconKey(link.StatusIconKey) {
			return verdictDead
		}
	}

	for _, link := range st.Links {
		if link.Finished {
			return verdictFinishedOK
		}
	}

	return verdictDownloading
}

// isErrorStatusIconKey recognizes JD's error-family StatusIconKey values by substring rather than
// an exhaustive literal set, since the exact live-device key vocabulary is an open confirmation
// item (design.md "Open Questions"). An unrecognized key is safe-by-default: it falls through to
// verdictDownloading, bounded by the existing filesystem completion timeout rather than a false
// verdictDead.
func isErrorStatusIconKey(key string) bool {
	if key == "" {
		return false
	}
	lower := strings.ToLower(key)
	return strings.Contains(lower, "error") || strings.Contains(lower, "offline") || strings.Contains(lower, "warning")
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

// awaitHosterOutcome is the unified 5s watch loop for one hoster attempt (design.md "Loop
// restructure -- poll moves inside enqueueWithFallback"). Per tick: (1) disk baseline check,
// absorbing pollCompletion's exact success semantics unchanged (recursive-count-triggers-Flatten,
// then a baseline recheck); (2) a JD status poll classified via classifyJDStatus -- on
// verdictDead, the matched package is removed (best-effort, Warn-logged on failure, never
// aborting) and a fallback outcome is returned; (3) deadline/ctx cancellation yields a timeout
// outcome. A verdictDownloading (including "unmatched") NEVER triggers fallback -- it simply keeps
// polling up to config.FilesystemCompletionPollTimeout, exactly like the pre-existing
// pollCompletion budget.
func (s *Service) awaitHosterOutcome(ctx context.Context, runID string, anime contracts.MobileAnime, hoster string, baselineCount int) hosterOutcome {
	folder := derefOrEmpty(anime.Carpeta)
	if s.deps.Counter == nil {
		return hosterOutcome{kind: hosterOutcomeTimeout}
	}

	deadline := s.deps.Clock().Add(config.FilesystemCompletionPollTimeout)
	for {
		if s.downloadedEpisodeRecursive(folder) > baselineCount && s.deps.Flattener != nil {
			_, _ = s.deps.Flattener.Flatten(ctx, folder)
		}
		if s.downloadedEpisodeBaseline(folder) > baselineCount {
			return hosterOutcome{kind: hosterOutcomeSuccess}
		}

		if s.hosterVerdictIsDead(ctx, runID, anime, hoster, folder) {
			return hosterOutcome{kind: hosterOutcomeDead}
		}

		if s.deps.Clock().After(deadline) {
			return hosterOutcome{kind: hosterOutcomeTimeout}
		}
		if ctx.Err() != nil {
			return hosterOutcome{kind: hosterOutcomeTimeout}
		}
		s.deps.PollSleep(config.FilesystemCompletionPollInterval)
	}
}

// hosterVerdictIsDead polls JD status for folder, classifies it, and -- on verdictDead -- removes
// the matched package (best-effort) and publishes a fallback-transition event on the existing Bus
// (download-orchestration spec "Fallback and Failure Transitions Surface in Real Time"). A nil JD
// dependency degrades to "never dead" rather than panicking (enqueueWithFallback already refuses
// to run at all when JD is nil, so this is defense-in-depth, not a live production path).
func (s *Service) hosterVerdictIsDead(ctx context.Context, runID string, anime contracts.MobileAnime, hoster, folder string) bool {
	if s.deps.JD == nil {
		return false
	}

	status, err := s.deps.JD.PackageStatusByDestination(ctx, s.deps.JDDeviceName, folder)
	if err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.jd_status_query_failed",
			map[string]any{"hoster": hoster}, "anime %s: JD status query failed for hoster %s: %v", anime.Nombre, hoster, err)
		return false
	}

	if classifyJDStatus(status) != verdictDead {
		return false
	}

	if err := s.deps.JD.RemoveByDestination(ctx, s.deps.JDDeviceName, folder); err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.jd_remove_failed",
			map[string]any{"hoster": hoster}, "anime %s: JD Remove failed for dead hoster %s (continuing): %v", anime.Nombre, hoster, err)
	}

	s.publish(events.DownloadRunProgressEvent{RunID: runID, CorrelationID: runID})
	return true
}

package download

import (
	"context"
	"strings"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
)

// processAnime runs the full per-anime pipeline (gating -> trigger decision -> site resolution ->
// scrape -> hoster-ordered enqueue with fallback -> filesystem completion poll -> flatten), with
// every error contained to this anime's outcome -- it NEVER panics or returns an error that would
// abort the fan-out loop (download-orchestration spec "Per-Anime Fan-Out With Failure Isolation").
func (s *Service) processAnime(
	ctx context.Context,
	runID string,
	anime contracts.MobileAnime,
	gate *jdGate,
	progress ...func(animeProgressDelta),
) animeRunOutcome {
	emitProgress := progressEmitter(progress)
	preparation, outcome, complete := s.prepareAnimeDownload(ctx, runID, anime, emitProgress)
	if complete {
		return outcome
	}
	anime.Folder = &preparation.destination
	anime.SourceURL = &preparation.sourceURL
	return s.downloadAvailableEpisodes(ctx, runID, anime, gate, preparation, emitProgress)
}

type animeDownloadPreparation struct {
	source        sites.EpisodeSource
	listing       sites.EpisodeListing
	onDiskEpisode int
	destination   string
	sourceURL     string
}

// progressEmitter returns the supplied progress callback or a no-op callback.
func progressEmitter(progress []func(animeProgressDelta)) func(animeProgressDelta) {
	if len(progress) == 0 || progress[0] == nil {
		return func(animeProgressDelta) { /* no progress sink was supplied */ }
	}
	return progress[0]
}

// prepareAnimeDownload evaluates an anime and prepares its episode source and listing.
func (s *Service) prepareAnimeDownload(ctx context.Context, runID string, anime contracts.MobileAnime, emitProgress func(animeProgressDelta)) (animeDownloadPreparation, animeRunOutcome, bool) {
	root := ""
	if strings.TrimSpace(derefOrEmpty(anime.Folder)) == "" && s.deps.DownloadsRoot != nil {
		var err error
		root, err = s.deps.DownloadsRoot(ctx)
		if err != nil {
			return animeDownloadPreparation{}, s.configurationFailure(runID, anime, err, emitProgress), true
		}
	}
	decision := EvaluateAnimeForDownload(AnimeDownloadCandidate{
		Name: anime.Name, Tipo: anime.Kind, Pagina: anime.SourceURL, Carpeta: anime.Folder,
		DownloadsRoot: root, Sites: s.deps.Sites,
	})
	if decision.Skip {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.skipped", map[string]any{"reason": string(decision.SkipReason)}, "anime %s skipped: %s", anime.Name, decision.SkipReason)
		s.publish(events.DownloadSkippedEvent{RunID: runID, AnimeID: anime.ID, SkipReason: string(decision.SkipReason), CorrelationID: runID})
		emitProgress(animeProgressDelta{skipped: true})
		return animeDownloadPreparation{}, animeRunOutcome{animeID: anime.ID, animeName: anime.Name, skipped: true}, true
	}

	anime.Folder = &decision.Destination
	sourceURL := strings.TrimSpace(derefOrEmpty(anime.SourceURL))
	s.flattenDownloadFolder(ctx, runID, anime)
	onDiskEpisode := s.downloadedEpisodeBaseline(decision.Destination)
	if anime.TotalEpisodes != nil && *anime.TotalEpisodes > 0 && *anime.TotalEpisodes == onDiskEpisode {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.up_to_date", map[string]any{"reason": "season_complete_on_disk", "totalcap": *anime.TotalEpisodes, "onDiskCount": onDiskEpisode}, "anime %s up to date: season already complete on disk (%d/%d)", anime.Name, onDiskEpisode, *anime.TotalEpisodes)
		emitProgress(animeProgressDelta{checked: true, upToDate: true})
		return animeDownloadPreparation{}, animeRunOutcome{animeID: anime.ID, animeName: anime.Name, checked: true, upToDate: true}, true
	}

	listing, err := decision.Source.ListEpisodes(ctx, sourceURL)
	if err != nil {
		return animeDownloadPreparation{}, s.episodeListFailure(runID, anime, err, emitProgress), true
	}
	if !NeedsDownload(listing.LatestEpisode, onDiskEpisode) {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.up_to_date", map[string]any{"reason": "no_new_episode", "latestOnline": listing.LatestEpisode, "onDiskCount": onDiskEpisode}, "anime %s up to date: latest online %d not greater than on disk %d", anime.Name, listing.LatestEpisode, onDiskEpisode)
		emitProgress(animeProgressDelta{checked: true, upToDate: true})
		return animeDownloadPreparation{}, animeRunOutcome{animeID: anime.ID, animeName: anime.Name, checked: true, upToDate: true}, true
	}
	return animeDownloadPreparation{source: decision.Source, listing: listing, onDiskEpisode: onDiskEpisode, destination: decision.Destination, sourceURL: sourceURL}, animeRunOutcome{}, false
}

// configurationFailure records a runtime configuration dependency failure without
// misclassifying it as an anime readiness skip.
func (s *Service) configurationFailure(runID string, anime contracts.MobileAnime, err error, emitProgress func(animeProgressDelta)) animeRunOutcome {
	s.logf(logger.LevelError, runID, anime.ID, events.EventNameDownloadFailed, map[string]any{"failureKind": FailureKindConfiguration}, "anime %s: read download root failed: %v", anime.Name, err)
	s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindConfiguration, CorrelationID: runID})
	emitProgress(animeProgressDelta{checked: true})
	return animeRunOutcome{animeID: anime.ID, animeName: anime.Name, checked: true, failed: true, failureKind: FailureKindConfiguration}
}

// episodeListFailure records an episode-listing failure and its progress outcome.
func (s *Service) episodeListFailure(runID string, anime contracts.MobileAnime, err error, emitProgress func(animeProgressDelta)) animeRunOutcome {
	if err == nil {
		s.logf(logger.LevelError, runID, anime.ID, events.EventNameDownloadFailed, map[string]any{"failureKind": FailureKindHosterDown}, "anime %s: site registry unavailable", anime.Name)
	} else {
		s.logf(logger.LevelError, runID, anime.ID, events.EventNameDownloadFailed, map[string]any{"failureKind": FailureKindHosterDown}, "anime %s: list episodes failed: %v", anime.Name, err)
	}
	s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindHosterDown, CorrelationID: runID})
	emitProgress(animeProgressDelta{checked: true})
	return animeRunOutcome{animeID: anime.ID, animeName: anime.Name, checked: true, failed: true, failureKind: FailureKindHosterDown}
}

// downloadAvailableEpisodes processes every episode missing from the prepared listing. This is
// the ONLY place the lazy jdGate is resolved: reaching here already proves at least one episode
// is missing, so this is the earliest point at which launching JDownloader is actually justified
// (bug fix: previously EnsureOnline ran unconditionally before any episode discovery).
func (s *Service) downloadAvailableEpisodes(ctx context.Context, runID string, anime contracts.MobileAnime, gate *jdGate, preparation animeDownloadPreparation, emitProgress func(animeProgressDelta)) animeRunOutcome {
	gate.online(ctx)

	missingEpisodes := preparation.listing.LatestEpisode - preparation.onDiskEpisode
	outcome := animeRunOutcome{animeID: anime.ID, animeName: anime.Name, checked: true, episodesFound: missingEpisodes}
	emitProgress(animeProgressDelta{checked: true, episodesFound: missingEpisodes})
	current := preparation.onDiskEpisode
	for current < preparation.listing.LatestEpisode {
		// A stopped run must not start the next episode. Checking here (rather than
		// only inside the watch loops) means Stop costs at most the episode already
		// in flight.
		if ctx.Err() != nil {
			return outcome
		}
		nextCount, terminal := s.processAvailableEpisode(ctx, runID, anime, gate, preparation.source, current, &outcome, emitProgress)
		if terminal {
			return outcome
		}
		current = nextCount
	}
	return outcome
}

// processAvailableEpisode resolves, extracts, and downloads one available episode. The gate is
// already resolved by downloadAvailableEpisodes before this runs, so gate.knownOffline() is the
// single source of truth for JD availability here -- it never forces a launch.
//
// Every path that does not put a file on disk is terminal for the anime. There is
// deliberately no "skip to the next episode": the download cursor is derived from
// the folder contents, so it can express "I have N episodes" but not "I have 4 and
// 12". Advancing past an episode nobody downloaded therefore either fabricates
// progress (the old offline path logged an on-disk count climbing 4 -> 11 with no
// file written) or invites a gap that hides every earlier missing episode behind a
// later one.
// NOSONAR go:S107 -- eight parameters, but no two adjacent ones share a type, so
// there is no transposition a caller can make that still compiles. Bundling them
// would add a struct whose only job is to satisfy a count, and the body reads
// them all individually.
func (s *Service) processAvailableEpisode(ctx context.Context, runID string, anime contracts.MobileAnime, gate *jdGate, source sites.EpisodeSource, current int, outcome *animeRunOutcome, emitProgress func(animeProgressDelta)) (int, bool) { // NOSONAR
	nextEpisode := current + 1
	episodePageURL, err := source.EpisodePageURL(ctx, *anime.SourceURL, nextEpisode)
	if err != nil {
		s.recordEpisodeFailure(runID, anime, FailureKindHosterDown, outcome, emitProgress, "anime %s: resolve episode %d page failed: %v", anime.Name, nextEpisode, err)
		return current, true
	}

	s.logf(logger.LevelInfo, runID, anime.ID, "download.episode_available", map[string]any{"episode": nextEpisode}, "anime %s: episode %d available online (on disk: %d)", anime.Name, nextEpisode, current)
	s.publish(events.DownloadEpisodeAvailableEvent{RunID: runID, AnimeID: anime.ID, Episode: nextEpisode, CorrelationID: runID})
	links, err := source.ExtractLinks(ctx, episodePageURL)
	if linkExtractionFailed(err, links) {
		s.recordEpisodeFailure(runID, anime, FailureKindHosterDown, outcome, emitProgress, "anime %s: extract links failed: %v", anime.Name, err)
		return current, true
	}
	// Offering the links this run already resolved is worth doing only here: JD
	// being offline means the links are fine and just our downloader is dead,
	// unlike a hoster failure where they are dead too. Exactly one episode is
	// offered -- the next one -- so fetching it by hand advances the counter
	// correctly instead of opening a gap.
	if gate.knownOffline() {
		manualLink := ManualLink{Anime: anime.Name, Episode: nextEpisode, Links: linkURLs(links)}
		outcome.manualLinks = append(outcome.manualLinks, manualLink)
		emitProgress(animeProgressDelta{manualLinks: []ManualLink{manualLink}})
		return current, true
	}

	ordered := s.orderHosters(source.Descriptor().Name, links)
	result := s.enqueueWithFallback(ctx, runID, anime, ordered, nextEpisode)
	if !result.succeeded {
		failureMetadata := episodeForensics(nextEpisode, result)
		failureMetadata["failureKind"] = result.failureKind
		s.logf(logger.LevelError, runID, anime.ID, events.EventNameDownloadFailed, failureMetadata, "anime %s: episode %d failed on every hoster", anime.Name, nextEpisode)
		s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: result.failureKind, CorrelationID: runID})
		outcome.episodesFailed++
		outcome.failed = true
		outcome.failureKind = result.failureKind
		emitProgress(animeProgressDelta{episodesFailed: 1})
		return current, true
	}

	s.logf(logger.LevelInfo, runID, anime.ID, "download.episode_downloaded", episodeForensics(nextEpisode, result), "anime %s: episode %d downloaded", anime.Name, nextEpisode)
	s.publish(events.DownloadEpisodeDownloadedEvent{RunID: runID, AnimeID: anime.ID, Episode: nextEpisode, CorrelationID: runID})
	outcome.episodesDownloaded++
	// Record which episode numbers landed, not just how many, so the notification row can say
	// "Episodes 14-16" instead of "3 episodes". first is stamped once; last moves with every
	// success, so the pair brackets exactly what this run put on disk for this anime.
	if outcome.firstEpisodeDownloaded == 0 {
		outcome.firstEpisodeDownloaded = nextEpisode
	}
	outcome.lastEpisodeDownloaded = nextEpisode
	emitProgress(animeProgressDelta{episodesDownloaded: 1})
	return s.downloadedEpisodeBaseline(*anime.Folder), false
}

// episodeForensics renders the credited attempt onto an episode-level entry: which terminal point
// produced the outcome, which hoster and attempt were credited, and the disk counts before and at
// that point.
//
// It is assembled HERE, at the emit site, and dies with the map. The tempting alternative --
// hanging these on the anime run outcome, which is already threaded into this function -- would put
// every one of them inside the live progress payload the UI renders, because animeProgressDelta is
// a type ALIAS of that struct and not a separate type. When an emit site looks like it needs a
// forensic field on the outcome, the answer is to move the emit site.
func episodeForensics(episode int, result episodeEnqueueResult) map[string]any {
	return map[string]any{
		"episode":      episode,
		"hoster":       result.hoster,
		"attemptIndex": result.attemptIndex,
		"exit":         string(result.exit),
		"baseline":     result.baseline,
		"observed":     result.observed,
	}
}

// recordEpisodeFailure records an episode failure. It no longer decides whether to
// continue: an episode that did not land is always terminal for its anime, so the
// caller stops unconditionally.
func (s *Service) recordEpisodeFailure(runID string, anime contracts.MobileAnime, failureKind string, outcome *animeRunOutcome, emitProgress func(animeProgressDelta), logFormat string, logArgs ...any) {
	s.logf(logger.LevelError, runID, anime.ID, events.EventNameDownloadFailed, map[string]any{"failureKind": failureKind}, logFormat, logArgs...)
	s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: failureKind, CorrelationID: runID})
	outcome.episodesFailed++
	outcome.failed = true
	outcome.failureKind = failureKind
	emitProgress(animeProgressDelta{episodesFailed: 1})
}

// linkExtractionFailed reports whether link extraction yielded an unusable result.
func linkExtractionFailed(err error, links []sites.DownloadLink) bool {
	return err != nil || len(links) == 0
}

// episodeEnqueueResult is everything enqueueWithFallback learned about one episode: the two
// values the pipeline BRANCHES on (succeeded, failureKind) plus the forensic record of WHICH
// attempt produced them.
//
// It is a DISTINCT named type with no relationship whatsoever to animeRunOutcome, and that is
// deliberate: assigning one to the other is a COMPILE ERROR. animeRunOutcome is a type ALIAS of
// animeProgressDelta, so a forensic field hung on it would land in the live progress payload the
// UI renders, and neither name warns of it. This struct is unpacked into one logf map inside
// processAvailableEpisode and DIES in that local scope -- it is never assigned to the outcome,
// never passed to emitProgress, and never reaches the event bus.
type episodeEnqueueResult struct {
	succeeded   bool
	failureKind string
	// hoster and attemptIndex credit the LAST hoster the episode actually attempted. They stay
	// empty and noAttemptIndex when no attempt ever ran, which is an honest "nothing to credit"
	// rather than a zero index pointing at a hoster that was never tried.
	hoster       string
	attemptIndex int
	exit         exitReason
	// baseline is the on-disk episode count read once, before the first attempt. It stays zero on
	// the pre-attempt return that has no downloader client, where no folder has been resolved yet
	// and reading the disk there would be a behavior change rather than a measurement.
	baseline int
	// observed is the on-disk count at the terminal point. It is RECORDED AND NEVER ACTED ON:
	// no branch, guard, loop condition, early return, verdict, classification, run counter or
	// event payload may read it. It is computed only inside the terminal return that builds
	// this struct, because a value that does not exist before the return cannot be branched on.
	// Comparing it against baseline is what will size the classifier fix; wiring it into control
	// flow here would silently make this change the fix, with no measured baseline left to
	// compare against.
	observed int
}

// noAttemptIndex is the attemptIndex recorded when no hoster was ever attempted. Zero would name
// the first hoster in the priority order, which is precisely the hoster that did NOT run.
const noAttemptIndex = -1

// hosterLink pairs a download link with the hoster's resolved priority order index, so
// enqueueWithFallback can iterate hosters (not raw links) in the resolver's deterministic order.
type hosterLink struct {
	hoster string
	links  []string
}

// orderHosters groups links by hoster and orders the groups per HosterResolver.OrderWithDiscovered
// (design §4.4, ADR-HOSTER); a nil Hosters dependency degrades to "links in scrape order, single
// group per hoster" rather than panicking.
func (s *Service) orderHosters(site string, links []sites.DownloadLink) []hosterLink {
	byHoster := map[string][]string{}
	var discovered []string
	for _, l := range links {
		if _, seen := byHoster[l.Hoster]; !seen {
			discovered = append(discovered, l.Hoster)
		}
		byHoster[l.Hoster] = append(byHoster[l.Hoster], l.URL)
	}

	if s.deps.Hosters == nil {
		out := make([]hosterLink, 0, len(discovered))
		for _, h := range discovered {
			out = append(out, hosterLink{hoster: h, links: byHoster[h]})
		}
		return out
	}

	order, err := s.deps.Hosters.OrderWithDiscovered(site, discovered)
	if err != nil {
		out := make([]hosterLink, 0, len(discovered))
		for _, h := range discovered {
			out = append(out, hosterLink{hoster: h, links: byHoster[h]})
		}
		return out
	}

	out := make([]hosterLink, 0, len(order))
	for _, entry := range order {
		urls, ok := byHoster[entry.Hoster]
		if !ok {
			continue
		}
		out = append(out, hosterLink{hoster: entry.Hoster, links: urls})
	}
	return out
}

// flattenDownloadFolder moves downloaded files from nested folders into the anime folder.
func (s *Service) flattenDownloadFolder(ctx context.Context, runID string, anime contracts.MobileAnime) {
	if s.deps.Flattener == nil || anime.Folder == nil || *anime.Folder == "" {
		return
	}
	moved, err := s.deps.Flattener.Flatten(ctx, *anime.Folder)
	if err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.flatten_failed",
			map[string]any{"moved": moved},
			"anime %s: download folder flatten moved %d files with errors: %v", anime.Name, moved, err)
		return
	}
	if moved > 0 {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.flattened",
			map[string]any{"moved": moved},
			"anime %s: download folder flatten moved %d files", anime.Name, moved)
	}
}

// downloadedEpisodeBaseline returns the highest episode count at the folder root.
func (s *Service) downloadedEpisodeBaseline(folder string) int {
	if s.deps.Counter == nil {
		return 0
	}
	highest := s.deps.Counter.HighestEpisodeAtRoot(folder)
	count := s.deps.Counter.CountAtRoot(folder)
	return max(highest, count)
}

// downloadedEpisodeRecursive returns the highest episode count recursively below a folder.
func (s *Service) downloadedEpisodeRecursive(folder string) int {
	if s.deps.Counter == nil {
		return 0
	}
	highest := s.deps.Counter.HighestEpisodeRecursive(folder)
	count := s.deps.Counter.CountRecursive(folder)
	return max(highest, count)
}

// enqueueWithFallback tries each hoster group in order, AddAndStart-ing then watching each attempt
// to completion, failure, or timeout via awaitHosterOutcome before deciding whether to advance to
// the next hoster (download-orchestration spec "Hoster-Ordered Enqueue", MODIFIED: the JD status
// poll now runs INSIDE this loop, not only via the outer filesystem poll). The poll's baseline is
// captured once, before the first hoster attempt, so disk success is measured against the state
// before this episode started downloading -- not reset per hoster. Returns (true, "") as soon as
// any hoster's watch reports success (filesystem confirms the episode landed), or
// (false, lastFailureKind) once every hoster has been tried (including when there is no JD client
// or no hosters at all). lastFailureKind reflects the LAST hoster's outcome: exhausted `dead`
// verdicts classify as hoster_down (download-sites spec "JD-reported dead hoster on every
// fallback entry is classified as hoster_down"); a genuine timeout on the last hoster classifies
// as slow_or_timeout.
func (s *Service) enqueueWithFallback(ctx context.Context, runID string, anime contracts.MobileAnime, ordered []hosterLink, episode int) episodeEnqueueResult {
	if s.deps.JD == nil {
		return episodeEnqueueResult{failureKind: FailureKindHosterDown, attemptIndex: noAttemptIndex, exit: exitJDUnavailable}
	}

	folder := derefOrEmpty(anime.Folder)
	baselineCount := s.downloadedEpisodeBaseline(folder)

	lastFailureKind := FailureKindHosterDown
	// lastExit starts unset and is overwritten by every attempt that terminates. Surviving as
	// unset is therefore proof that no attempt ever ran, which is the only thing separating the
	// two callers of the final return below.
	lastExit := exitUnset
	lastHoster, lastAttemptIndex := "", noAttemptIndex
	for i, hl := range ordered {
		// Falling back to the next hoster after a stop would keep the run alive for
		// minutes after the user asked it to end.
		if ctx.Err() != nil {
			return episodeEnqueueResult{failureKind: lastFailureKind, hoster: lastHoster, attemptIndex: lastAttemptIndex,
				exit: exitCancelledBeforeAttempt, baseline: baselineCount, observed: s.downloadedEpisodeBaseline(folder)}
		}
		lastHoster, lastAttemptIndex = hl.hoster, i
		s.jdMu.Lock()
		err := s.deps.JD.AddAndStart(ctx, s.deps.JDDeviceName, jdownloader.EnqueueRequest{
			URLs:        hl.links,
			Destination: folder,
		})
		s.jdMu.Unlock()
		if err != nil {
			lastFailureKind = classifyEnqueueFailure(err)
			lastExit = exitEnqueueError
			s.logf(logger.LevelWarn, runID, anime.ID, events.EventNameDownloadFailed,
				map[string]any{"failureKind": lastFailureKind, "hoster": hl.hoster},
				"anime %s: hoster %s enqueue failed, trying next: %v", anime.Name, hl.hoster, err)
			// This path CONTINUES without reaching the outcome switch below, so the ledger
			// needs its own row here or the attempt disappears from the record entirely.
			s.recordHosterAttempt(runID, anime, hl.hoster, i, episode, "enqueue_error", exitEnqueueError)
			continue
		}

		outcome := s.awaitHosterOutcome(ctx, runID, anime, hl.hoster, baselineCount, episode, i == 0)
		lastExit = outcome.exit
		s.recordHosterAttempt(runID, anime, hl.hoster, i, episode, attemptOutcomeName(outcome.kind), outcome.exit)
		switch outcome.kind {
		case hosterOutcomeSuccess:
			return episodeEnqueueResult{succeeded: true, hoster: hl.hoster, attemptIndex: i,
				exit: outcome.exit, baseline: baselineCount, observed: s.downloadedEpisodeBaseline(folder)}
		case hosterOutcomeDead:
			lastFailureKind = FailureKindHosterDown
			s.logf(logger.LevelWarn, runID, anime.ID, events.EventNameDownloadFailed,
				map[string]any{"failureKind": lastFailureKind, "hoster": hl.hoster},
				"anime %s: hoster %s classified dead by JD, trying next hoster", anime.Name, hl.hoster)
		default: // hosterOutcomeTimeout
			lastFailureKind = FailureKindSlowOrTimeout
			s.logf(logger.LevelWarn, runID, anime.ID, events.EventNameDownloadFailed,
				map[string]any{"failureKind": lastFailureKind, "hoster": hl.hoster},
				"anime %s: hoster %s timed out waiting for filesystem/JD confirmation", anime.Name, hl.hoster)
		}
	}
	// One return serves two different endings: an empty hoster order that never entered the loop,
	// and a chain that tried everything and failed. lastExit tells them apart, and an exhausted
	// chain reports the LAST attempt's own terminal value -- never a synthetic "exhausted", which
	// answers a question nobody asked while hiding how the last attempt actually ended.
	episodeExit := lastExit
	if episodeExit == exitUnset {
		episodeExit = exitNoHosters
	}
	return episodeEnqueueResult{failureKind: lastFailureKind, hoster: lastHoster, attemptIndex: lastAttemptIndex,
		exit: episodeExit, baseline: baselineCount, observed: s.downloadedEpisodeBaseline(folder)}
}

// recordHosterAttempt persists one ledger row for a single hoster attempt.
//
// The failure taxonomy answers WHY an attempt failed and is emitted only on failure, so it can
// never describe the attempt that actually won. This ledger is the complementary channel: exactly
// one uniform row per attempt, success included, whose value comes from being complete. It is
// ADDITIVE -- it never derives, replaces or overrides a failure classification.
func (s *Service) recordHosterAttempt(runID string, anime contracts.MobileAnime, hoster string, attemptIndex, episode int, outcome string, exit exitReason) {
	s.logf(logger.LevelInfo, runID, anime.ID, "download.hoster_attempt",
		map[string]any{"episode": episode, "hoster": hoster, "attemptIndex": attemptIndex, "outcome": outcome, "exit": string(exit)},
		"anime %s: episode %d hoster %s attempt %d ended as %s at %s", anime.Name, episode, hoster, attemptIndex, outcome, exit)
}

// classifyEnqueueFailure maps an enqueue error to the download failure taxonomy.
func classifyEnqueueFailure(err error) string {
	if err == nil {
		return ""
	}
	// A real adapter would inspect err for captcha/timeout signatures; this orchestration layer
	// keeps the classification seam simple and defaults to hoster_down, which is the safest
	// "try the next hoster" classification absent a more specific signal from the JD client.
	return FailureKindHosterDown
}

// linkURLs extracts URLs from download links.
func linkURLs(links []sites.DownloadLink) []string {
	urls := make([]string, 0, len(links))
	for _, l := range links {
		urls = append(urls, l.URL)
	}
	return urls
}

// derefOrEmpty returns a pointed-to string or an empty string for nil.
func derefOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

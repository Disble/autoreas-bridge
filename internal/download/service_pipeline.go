package download

import (
	"context"

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
	jdOnline bool,
	progress ...func(animeProgressDelta),
) animeRunOutcome {
	emitProgress := progressEmitter(progress)
	preparation, outcome, complete := s.prepareAnimeDownload(ctx, runID, anime, emitProgress)
	if complete {
		return outcome
	}
	return s.downloadAvailableEpisodes(ctx, runID, anime, jdOnline, preparation, emitProgress)
}

type animeDownloadPreparation struct {
	source        sites.EpisodeSource
	listing       sites.EpisodeListing
	onDiskEpisode int
}

// progressEmitter returns the supplied progress callback or a no-op callback.
func progressEmitter(progress []func(animeProgressDelta)) func(animeProgressDelta) {
	if len(progress) == 0 || progress[0] == nil {
		return func(animeProgressDelta) {}
	}
	return progress[0]
}

// prepareAnimeDownload evaluates an anime and prepares its episode source and listing.
func (s *Service) prepareAnimeDownload(ctx context.Context, runID string, anime contracts.MobileAnime, emitProgress func(animeProgressDelta)) (animeDownloadPreparation, animeRunOutcome, bool) {
	decision := EvaluateAnimeForDownload(AnimeDownloadCandidate{Tipo: anime.Tipo, Pagina: anime.Pagina, Carpeta: anime.Carpeta})
	if decision.Skip {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.skipped", map[string]any{"reason": string(decision.SkipReason)}, "anime %s skipped: %s", anime.Nombre, decision.SkipReason)
		s.publish(events.DownloadSkippedEvent{RunID: runID, AnimeID: anime.ID, SkipReason: string(decision.SkipReason), CorrelationID: runID})
		emitProgress(animeProgressDelta{skipped: true})
		return animeDownloadPreparation{}, animeRunOutcome{skipped: true}, true
	}

	s.flattenDownloadFolder(ctx, runID, anime)
	onDiskEpisode := s.downloadedEpisodeBaseline(*anime.Carpeta)
	if anime.TotalCap != nil && *anime.TotalCap > 0 && *anime.TotalCap == onDiskEpisode {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.up_to_date", map[string]any{"reason": "season_complete_on_disk", "totalcap": *anime.TotalCap, "onDiskCount": onDiskEpisode}, "anime %s up to date: season already complete on disk (%d/%d)", anime.Nombre, onDiskEpisode, *anime.TotalCap)
		emitProgress(animeProgressDelta{checked: true, upToDate: true})
		return animeDownloadPreparation{}, animeRunOutcome{checked: true, upToDate: true}, true
	}

	source, outcome, complete := s.resolveEpisodeSource(runID, anime, emitProgress)
	if complete {
		return animeDownloadPreparation{}, outcome, true
	}
	listing, err := source.ListEpisodes(ctx, *anime.Pagina)
	if err != nil {
		return animeDownloadPreparation{}, s.episodeListFailure(runID, anime, err, emitProgress), true
	}
	if !NeedsDownload(listing.LatestEpisode, onDiskEpisode) {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.up_to_date", map[string]any{"reason": "no_new_episode", "latestOnline": listing.LatestEpisode, "onDiskCount": onDiskEpisode}, "anime %s up to date: latest online %d not greater than on disk %d", anime.Nombre, listing.LatestEpisode, onDiskEpisode)
		emitProgress(animeProgressDelta{checked: true, upToDate: true})
		return animeDownloadPreparation{}, animeRunOutcome{checked: true, upToDate: true}, true
	}
	return animeDownloadPreparation{source: source, listing: listing, onDiskEpisode: onDiskEpisode}, animeRunOutcome{}, false
}

// resolveEpisodeSource resolves the site adapter for an anime page.
func (s *Service) resolveEpisodeSource(runID string, anime contracts.MobileAnime, emitProgress func(animeProgressDelta)) (sites.EpisodeSource, animeRunOutcome, bool) {
	if s.deps.Sites == nil {
		return nil, s.episodeListFailure(runID, anime, nil, emitProgress), true
	}
	source, err := s.deps.Sites.Resolve(*anime.Pagina)
	if err == nil {
		return source, animeRunOutcome{}, false
	}
	s.logf(logger.LevelWarn, runID, anime.ID, "download.skipped", map[string]any{"reason": "site_unsupported"}, "anime %s skipped: %v", anime.Nombre, err)
	s.publish(events.DownloadSkippedEvent{RunID: runID, AnimeID: anime.ID, SkipReason: "site_unsupported", CorrelationID: runID})
	emitProgress(animeProgressDelta{skipped: true})
	return nil, animeRunOutcome{skipped: true}, true
}

// episodeListFailure records an episode-listing failure and its progress outcome.
func (s *Service) episodeListFailure(runID string, anime contracts.MobileAnime, err error, emitProgress func(animeProgressDelta)) animeRunOutcome {
	if err == nil {
		s.logf(logger.LevelError, runID, anime.ID, "download.failed", map[string]any{"failureKind": FailureKindHosterDown}, "anime %s: site registry unavailable", anime.Nombre)
	} else {
		s.logf(logger.LevelError, runID, anime.ID, "download.failed", map[string]any{"failureKind": FailureKindHosterDown}, "anime %s: list episodes failed: %v", anime.Nombre, err)
	}
	s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindHosterDown, CorrelationID: runID})
	emitProgress(animeProgressDelta{checked: true})
	return animeRunOutcome{checked: true, failed: true, failureKind: FailureKindHosterDown}
}

// downloadAvailableEpisodes processes every episode missing from the prepared listing.
func (s *Service) downloadAvailableEpisodes(ctx context.Context, runID string, anime contracts.MobileAnime, jdOnline bool, preparation animeDownloadPreparation, emitProgress func(animeProgressDelta)) animeRunOutcome {
	missingEpisodes := preparation.listing.LatestEpisode - preparation.onDiskEpisode
	outcome := animeRunOutcome{checked: true, episodesFound: missingEpisodes}
	emitProgress(animeProgressDelta{checked: true, episodesFound: missingEpisodes})
	current := preparation.onDiskEpisode
	for current < preparation.listing.LatestEpisode {
		nextCount, terminal := s.processAvailableEpisode(ctx, runID, anime, jdOnline, preparation.source, current, &outcome, emitProgress)
		if terminal {
			return outcome
		}
		current = nextCount
	}
	return outcome
}

// processAvailableEpisode resolves, extracts, and downloads one available episode.
func (s *Service) processAvailableEpisode(ctx context.Context, runID string, anime contracts.MobileAnime, jdOnline bool, source sites.EpisodeSource, current int, outcome *animeRunOutcome, emitProgress func(animeProgressDelta)) (int, bool) {
	nextEpisode := current + 1
	episodePageURL, err := source.EpisodePageURL(ctx, *anime.Pagina, nextEpisode)
	if err != nil {
		if s.recordEpisodeFailure(runID, anime, FailureKindHosterDown, outcome, emitProgress, jdOnline, "anime %s: resolve episode %d page failed: %v", anime.Nombre, nextEpisode, err) {
			return current + 1, false
		}
		return current, true
	}

	s.logf(logger.LevelInfo, runID, anime.ID, "download.episode_available", map[string]any{"episode": nextEpisode}, "anime %s: episode %d available online (on disk: %d)", anime.Nombre, nextEpisode, current)
	s.publish(events.DownloadEpisodeAvailableEvent{RunID: runID, AnimeID: anime.ID, Episode: nextEpisode, CorrelationID: runID})
	links, err := source.ExtractLinks(ctx, episodePageURL)
	if linkExtractionFailed(err, links) {
		if s.recordEpisodeFailure(runID, anime, FailureKindHosterDown, outcome, emitProgress, jdOnline, "anime %s: extract links failed: %v", anime.Nombre, err) {
			return current + 1, false
		}
		return current, true
	}
	if !jdOnline {
		manualLink := ManualLink{Anime: anime.Nombre, Episode: nextEpisode, Links: linkURLs(links)}
		outcome.manualLinks = append(outcome.manualLinks, manualLink)
		emitProgress(animeProgressDelta{manualLinks: []ManualLink{manualLink}})
		return current + 1, false
	}

	ordered := s.orderHosters(source.Descriptor().Name, links)
	enqueued, failureKind := s.enqueueWithFallback(ctx, runID, anime, ordered)
	if !enqueued {
		s.logf(logger.LevelError, runID, anime.ID, "download.failed", map[string]any{"failureKind": failureKind}, "anime %s: episode %d failed on every hoster", anime.Nombre, nextEpisode)
		s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: failureKind, CorrelationID: runID})
		outcome.episodesFailed++
		outcome.failed = true
		outcome.failureKind = failureKind
		emitProgress(animeProgressDelta{episodesFailed: 1})
		return current, true
	}

	s.logf(logger.LevelInfo, runID, anime.ID, "download.episode_downloaded", map[string]any{"episode": nextEpisode}, "anime %s: episode %d downloaded", anime.Nombre, nextEpisode)
	s.publish(events.DownloadEpisodeDownloadedEvent{RunID: runID, AnimeID: anime.ID, Episode: nextEpisode, CorrelationID: runID})
	outcome.episodesDownloaded++
	emitProgress(animeProgressDelta{episodesDownloaded: 1})
	return s.downloadedEpisodeBaseline(*anime.Carpeta), false
}

// recordEpisodeFailure records an episode failure and reports whether processing should stop.
func (s *Service) recordEpisodeFailure(runID string, anime contracts.MobileAnime, failureKind string, outcome *animeRunOutcome, emitProgress func(animeProgressDelta), jdOnline bool, logFormat string, logArgs ...any) bool {
	s.logf(logger.LevelError, runID, anime.ID, "download.failed", map[string]any{"failureKind": failureKind}, logFormat, logArgs...)
	s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: failureKind, CorrelationID: runID})
	outcome.episodesFailed++
	outcome.failed = true
	outcome.failureKind = failureKind
	emitProgress(animeProgressDelta{episodesFailed: 1})
	return !jdOnline
}

// linkExtractionFailed reports whether link extraction yielded an unusable result.
func linkExtractionFailed(err error, links []sites.DownloadLink) bool {
	return err != nil || len(links) == 0
}

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
	if s.deps.Flattener == nil || anime.Carpeta == nil || *anime.Carpeta == "" {
		return
	}
	moved, err := s.deps.Flattener.Flatten(ctx, *anime.Carpeta)
	if err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.flatten_failed",
			map[string]any{"moved": moved},
			"anime %s: pre-download flatten moved %d files with errors: %v", anime.Nombre, moved, err)
		return
	}
	if moved > 0 {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.flattened",
			map[string]any{"moved": moved},
			"anime %s: pre-download flatten moved %d files", anime.Nombre, moved)
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
func (s *Service) enqueueWithFallback(ctx context.Context, runID string, anime contracts.MobileAnime, ordered []hosterLink) (bool, string) {
	if s.deps.JD == nil {
		return false, FailureKindHosterDown
	}

	folder := derefOrEmpty(anime.Carpeta)
	baselineCount := s.downloadedEpisodeBaseline(folder)

	lastFailureKind := FailureKindHosterDown
	for _, hl := range ordered {
		s.jdMu.Lock()
		err := s.deps.JD.AddAndStart(ctx, s.deps.JDDeviceName, jdownloader.EnqueueRequest{
			URLs:        hl.links,
			Destination: folder,
		})
		s.jdMu.Unlock()
		if err != nil {
			lastFailureKind = classifyEnqueueFailure(err)
			s.logf(logger.LevelWarn, runID, anime.ID, "download.failed",
				map[string]any{"failureKind": lastFailureKind, "hoster": hl.hoster},
				"anime %s: hoster %s enqueue failed, trying next: %v", anime.Nombre, hl.hoster, err)
			continue
		}

		switch outcome := s.awaitHosterOutcome(ctx, runID, anime, hl.hoster, baselineCount); outcome.kind {
		case hosterOutcomeSuccess:
			return true, ""
		case hosterOutcomeDead:
			lastFailureKind = FailureKindHosterDown
			s.logf(logger.LevelWarn, runID, anime.ID, "download.failed",
				map[string]any{"failureKind": lastFailureKind, "hoster": hl.hoster},
				"anime %s: hoster %s classified dead by JD, trying next hoster", anime.Nombre, hl.hoster)
		default: // hosterOutcomeTimeout
			lastFailureKind = FailureKindSlowOrTimeout
			s.logf(logger.LevelWarn, runID, anime.ID, "download.failed",
				map[string]any{"failureKind": lastFailureKind, "hoster": hl.hoster},
				"anime %s: hoster %s timed out waiting for filesystem/JD confirmation", anime.Nombre, hl.hoster)
		}
	}
	return false, lastFailureKind
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

// Package download (this file) holds the per-anime pipeline mechanics extracted from the
// orchestration Service (service.go): the failure-isolated processAnime fan-out body plus its
// hoster-ordering, enqueue-with-fallback, and filesystem completion-poll helpers. Splitting these
// out of service.go is a pure structural move (same package, unchanged behavior) that keeps each
// file within the repo's effective-line budget (docs/file-size-policy.md).
package download

import (
	"context"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/config"
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
	var onProgress func(animeProgressDelta)
	if len(progress) > 0 {
		onProgress = progress[0]
	}
	emitProgress := func(delta animeProgressDelta) {
		if onProgress != nil {
			onProgress(delta)
		}
	}

	decision := EvaluateAnimeForDownload(AnimeDownloadCandidate{
		Tipo:    anime.Tipo,
		Pagina:  anime.Pagina,
		Carpeta: anime.Carpeta,
	})
	if decision.Skip {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.skipped",
			map[string]any{"reason": string(decision.SkipReason)},
			"anime %s skipped: %s", anime.Nombre, decision.SkipReason)
		s.publish(events.DownloadSkippedEvent{RunID: runID, AnimeID: anime.ID, SkipReason: string(decision.SkipReason), CorrelationID: runID})
		emitProgress(animeProgressDelta{skipped: true})
		return animeRunOutcome{skipped: true}
	}

	s.flattenDownloadFolder(ctx, runID, anime)

	onDiskEpisode := s.downloadedEpisodeBaseline(*anime.Carpeta)
	if anime.TotalCap != nil && *anime.TotalCap > 0 && *anime.TotalCap == onDiskEpisode {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.up_to_date", map[string]any{
			"reason":      "season_complete_on_disk",
			"totalcap":    *anime.TotalCap,
			"onDiskCount": onDiskEpisode,
		}, "anime %s up to date: season already complete on disk (%d/%d)", anime.Nombre, onDiskEpisode, *anime.TotalCap)
		emitProgress(animeProgressDelta{checked: true, upToDate: true})
		return animeRunOutcome{checked: true, upToDate: true}
	}

	if s.deps.Sites == nil {
		s.logf(logger.LevelError, runID, anime.ID, "download.failed",
			map[string]any{"failureKind": FailureKindHosterDown},
			"anime %s: site registry unavailable", anime.Nombre)
		s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindHosterDown, CorrelationID: runID})
		emitProgress(animeProgressDelta{checked: true})
		return animeRunOutcome{checked: true, failed: true, failureKind: FailureKindHosterDown}
	}

	source, err := s.deps.Sites.Resolve(*anime.Pagina)
	if err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.skipped",
			map[string]any{"reason": "site_unsupported"},
			"anime %s skipped: %v", anime.Nombre, err)
		s.publish(events.DownloadSkippedEvent{RunID: runID, AnimeID: anime.ID, SkipReason: "site_unsupported", CorrelationID: runID})
		emitProgress(animeProgressDelta{skipped: true})
		return animeRunOutcome{skipped: true}
	}

	listing, err := source.ListEpisodes(ctx, *anime.Pagina)
	if err != nil {
		s.logf(logger.LevelError, runID, anime.ID, "download.failed",
			map[string]any{"failureKind": FailureKindHosterDown},
			"anime %s: list episodes failed: %v", anime.Nombre, err)
		s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindHosterDown, CorrelationID: runID})
		emitProgress(animeProgressDelta{checked: true})
		return animeRunOutcome{checked: true, failed: true, failureKind: FailureKindHosterDown}
	}

	if !NeedsDownload(listing.LatestEpisode, onDiskEpisode) {
		s.logf(logger.LevelInfo, runID, anime.ID, "download.up_to_date", map[string]any{
			"reason":       "no_new_episode",
			"latestOnline": listing.LatestEpisode,
			"onDiskCount":  onDiskEpisode,
		}, "anime %s up to date: latest online %d not greater than on disk %d", anime.Nombre, listing.LatestEpisode, onDiskEpisode)
		emitProgress(animeProgressDelta{checked: true, upToDate: true})
		return animeRunOutcome{checked: true, upToDate: true}
	}

	missingEpisodes := listing.LatestEpisode - onDiskEpisode
	outcome := animeRunOutcome{checked: true, episodesFound: missingEpisodes}
	emitProgress(animeProgressDelta{checked: true, episodesFound: missingEpisodes})
	current := onDiskEpisode
	for current < listing.LatestEpisode {
		nextEpisode := current + 1
		episodePageURL, err := source.EpisodePageURL(ctx, *anime.Pagina, nextEpisode)
		if err != nil {
			s.logf(logger.LevelError, runID, anime.ID, "download.failed",
				map[string]any{"failureKind": FailureKindHosterDown},
				"anime %s: resolve episode %d page failed: %v", anime.Nombre, nextEpisode, err)
			s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindHosterDown, CorrelationID: runID})
			outcome.episodesFailed++
			outcome.failed = true
			outcome.failureKind = FailureKindHosterDown
			emitProgress(animeProgressDelta{episodesFailed: 1})
			if !jdOnline {
				current++
				continue
			}
			return outcome
		}

		s.logf(logger.LevelInfo, runID, anime.ID, "download.episode_available",
			map[string]any{"episode": nextEpisode},
			"anime %s: episode %d available online (on disk: %d)", anime.Nombre, nextEpisode, current)
		s.publish(events.DownloadEpisodeAvailableEvent{RunID: runID, AnimeID: anime.ID, Episode: nextEpisode, CorrelationID: runID})

		links, err := source.ExtractLinks(ctx, episodePageURL)
		if err != nil || len(links) == 0 {
			s.logf(logger.LevelError, runID, anime.ID, "download.failed",
				map[string]any{"failureKind": FailureKindHosterDown},
				"anime %s: extract links failed: %v", anime.Nombre, err)
			s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindHosterDown, CorrelationID: runID})
			outcome.episodesFailed++
			outcome.failed = true
			outcome.failureKind = FailureKindHosterDown
			emitProgress(animeProgressDelta{episodesFailed: 1})
			if !jdOnline {
				current++
				continue
			}
			return outcome
		}

		if !jdOnline {
			manualLink := ManualLink{
				Anime:   anime.Nombre,
				Episode: nextEpisode,
				Links:   linkURLs(links),
			}
			outcome.manualLinks = append(outcome.manualLinks, manualLink)
			emitProgress(animeProgressDelta{manualLinks: []ManualLink{manualLink}})
			current++
			continue
		}

		ordered := s.orderHosters(source.Descriptor().Name, links)
		enqueued, failureKind := s.enqueueWithFallback(ctx, runID, anime, ordered)
		if !enqueued {
			s.logf(logger.LevelError, runID, anime.ID, "download.failed",
				map[string]any{"failureKind": failureKind},
				"anime %s: episode %d failed on every hoster", anime.Nombre, nextEpisode)
			s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: failureKind, CorrelationID: runID})
			outcome.episodesFailed++
			outcome.failed = true
			outcome.failureKind = failureKind
			emitProgress(animeProgressDelta{episodesFailed: 1})
			return outcome
		}

		downloaded := s.pollCompletion(ctx, *anime.Carpeta, current)
		if s.deps.Flattener != nil {
			if _, ferr := s.deps.Flattener.Flatten(ctx, *anime.Carpeta); ferr != nil {
				s.logf(logger.LevelWarn, runID, anime.ID, "download.failed",
					map[string]any{"failureKind": FailureKindHosterDown},
					"anime %s: flatten reported errors: %v", anime.Nombre, ferr)
			}
		}

		nextCount := s.downloadedEpisodeBaseline(*anime.Carpeta)
		if !downloaded {
			s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindSlowOrTimeout, CorrelationID: runID})
			outcome.episodesFailed++
			outcome.failed = true
			outcome.failureKind = FailureKindSlowOrTimeout
			emitProgress(animeProgressDelta{episodesFailed: 1})
			return outcome
		}
		if nextCount <= current {
			s.publish(events.DownloadFailedEvent{RunID: runID, AnimeID: anime.ID, FailureKind: FailureKindSlowOrTimeout, CorrelationID: runID})
			outcome.episodesFailed++
			outcome.failed = true
			outcome.failureKind = FailureKindSlowOrTimeout
			emitProgress(animeProgressDelta{episodesFailed: 1})
			return outcome
		}

		s.logf(logger.LevelInfo, runID, anime.ID, "download.episode_downloaded",
			map[string]any{"episode": nextEpisode},
			"anime %s: episode %d downloaded", anime.Nombre, nextEpisode)
		s.publish(events.DownloadEpisodeDownloadedEvent{RunID: runID, AnimeID: anime.ID, Episode: nextEpisode, CorrelationID: runID})

		outcome.episodesDownloaded++
		emitProgress(animeProgressDelta{episodesDownloaded: 1})
		current = nextCount
	}

	return outcome
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

func (s *Service) downloadedEpisodeBaseline(folder string) int {
	if s.deps.Counter == nil {
		return 0
	}
	highest := s.deps.Counter.HighestEpisodeAtRoot(folder)
	count := s.deps.Counter.CountAtRoot(folder)
	return max(highest, count)
}

func (s *Service) downloadedEpisodeRecursive(folder string) int {
	if s.deps.Counter == nil {
		return 0
	}
	highest := s.deps.Counter.HighestEpisodeRecursive(folder)
	count := s.deps.Counter.CountRecursive(folder)
	return max(highest, count)
}

// enqueueWithFallback tries each hoster group in order, classifying and moving to the next hoster
// on failure (download-sites spec "Hoster-Ordered Enqueue With Fallback"). Returns
// (true, "") on the first successful AddAndStart, or (false, lastFailureKind) if every hoster
// failed (including when there is no JD client or no hosters at all).
func (s *Service) enqueueWithFallback(ctx context.Context, runID string, anime contracts.MobileAnime, ordered []hosterLink) (bool, string) {
	if s.deps.JD == nil {
		return false, FailureKindHosterDown
	}

	lastFailureKind := FailureKindHosterDown
	for _, hl := range ordered {
		s.jdMu.Lock()
		err := s.deps.JD.AddAndStart(ctx, s.deps.JDDeviceName, jdownloader.EnqueueRequest{
			URLs:        hl.links,
			Destination: derefOrEmpty(anime.Carpeta),
		})
		s.jdMu.Unlock()
		if err == nil {
			return true, ""
		}
		lastFailureKind = classifyEnqueueFailure(err)
		s.logf(logger.LevelWarn, runID, anime.ID, "download.failed",
			map[string]any{"failureKind": lastFailureKind, "hoster": hl.hoster},
			"anime %s: hoster %s enqueue failed, trying next: %v", anime.Nombre, hl.hoster, err)
	}
	return false, lastFailureKind
}

// pollCompletion waits for the root completion baseline to exceed baselineCount, retrying
// flattening whenever a recursive video appears. This makes the filesystem move/rename boundary
// the source of truth: if JD still owns the file on Windows, Flatten fails and the loop retries.
// A nil Counter dependency degrades to "assume not downloaded" rather than panicking or spinning.
func (s *Service) pollCompletion(ctx context.Context, folder string, baselineCount int) bool {
	if s.deps.Counter == nil {
		return false
	}

	deadline := s.deps.Clock().Add(config.FilesystemCompletionPollTimeout)
	for {
		if s.downloadedEpisodeRecursive(folder) > baselineCount && s.deps.Flattener != nil {
			_, _ = s.deps.Flattener.Flatten(ctx, folder)
		}
		if s.downloadedEpisodeBaseline(folder) > baselineCount {
			return true
		}
		if s.deps.Clock().After(deadline) {
			return false
		}
		if ctx.Err() != nil {
			return false
		}
		s.deps.PollSleep(config.FilesystemCompletionPollInterval)
	}
}

func classifyEnqueueFailure(err error) string {
	if err == nil {
		return ""
	}
	// A real adapter would inspect err for captcha/timeout signatures; this orchestration layer
	// keeps the classification seam simple and defaults to hoster_down, which is the safest
	// "try the next hoster" classification absent a more specific signal from the JD client.
	return FailureKindHosterDown
}

func linkURLs(links []sites.DownloadLink) []string {
	urls := make([]string, 0, len(links))
	for _, l := range links {
		urls = append(urls, l.URL)
	}
	return urls
}

func derefOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

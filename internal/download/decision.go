package download

import (
	"net/url"
	"strings"

	"autoreas-bridge/internal/download/sites"
)

// NeedsDownload reports whether a download is needed for an anime, per the validated PoC
// trigger semantic: the HIGHEST online episode NUMBER (not a count of listed entries)
// exceeds the count of video files currently on disk. The on-disk count MUST be re-derived
// from the filesystem by the caller on every run (filesystem.EpisodeCounter); this function
// intentionally has NO parameter for NroCapVisto or any bridge.db-cached value -- the
// comparison is ALWAYS onlineLatestEpisodeNumber vs onDiskVideoFileCount (download-orchestration
// spec "NroCapVisto is never consulted for the trigger"; design.md §1.7, ADR-DISK).
func NeedsDownload(onlineLatestEpisodeNumber, onDiskVideoFileCount int) bool {
	return onlineLatestEpisodeNumber > onDiskVideoFileCount
}

// HighestEpisodeNumber returns the maximum value in a slice of online episode numbers,
// or 0 for an empty/nil slice. It exists because a site adapter's episode listing may have
// numbering gaps (e.g. [1,2,4]); the trigger decision MUST compare against the highest
// episode NUMBER, never the count of listed entries (download-orchestration spec "Online
// numbering gap is compared by highest number, not entry count").
func HighestEpisodeNumber(episodeNumbers []int) int {
	highest := 0
	for _, n := range episodeNumbers {
		if n > highest {
			highest = n
		}
	}
	return highest
}

// SkipReason is a stable, observable code identifying why an anime was excluded from a
// download run (download-orchestration spec "Explicit Tipo 1/2 Skip"; "Missing
// Pagina/Carpeta Surfaced as Actionable State"). It is surfaced in structured logs and/or
// the download_runs row -- never a silent skip.
type SkipReason string

const (
	// SkipReasonNone indicates the candidate was NOT skipped by the gating checks.
	SkipReasonNone SkipReason = ""
	// SkipReasonUnsupportedTipo remains readable from historical run details.
	SkipReasonUnsupportedTipo SkipReason = "unsupported_tipo"
	// SkipReasonMissingPagina remains readable from historical run details.
	SkipReasonMissingPagina SkipReason = "missing_pagina"
	// SkipReasonMissingCarpeta remains readable from historical run details.
	SkipReasonMissingCarpeta SkipReason = "missing_carpeta"
)

// AnimeDownloadCandidate is the minimal projection of contracts.MobileAnime the gating
// decision needs (design.md §3.8: the download context consumes ListMobileAnimes()/
// GetMobileAnime(id), not ListAnimeItems(), because only MobileAnime carries Pagina/Carpeta).
// It deliberately mirrors only the fields relevant to EvaluateAnimeForDownload so this file
// has no dependency on the contracts package.
type AnimeDownloadCandidate struct {
	Name          string
	Tipo          *int // retained for read compatibility; type never blocks download readiness
	Pagina        *string
	Carpeta       *string
	DownloadsRoot string
	Sites         SiteRegistry
}

// AnimeDownloadDecision is the pure gating outcome for one anime candidate. When Skip is
// true, SkipReason identifies why and Err wraps the matching sentinel error from errors.go
// -- per spec, a skip MUST be a surfaced, observable reason, never a silent no-op.
type AnimeDownloadDecision struct {
	Skip        bool
	SkipReason  SkipReason
	Err         error
	Reasons     []ReadinessReason
	Destination string
	Source      sites.EpisodeSource
}

// EvaluateAnimeForDownload classifies local source and destination blockers before runtime work.
func EvaluateAnimeForDownload(candidate AnimeDownloadCandidate) AnimeDownloadDecision {
	reasons := make([]ReadinessReason, 0, 2)
	var source sites.EpisodeSource
	page := strings.TrimSpace(derefOrEmpty(candidate.Pagina))
	switch {
	case page == "":
		reasons = append(reasons, DownloadReadinessMissingSource)
	case !validSourceURL(page):
		reasons = append(reasons, DownloadReadinessInvalidSource)
	default:
		if candidate.Sites == nil {
			reasons = append(reasons, DownloadReadinessUnsupportedSource)
		} else {
			var err error
			source, err = candidate.Sites.Resolve(page)
			if err != nil || source == nil {
				reasons = append(reasons, DownloadReadinessUnsupportedSource)
			}
		}
	}
	destination := ResolveDestination(candidate.Carpeta, candidate.DownloadsRoot, candidate.Name)
	if destination == "" {
		reasons = append(reasons, DownloadReadinessDestinationUnresolved)
	}
	decision := AnimeDownloadDecision{Reasons: reasons, Destination: destination, Source: source}
	if len(reasons) > 0 {
		decision.Skip = true
		decision.SkipReason = SkipReason(reasons[0])
		decision.Err = readinessReasonError(reasons[0])
	}
	return decision
}

// validSourceURL accepts absolute HTTP(S) source pages before adapter matching.
func validSourceURL(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || !parsed.IsAbs() {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	return scheme == "http" || scheme == "https"
}

// readinessReasonError maps one stable readiness blocker to its runtime sentinel.
func readinessReasonError(reason ReadinessReason) error {
	switch reason {
	case DownloadReadinessMissingSource:
		return ErrMissingSource
	case DownloadReadinessInvalidSource:
		return ErrInvalidSource
	case DownloadReadinessUnsupportedSource:
		return ErrUnsupportedSource
	case DownloadReadinessDestinationUnresolved:
		return ErrDestinationUnresolved
	default:
		return nil
	}
}

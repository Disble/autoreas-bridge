package download

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

// unsupportedTipo holds the Tipo values explicitly out of scope for episodic download
// (design.md §2.1 row #3, contracts.MobileAnime.Tipo: 0=Serie, 1=Pelicula, 2=OVA).
var unsupportedTipo = map[int]bool{
	1: true, // Pelicula
	2: true, // OVA
}

// SkipReason is a stable, observable code identifying why an anime was excluded from a
// download run (download-orchestration spec "Explicit Tipo 1/2 Skip"; "Missing
// Pagina/Carpeta Surfaced as Actionable State"). It is surfaced in structured logs and/or
// the download_runs row -- never a silent skip.
type SkipReason string

const (
	// SkipReasonNone indicates the candidate was NOT skipped by the gating checks.
	SkipReasonNone SkipReason = ""
	// SkipReasonUnsupportedTipo identifies a Tipo 1 (movie) or 2 (OVA) skip.
	SkipReasonUnsupportedTipo SkipReason = "unsupported_tipo"
	// SkipReasonMissingPagina identifies a missing/empty Pagina (site page URL) skip.
	SkipReasonMissingPagina SkipReason = "missing_pagina"
	// SkipReasonMissingCarpeta identifies a missing/empty Carpeta (destination folder) skip.
	SkipReasonMissingCarpeta SkipReason = "missing_carpeta"
)

// AnimeDownloadCandidate is the minimal projection of contracts.MobileAnime the gating
// decision needs (design.md §3.8: the download context consumes ListMobileAnimes()/
// GetMobileAnime(id), not ListAnimeItems(), because only MobileAnime carries Pagina/Carpeta).
// It deliberately mirrors only the fields relevant to EvaluateAnimeForDownload so this file
// has no dependency on the contracts package.
type AnimeDownloadCandidate struct {
	Tipo    *int    // nil or 0 = Serie (eligible); 1 = Pelicula, 2 = OVA (unsupported)
	Pagina  *string // site page URL; nil/empty = missing
	Carpeta *string // destination folder; nil/empty = missing
}

// AnimeDownloadDecision is the pure gating outcome for one anime candidate. When Skip is
// true, SkipReason identifies why and Err wraps the matching sentinel error from errors.go
// -- per spec, a skip MUST be a surfaced, observable reason, never a silent no-op.
type AnimeDownloadDecision struct {
	Skip       bool
	SkipReason SkipReason
	Err        error
}

// EvaluateAnimeForDownload runs the pure gating checks that decide whether an anime
// candidate should be excluded from a download run BEFORE any site resolution, scraping, or
// filesystem I/O is attempted:
//
//  1. Tipo 1 (Pelicula) or Tipo 2 (OVA) -> SkipReasonUnsupportedTipo (checked first: a
//     movie/OVA is out of scope regardless of its Pagina/Carpeta state).
//  2. Missing/empty Pagina -> SkipReasonMissingPagina.
//  3. Missing/empty Carpeta -> SkipReasonMissingCarpeta.
//
// A candidate that passes all three checks is NOT skipped (Skip=false, Err=nil) and
// proceeds to the online-vs-disk decision (NeedsDownload), which is evaluated separately
// once the caller has resolved a site adapter and an on-disk count.
func EvaluateAnimeForDownload(candidate AnimeDownloadCandidate) AnimeDownloadDecision {
	if candidate.Tipo != nil && unsupportedTipo[*candidate.Tipo] {
		return AnimeDownloadDecision{
			Skip:       true,
			SkipReason: SkipReasonUnsupportedTipo,
			Err:        ErrUnsupportedTipo,
		}
	}

	if candidate.Pagina == nil || *candidate.Pagina == "" {
		return AnimeDownloadDecision{
			Skip:       true,
			SkipReason: SkipReasonMissingPagina,
			Err:        ErrMissingPagina,
		}
	}

	if candidate.Carpeta == nil || *candidate.Carpeta == "" {
		return AnimeDownloadDecision{
			Skip:       true,
			SkipReason: SkipReasonMissingCarpeta,
			Err:        ErrMissingCarpeta,
		}
	}

	return AnimeDownloadDecision{Skip: false, SkipReason: SkipReasonNone}
}

package download

import "errors"

// Sentinel errors for internal/download (design.md §2 "errors.go"). Each represents a
// surfaced, observable failure/skip reason -- never a silent no-op (download-orchestration
// spec "Explicit Tipo 1/2 Skip"; "Missing Pagina/Carpeta Surfaced as Actionable State").
//
// Only the errors needed by Phase 3 (pure domain) are defined here. Later phases (adapters,
// scheduler, service) add their own sentinels to this same file as they are implemented.
var (
	// ErrUnsupportedTipo is returned/wrapped when an anime's Tipo is 1 (Pelicula) or 2 (OVA)
	// -- these are explicitly out of scope for the episodic download pipeline and MUST be
	// skipped with a surfaced reason, never silently treated as a series.
	ErrUnsupportedTipo = errors.New("download: anime tipo is unsupported for episodic download (movie/OVA)")

	// ErrMissingPagina is returned/wrapped when an anime has no configured Pagina (site page
	// URL), so the orchestrator cannot resolve a site adapter for it.
	ErrMissingPagina = errors.New("download: anime has no configured pagina")

	// ErrMissingCarpeta is returned/wrapped when an anime has no configured Carpeta
	// (destination folder), so the orchestrator MUST NOT attempt to enqueue or poll a
	// destination that does not exist.
	ErrMissingCarpeta = errors.New("download: anime has no configured carpeta")

	// ErrJDOffline is returned when JDownloader cannot be confirmed online (Connect()
	// succeeding is not sufficient -- ListDevices() is the only liveness proof, design §3.3
	// PoC #12 quirk). Defined here as a stub for Phase 4 (jdownloader adapter); not yet
	// produced by any Phase 3 code path.
	ErrJDOffline = errors.New("download: jdownloader is offline")

	// ErrNoLinks is returned when a site adapter extracts zero hoster download links for an
	// episode page that was expected to have at least one (download-sites spec "Download
	// Link Extraction Failure Surfacing"). Defined here as a stub for Phase 4 (jkanime
	// adapter); not yet produced by any Phase 3 code path.
	ErrNoLinks = errors.New("download: no download links extracted for episode")

	// ErrGapPageMissing is returned when a numbering-gap recovery path needs an episode page
	// that the site adapter could not locate. Defined here as a stub for Phase 4 (jkanime
	// adapter); not yet produced by any Phase 3 code path.
	ErrGapPageMissing = errors.New("download: episode page missing for numbering gap recovery")
)

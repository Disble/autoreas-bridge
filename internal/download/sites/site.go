// Package sites defines the EpisodeSource port (design.md §3.1) implemented by per-site
// scraper adapters (e.g. jkanime, PR3). It deliberately contains NO adapter implementation
// in this PR -- only the port and the value types adapters exchange with the orchestrator.
package sites

import "context"

// SiteDescriptor identifies a registered site adapter and its registry ordering.
type SiteDescriptor struct {
	Name     string // e.g. "jkanime"
	Priority int    // registry ordering; lower = resolved first when multiple adapters match
}

// EpisodeListing is the result of checking the latest episode available online for an anime.
type EpisodeListing struct {
	LatestEpisode  int // highest episode NUMBER available online (NOT a count of entries)
	EpisodePageURL string
}

// DownloadLink is a single hoster-tagged download link extracted from an episode page.
type DownloadLink struct {
	URL    string // decoded (base64 already resolved by the adapter)
	Hoster string // e.g. "Mediafire"
	Size   string
}

// EpisodeSource is the per-site scraper adapter port (design.md §3.1, PoC #5/#6/#7).
// Concrete adapters (e.g. the jkanime adapter, PR3) satisfy this interface and are
// registered into a SiteRegistry; the orchestrator never branches on site-specific logic
// directly.
type EpisodeSource interface {
	Descriptor() SiteDescriptor
	// Matches returns true if this source handles the given anime page URL.
	Matches(pageURL string) bool
	// ListEpisodes returns the latest online episode + episode page URL for the anime page.
	ListEpisodes(ctx context.Context, pageURL string) (EpisodeListing, error)
	// EpisodePageURL returns the canonical episode page URL for a specific episode number.
	EpisodePageURL(ctx context.Context, pageURL string, episode int) (string, error)
	// ExtractLinks returns hoster download links for a specific episode page.
	ExtractLinks(ctx context.Context, episodePageURL string) ([]DownloadLink, error)
}

package download

import (
	"errors"
	"sort"
	"strings"

	"autoreas-bridge/internal/download/sites"
)

// ErrSiteUnsupported is returned by SiteRegistry.Resolve when no registered adapter
// matches the given anime page URL (download-sites spec "Unregistered site yields an
// explicit, observable error").
var ErrSiteUnsupported = errors.New("download: no site adapter registered for this page URL")

// SiteRegistry resolves the highest-priority EpisodeSource whose Matches(pageURL) is true.
// The system MUST NOT use hardcoded string-contains branching to select a site adapter
// (download-sites spec "Site Adapter Registry Resolution").
type SiteRegistry interface {
	Resolve(pageURL string) (sites.EpisodeSource, error)
	Register(source sites.EpisodeSource)
}

// StaticRegistry is the in-code site registry (design.md §2/§3.2, ADR-3). There is NO
// persisted download_site_config table: adding a site is a code change (writing its
// adapter), so the registry lives in memory, populated at startup wiring time.
type StaticRegistry struct {
	sources []sites.EpisodeSource
}

// NewStaticRegistry returns an empty StaticRegistry ready for Register calls.
func NewStaticRegistry() *StaticRegistry {
	return &StaticRegistry{}
}

// Register adds a site adapter to the registry. Order of registration does not matter --
// Resolve always considers every registered adapter and picks the lowest Priority value
// among matches.
func (r *StaticRegistry) Register(source sites.EpisodeSource) {
	r.sources = append(r.sources, source)
}

// Resolve returns the EpisodeSource with the lowest SiteDescriptor.Priority among every
// registered adapter whose Matches(pageURL) is true. It returns ErrSiteUnsupported when no
// adapter matches (including on an empty registry) -- this MUST be a surfaced skip reason,
// never a silent no-op.
func (r *StaticRegistry) Resolve(pageURL string) (sites.EpisodeSource, error) {
	var best sites.EpisodeSource
	found := false

	for _, source := range r.sources {
		if !source.Matches(pageURL) {
			continue
		}
		if !found || source.Descriptor().Priority < best.Descriptor().Priority {
			best = source
			found = true
		}
	}

	if !found {
		return nil, ErrSiteUnsupported
	}
	return best, nil
}

var _ SiteRegistry = (*StaticRegistry)(nil)

// HosterPriorityEntry mirrors a download_hoster_priority row (design.md §3.6/§4).
type HosterPriorityEntry struct {
	Hoster   string
	Priority int
	Enabled  bool
}

// HosterResolver produces a deterministic, total order of hosters for a site (design.md
// §3.2/§4.4, ADR-HOSTER):
//  1. Configured hosters sort by Priority ascending.
//  2. Priority ties break alphabetically by hoster name, case-insensitive.
//  3. Unconfigured hosters (discovered but absent from the configured set) sort AFTER all
//     configured hosters, alphabetical among themselves.
//  4. Empty config falls back to alphabetical; Order never panics.
type HosterResolver interface {
	// Order returns the configured hoster priority for a site (low int = first).
	Order(site string) ([]HosterPriorityEntry, error)
	// OrderWithDiscovered merges configured priority with hosters discovered in scraped
	// links that may be absent from the configured set (rule 3 above).
	OrderWithDiscovered(site string, discoveredHosters []string) ([]HosterPriorityEntry, error)
}

// HosterPriorityLookup returns the configured hoster-priority rows for a site. It is
// satisfied today by an in-memory/fake source in tests; Phase 4 wires the real
// Store.ListHosterPriority here.
type HosterPriorityLookup func(site string) []HosterPriorityEntry

type hosterResolver struct {
	lookup HosterPriorityLookup
}

// NewHosterResolver builds a HosterResolver backed by the given lookup function.
func NewHosterResolver(lookup HosterPriorityLookup) HosterResolver {
	return &hosterResolver{lookup: lookup}
}

func (r *hosterResolver) Order(site string) ([]HosterPriorityEntry, error) {
	return r.OrderWithDiscovered(site, nil)
}

func (r *hosterResolver) OrderWithDiscovered(site string, discoveredHosters []string) ([]HosterPriorityEntry, error) {
	configured := []HosterPriorityEntry{}
	if r.lookup != nil {
		configured = append(configured, r.lookup(site)...)
	}

	configuredByName := make(map[string]bool, len(configured))
	for _, entry := range configured {
		configuredByName[strings.ToLower(entry.Hoster)] = true
	}

	unconfigured := []HosterPriorityEntry{}
	seenDiscovered := make(map[string]bool)
	for _, hoster := range discoveredHosters {
		key := strings.ToLower(hoster)
		if configuredByName[key] || seenDiscovered[key] {
			continue
		}
		seenDiscovered[key] = true
		unconfigured = append(unconfigured, HosterPriorityEntry{Hoster: hoster, Priority: 0, Enabled: true})
	}

	sort.SliceStable(configured, func(i, j int) bool {
		if configured[i].Priority != configured[j].Priority {
			return configured[i].Priority < configured[j].Priority
		}
		return strings.ToLower(configured[i].Hoster) < strings.ToLower(configured[j].Hoster)
	})

	sort.SliceStable(unconfigured, func(i, j int) bool {
		return strings.ToLower(unconfigured[i].Hoster) < strings.ToLower(unconfigured[j].Hoster)
	})

	return append(configured, unconfigured...), nil
}

var _ HosterResolver = (*hosterResolver)(nil)

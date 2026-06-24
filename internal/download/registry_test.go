package download

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/download/sites"
)

// fakeEpisodeSource is a minimal sites.EpisodeSource test double used to drive
// SiteRegistry.Resolve without depending on the real jkanime adapter (PR3 scope).
type fakeEpisodeSource struct {
	descriptor sites.SiteDescriptor
	matches    func(pageURL string) bool
}

func (f fakeEpisodeSource) Descriptor() sites.SiteDescriptor { return f.descriptor }

func (f fakeEpisodeSource) Matches(pageURL string) bool {
	if f.matches == nil {
		return false
	}
	return f.matches(pageURL)
}

func (f fakeEpisodeSource) ListEpisodes(ctx context.Context, pageURL string) (sites.EpisodeListing, error) {
	return sites.EpisodeListing{}, nil
}

func (f fakeEpisodeSource) ExtractLinks(ctx context.Context, episodePageURL string) ([]sites.DownloadLink, error) {
	return nil, nil
}

var _ sites.EpisodeSource = fakeEpisodeSource{}

func TestStaticRegistryResolveReturnsRegisteredAdapterForMatchingURL(t *testing.T) {
	t.Parallel()

	jkanime := fakeEpisodeSource{
		descriptor: sites.SiteDescriptor{Name: "jkanime", Priority: 0},
		matches:    func(pageURL string) bool { return pageURL == "https://jkanime.net/some-anime/" },
	}

	registry := NewStaticRegistry()
	registry.Register(jkanime)

	got, err := registry.Resolve("https://jkanime.net/some-anime/")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got.Descriptor().Name != "jkanime" {
		t.Fatalf("expected resolved adapter %q, got %q", "jkanime", got.Descriptor().Name)
	}
}

func TestStaticRegistryResolveReturnsErrSiteUnsupportedWhenNoneMatch(t *testing.T) {
	t.Parallel()

	jkanime := fakeEpisodeSource{
		descriptor: sites.SiteDescriptor{Name: "jkanime", Priority: 0},
		matches:    func(pageURL string) bool { return false },
	}

	registry := NewStaticRegistry()
	registry.Register(jkanime)

	_, err := registry.Resolve("https://unknown-site.example/anime/")
	if !errors.Is(err, ErrSiteUnsupported) {
		t.Fatalf("expected ErrSiteUnsupported, got %v", err)
	}
}

func TestStaticRegistryResolveOnEmptyRegistryReturnsErrSiteUnsupported(t *testing.T) {
	t.Parallel()

	registry := NewStaticRegistry()

	_, err := registry.Resolve("https://jkanime.net/some-anime/")
	if !errors.Is(err, ErrSiteUnsupported) {
		t.Fatalf("expected ErrSiteUnsupported on empty registry, got %v", err)
	}
}

func TestStaticRegistryResolvePrefersHigherPriorityWhenMultipleMatch(t *testing.T) {
	t.Parallel()

	low := fakeEpisodeSource{
		descriptor: sites.SiteDescriptor{Name: "low-priority", Priority: 10},
		matches:    func(pageURL string) bool { return true },
	}
	high := fakeEpisodeSource{
		descriptor: sites.SiteDescriptor{Name: "high-priority", Priority: 0},
		matches:    func(pageURL string) bool { return true },
	}

	registry := NewStaticRegistry()
	registry.Register(low)
	registry.Register(high)

	got, err := registry.Resolve("https://anything.example/")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got.Descriptor().Name != "high-priority" {
		t.Fatalf("expected the lowest-priority-number (highest-priority) adapter to win, got %q", got.Descriptor().Name)
	}
}

// fakeHosterPrioritySource is an in-memory stand-in for the (Phase-4) SQLite-backed
// hoster-priority lookup; it lets PR1 exercise the deterministic ordering rule (design §4.4
// / ADR-HOSTER) before the real store exists.
type fakeHosterPrioritySource struct {
	entries map[string][]HosterPriorityEntry
}

func (f fakeHosterPrioritySource) ListHosterPriority(site string) []HosterPriorityEntry {
	return f.entries[site]
}

func TestHosterResolverOrderSortsConfiguredHostersByPriorityAscending(t *testing.T) {
	t.Parallel()

	source := fakeHosterPrioritySource{entries: map[string][]HosterPriorityEntry{
		"jkanime": {
			{Hoster: "Mega", Priority: 1},
			{Hoster: "Mediafire", Priority: 0},
		},
	}}
	resolver := NewHosterResolver(source.ListHosterPriority)

	got, err := resolver.Order("jkanime")
	if err != nil {
		t.Fatalf("order: %v", err)
	}

	want := []string{"Mediafire", "Mega"}
	assertHosterOrder(t, got, want)
}

func TestHosterResolverOrderBreaksPriorityTiesAlphabeticallyCaseInsensitive(t *testing.T) {
	t.Parallel()

	source := fakeHosterPrioritySource{entries: map[string][]HosterPriorityEntry{
		"jkanime": {
			{Hoster: "zippyshare", Priority: 5},
			{Hoster: "Buzzheavier", Priority: 5},
			{Hoster: "AnonFiles", Priority: 5},
		},
	}}
	resolver := NewHosterResolver(source.ListHosterPriority)

	got, err := resolver.Order("jkanime")
	if err != nil {
		t.Fatalf("order: %v", err)
	}

	want := []string{"AnonFiles", "Buzzheavier", "zippyshare"}
	assertHosterOrder(t, got, want)
}

func TestHosterResolverOrderPlacesUnconfiguredHostersAfterConfiguredAlphabetically(t *testing.T) {
	t.Parallel()

	source := fakeHosterPrioritySource{entries: map[string][]HosterPriorityEntry{
		"jkanime": {
			{Hoster: "Mega", Priority: 1},
			{Hoster: "Mediafire", Priority: 0},
		},
	}}
	resolver := NewHosterResolver(source.ListHosterPriority)

	got, err := resolver.OrderWithDiscovered("jkanime", []string{"Zippyshare", "Mega", "Doodstream", "Mediafire"})
	if err != nil {
		t.Fatalf("order with discovered: %v", err)
	}

	want := []string{"Mediafire", "Mega", "Doodstream", "Zippyshare"}
	assertHosterOrder(t, got, want)
}

func TestHosterResolverOrderOnEmptyConfigFallsBackToAlphabeticalNeverPanics(t *testing.T) {
	t.Parallel()

	source := fakeHosterPrioritySource{entries: map[string][]HosterPriorityEntry{}}
	resolver := NewHosterResolver(source.ListHosterPriority)

	got, err := resolver.OrderWithDiscovered("jkanime", []string{"Zippyshare", "Mega", "Mediafire"})
	if err != nil {
		t.Fatalf("order with discovered on empty config: %v", err)
	}

	want := []string{"Mediafire", "Mega", "Zippyshare"}
	assertHosterOrder(t, got, want)
}

func assertHosterOrder(t *testing.T, got []HosterPriorityEntry, wantHosters []string) {
	t.Helper()
	if len(got) != len(wantHosters) {
		t.Fatalf("expected %d hosters, got %d (%#v)", len(wantHosters), len(got), got)
	}
	for i, want := range wantHosters {
		if got[i].Hoster != want {
			t.Fatalf("expected hoster at index %d to be %q, got %q (full=%#v)", i, want, got[i].Hoster, got)
		}
	}
}

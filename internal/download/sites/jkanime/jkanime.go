// Package jkanime implements the sites.EpisodeSource port (design.md §3.1/§2.1 rows 5-7) for
// jkanime.net/jkanime.bz. It lifts the WORKING extraction logic validated in cmd/poc/scraper.go
// (CSRF + anime-ID extraction, AJAX episode listing, base64 "var servers" link extraction) behind
// the EpisodeSource interface, isolating the regex so a future DOM-parser rewrite swaps only this
// adapter (design ADR-10).
package jkanime

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"

	"autoreas-bridge/internal/download/sites"
)

const defaultBaseURL = "https://jkanime.net"

// animeIDPattern matches the data-anime="(\d+)" attribute on the anime info page (PoC
// scraper.go fetchAnimeInfo). Isolated as a package-level regex so it is the single place a
// future template change must update.
var animeIDPattern = regexp.MustCompile(`data-anime="(\d+)"`)

// csrfTokenPattern matches the <meta name="csrf-token" content="..."> tag.
var csrfTokenPattern = regexp.MustCompile(`<meta\s+name="csrf-token"\s+content="([^"]+)"`)

// serversArrayPattern matches the inline `var servers = [...]` JSON array on an episode page.
var serversArrayPattern = regexp.MustCompile(`var servers\s*=\s*(\[[\s\S]*?\]);`)

// jkanimeEpisode mirrors one entry of the AJAX episodes response (PoC scraper.go).
type jkanimeEpisode struct {
	Number int `json:"number"`
	ID     int `json:"id"`
}

// jkanimeEpisodesResponse mirrors the AJAX endpoint's JSON envelope.
type jkanimeEpisodesResponse struct {
	Success bool             `json:"success"`
	Data    []jkanimeEpisode `json:"data"`
	Total   int              `json:"total"`
}

// jkanimeServerLink mirrors one entry of the inline `var servers` array.
type jkanimeServerLink struct {
	Remote string `json:"remote"` // base64-encoded URL
	Server string `json:"server"`
	Size   string `json:"size"`
}

// Adapter implements sites.EpisodeSource for jkanime.net/jkanime.bz.
type Adapter struct {
	client  *http.Client
	baseURL string
}

// New returns a jkanime Adapter using the given HTTP client (a cookiejar is attached so the
// CSRF-token-bearing session survives across the page+AJAX calls, mirroring the validated PoC
// session handling).
func New(client *http.Client) *Adapter {
	return newWithBaseURL(client, defaultBaseURL)
}

// newWithBaseURL is the test seam: it lets tests point the AJAX endpoint at an httptest.Server
// while still exercising the real extraction code path (no live network in CI).
func newWithBaseURL(client *http.Client, baseURL string) *Adapter {
	if client == nil {
		client = http.DefaultClient
	}
	withJar := client
	if client.Jar == nil {
		jar, _ := cookiejar.New(nil)
		cloned := *client
		cloned.Jar = jar
		withJar = &cloned
	}
	return &Adapter{client: withJar, baseURL: strings.TrimRight(baseURL, "/")}
}

// Descriptor identifies this adapter to the SiteRegistry (design §3.2).
func (a *Adapter) Descriptor() sites.SiteDescriptor {
	return sites.SiteDescriptor{Name: "jkanime", Priority: 0}
}

// Matches reports whether pageURL is a jkanime.net or jkanime.bz anime page.
func (a *Adapter) Matches(pageURL string) bool {
	return strings.Contains(pageURL, "jkanime.net") || strings.Contains(pageURL, "jkanime.bz")
}

// ListEpisodes fetches the anime page (CSRF/ID) then the AJAX episode listing, returning the
// HIGHEST online episode NUMBER (download-orchestration spec "Online numbering gap is compared
// by highest number, not entry count") and the episode page URL for the latest episode.
func (a *Adapter) ListEpisodes(ctx context.Context, pageURL string) (sites.EpisodeListing, error) {
	pagina := ensureTrailingSlash(pageURL)

	animeID, csrfToken, err := a.fetchAnimeInfo(ctx, pagina)
	if err != nil {
		return sites.EpisodeListing{}, fmt.Errorf("jkanime: fetch anime info: %w", err)
	}

	episodes, _, err := a.fetchEpisodes(ctx, animeID, csrfToken)
	if err != nil {
		return sites.EpisodeListing{}, fmt.Errorf("jkanime: fetch episodes: %w", err)
	}

	latest := 0
	for _, ep := range episodes {
		if ep.Number > latest {
			latest = ep.Number
		}
	}

	if latest == 0 {
		// "total==0" is NOT an error (download-sites spec "AJAX reports zero total") -- the
		// caller (decision.go's NeedsDownload) sees LatestEpisode=0, which never exceeds a
		// non-negative on-disk count, so no download triggers.
		return sites.EpisodeListing{LatestEpisode: 0}, nil
	}

	return sites.EpisodeListing{
		LatestEpisode:  latest,
		EpisodePageURL: fmt.Sprintf("%s%d/", pagina, latest),
	}, nil
}

// EpisodePageURL returns the jkanime episode page URL for a specific episode number.
func (a *Adapter) EpisodePageURL(ctx context.Context, pageURL string, episode int) (string, error) {
	return fmt.Sprintf("%s%d/", ensureTrailingSlash(pageURL), episode), nil
}

// ExtractLinks fetches an episode page and extracts hoster-tagged download links from the
// inline `var servers` array. Per download-sites spec "Download Link Extraction Failure
// Surfacing", zero links is ALWAYS a loud error -- never a silent empty success.
func (a *Adapter) ExtractLinks(ctx context.Context, episodePageURL string) ([]sites.DownloadLink, error) {
	body, err := a.fetchGET(ctx, episodePageURL)
	if err != nil {
		return nil, fmt.Errorf("jkanime: fetch episode page: %w", err)
	}

	matches := serversArrayPattern.FindStringSubmatch(body)
	if len(matches) < 2 {
		return nil, fmt.Errorf("jkanime: servers array not found on episode page (template drift): %s", episodePageURL)
	}

	var servers []jkanimeServerLink
	if err := json.Unmarshal([]byte(matches[1]), &servers); err != nil {
		return nil, fmt.Errorf("jkanime: parse servers JSON: %w", err)
	}

	links := make([]sites.DownloadLink, 0, len(servers))
	for _, srv := range servers {
		decoded, err := base64.StdEncoding.DecodeString(srv.Remote)
		if err != nil {
			continue // skip invalid entries; the zero-links-overall guard below still fires loudly
		}
		links = append(links, sites.DownloadLink{
			URL:    strings.TrimRight(string(decoded), "\n\r "),
			Hoster: srv.Server,
			Size:   srv.Size,
		})
	}

	if len(links) == 0 {
		return nil, fmt.Errorf("jkanime: zero download links extracted for episode page %s", episodePageURL)
	}

	return links, nil
}

// fetchAnimeInfo fetches the anime main page and extracts the anime ID and CSRF token required
// for the episode-listing AJAX call (download-sites spec "jkanime CSRF and Anime ID Extraction").
func (a *Adapter) fetchAnimeInfo(ctx context.Context, pagina string) (animeID string, csrfToken string, err error) {
	body, err := a.fetchGET(ctx, pagina)
	if err != nil {
		return "", "", err
	}

	idMatches := animeIDPattern.FindStringSubmatch(body)
	if len(idMatches) < 2 {
		return "", "", fmt.Errorf("anime ID not found in %s", pagina)
	}
	animeID = idMatches[1]

	tokenMatches := csrfTokenPattern.FindStringSubmatch(body)
	if len(tokenMatches) < 2 {
		return animeID, "", fmt.Errorf("CSRF token not found in %s", pagina)
	}
	csrfToken = tokenMatches[1]

	return animeID, csrfToken, nil
}

// fetchEpisodes retrieves the episode list via the AJAX endpoint. A response with total==0 and
// an empty data array is a SUCCESSFUL "no episodes available" outcome, distinguishable from an
// extraction/network failure (download-sites spec "jkanime Episode Listing via AJAX").
func (a *Adapter) fetchEpisodes(ctx context.Context, animeID, csrfToken string) ([]jkanimeEpisode, int, error) {
	ajaxURL := fmt.Sprintf("%s/ajax/episodes/%s/1", a.baseURL, animeID)

	formData := url.Values{}
	formData.Set("_token", csrfToken)

	body, err := a.fetchPOST(ctx, ajaxURL, formData)
	if err != nil {
		return nil, 0, err
	}

	var resp jkanimeEpisodesResponse
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		return nil, 0, fmt.Errorf("parse AJAX JSON: %w", err)
	}

	// total==0 && len(data)==0 is NOT an error -- it is a successful "no episodes" result.
	return resp.Data, resp.Total, nil
}

func (a *Adapter) fetchGET(ctx context.Context, pageURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return "", fmt.Errorf("create GET request: %w", err)
	}
	applyBrowserHeaders(req)

	resp, err := a.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("GET %s: %w", pageURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET %s: HTTP %d", pageURL, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read body: %w", err)
	}
	return string(body), nil
}

func (a *Adapter) fetchPOST(ctx context.Context, postURL string, formData url.Values) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, postURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return "", fmt.Errorf("create POST request: %w", err)
	}
	applyBrowserHeaders(req)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")

	resp, err := a.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("POST %s: %w", postURL, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("POST %s: HTTP %d - %s", postURL, resp.StatusCode, truncate(string(body), 200))
	}

	return string(body), nil
}

func applyBrowserHeaders(req *http.Request) {
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "es,en;q=0.9")
	req.Header.Set("Referer", defaultBaseURL+"/")
}

func ensureTrailingSlash(pageURL string) string {
	if strings.HasSuffix(pageURL, "/") {
		return pageURL
	}
	return pageURL + "/"
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

var _ sites.EpisodeSource = (*Adapter)(nil)

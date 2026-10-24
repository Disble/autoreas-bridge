package jkanime

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	sharedlogger "autoreas-bridge/internal/logger"
)

// defaultBaseURLs is the host fallback chain (ADR-029). jkanime.net is the canonical host
// every stored anime page URL uses; jkanime.org and jkanime.bz are the site's own mirrors,
// serving the identical pages, CSRF flow and AJAX routes. On 2026-10-23 jkanime.net went
// behind a whole-domain Cloudflare managed challenge while both mirrors stayed open, so a
// challenged host hands the operation to the next one. The chain restarts at jkanime.net on
// every operation: no host is remembered, so a lifted challenge heals without a release.
var defaultBaseURLs = []string{defaultBaseURL, "https://jkanime.org", "https://jkanime.bz"}

// canonicalHost is the host a mirror-hosted page URL is rewritten to before it leaves the
// package, so the stored anime identity never depends on which mirror answered.
const canonicalHost = "jkanime.net"

// mirrorHosts are the public hosts that serve the same site as canonicalHost.
var mirrorHosts = []string{canonicalHost, "jkanime.org", "jkanime.bz"}

// errChallenged marks a response Cloudflare answered with a managed challenge instead of
// the page. Only this error moves an operation to the next host; any other failure,
// including a plain 403, is the site's real answer and surfaces unchanged.
var errChallenged = errors.New("cloudflare challenge")

// isChallenge reports whether resp is Cloudflare's managed-challenge interstitial
// (HTTP 403 + `Cf-Mitigated: challenge`).
func isChallenge(resp *http.Response) bool {
	return resp.StatusCode == http.StatusForbidden && strings.EqualFold(resp.Header.Get("Cf-Mitigated"), "challenge")
}

// hostChain is an ordered list of base URLs (scheme://host, no trailing slash) that serve
// the same site.
type hostChain []string

// newHostChain normalizes the given base URLs.
func newHostChain(baseURLs []string) hostChain {
	chain := make(hostChain, 0, len(baseURLs))
	for _, base := range baseURLs {
		chain = append(chain, strings.TrimRight(base, "/"))
	}
	return chain
}

// rebase moves pageURL onto base when pageURL lives on one of the chain's hosts. The
// second result is false for a URL outside the chain, which is then fetched as given.
func (c hostChain) rebase(pageURL, base string) (string, bool) {
	for _, known := range c {
		if strings.HasPrefix(pageURL, known+"/") {
			return base + pageURL[len(known):], true
		}
	}
	return pageURL, false
}

// try runs op against each host in order until one is not challenged. op receives the
// base URL to use and pageURL rebased onto it. A URL outside the chain runs once. When
// every host is challenged the error names every host tried and wraps the last failure,
// which itself wraps errChallenged. Each move to the next host is written to log as a
// jkanime.host_fallback warning, so Activity and the request MCP show which host answered.
func (c hostChain) try(pageURL string, log sharedlogger.Logger, op func(base, pageURL string) error) error {
	var tried []string
	var err error
	for i, base := range c {
		target, inChain := c.rebase(pageURL, base)
		err = op(base, target)
		if !errors.Is(err, errChallenged) {
			return err
		}
		tried = append(tried, base)
		if !inChain {
			break
		}
		if i+1 < len(c) {
			from, to := hostOf(base), hostOf(c[i+1])
			log.Logf("jkanime", sharedlogger.LevelWarn, sharedlogger.Fields{
				EventType: "jkanime.host_fallback",
				Metadata:  map[string]any{"from": from, "to": to},
			}, "%s is behind a Cloudflare challenge, trying %s", from, to)
		}
	}
	return fmt.Errorf("every jkanime host is behind a Cloudflare challenge (%s): %w", strings.Join(tried, ", "), err)
}

// canonicalPageURL rewrites a mirror-hosted page URL onto canonicalHost. Any other URL,
// including one already on canonicalHost, is returned byte for byte.
func canonicalPageURL(pageURL string) string {
	parsed, err := url.Parse(pageURL)
	if err != nil {
		return pageURL
	}
	for _, host := range mirrorHosts[1:] {
		if strings.EqualFold(parsed.Host, host) {
			parsed.Host = canonicalHost
			return parsed.String()
		}
	}
	return pageURL
}

// hostOf returns the host of a chain base URL (scheme://host).
func hostOf(base string) string {
	_, host, _ := strings.Cut(base, "://")
	return host
}

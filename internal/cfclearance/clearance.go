package cfclearance

import (
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/net/publicsuffix"
)

// clearanceCookie is the cookie Cloudflare checks to let a solved client through.
const clearanceCookie = "cf_clearance"

// cloudflareCookiePrefix marks Cloudflare's own auxiliary cookies (__cf_bm, __cfruid, ...).
const cloudflareCookiePrefix = "__cf"

// Clearance is what a solved challenge yields: the cookies Cloudflare issued and the exact
// User-Agent that earned them, because Cloudflare binds the clearance to that identity. The
// two travel together so a replay can never pair a fresh cookie with a stale identity.
type Clearance struct {
	Cookies   []*http.Cookie
	UserAgent string
}

// cloudflareCookies keeps Cloudflare's own cookies out of cookies, scoped to host when the
// engine reported no domain; site session cookies stay with the caller's own jar.
func cloudflareCookies(cookies []*http.Cookie, host string) []*http.Cookie {
	out := make([]*http.Cookie, 0, len(cookies))
	for _, c := range cookies {
		if c.Name != clearanceCookie && !strings.HasPrefix(c.Name, cloudflareCookiePrefix) {
			continue
		}
		kept := *c
		if kept.Domain == "" {
			kept.Domain = host
		}
		out = append(out, &kept)
	}
	return out
}

// hasFreshClearance reports whether cookies carry a cf_clearance other than rejected.
func hasFreshClearance(cookies []*http.Cookie, rejected string) bool {
	for _, c := range cookies {
		if c.Name == clearanceCookie && c.Value != "" && c.Value != rejected {
			return true
		}
	}
	return false
}

// cookieMatches reports whether a stored cookie applies to u by domain and path, the way a
// browser decides which cookies accompany a request: a domain cookie covers its domain and
// every subdomain, and a path cookie covers its path and everything below it.
func cookieMatches(c *http.Cookie, u *url.URL) bool {
	host := strings.ToLower(u.Hostname())
	domain := strings.ToLower(strings.TrimPrefix(c.Domain, "."))
	if host != domain && !strings.HasSuffix(host, "."+domain) {
		return false
	}
	return pathMatches(c.Path, u.Path)
}

// pathMatches reports whether a cookie path covers the request path (RFC 6265 section 5.1.4).
func pathMatches(cookiePath, requestPath string) bool {
	if cookiePath == "" {
		cookiePath = "/"
	}
	if requestPath == "" {
		requestPath = "/"
	}
	if requestPath == cookiePath {
		return true
	}
	if !strings.HasPrefix(requestPath, cookiePath) {
		return false
	}
	return strings.HasSuffix(cookiePath, "/") || requestPath[len(cookiePath)] == '/'
}

// registrableDomain is the eTLD+1 a clearance is scoped to (cdn.x.net -> x.net); a host
// without one, such as an IP address, is its own domain.
func registrableDomain(host string) string {
	if d, err := publicsuffix.EffectiveTLDPlusOne(host); err == nil {
		return d
	}
	return host
}

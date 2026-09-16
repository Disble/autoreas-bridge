package myanimelist

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// defaultFetchTimeout is the production default: generous enough for
// MyAnimeList's search/detail endpoints, short enough not to block the
// UI-facing search binding indefinitely.
const defaultFetchTimeout = 10 * time.Second

// defaultMaxBytes caps the response body read when the caller passes zero
// or a negative maxBytes.
const defaultMaxBytes = 2 << 20 // 2 MiB

// defaultUserAgent is the fallback used when the caller passes an empty
// userAgent. It is still an honest, attributable identifier — never a
// browser impersonation (design's Threat Matrix). Production callers
// (internal/desktop) are expected to pass the real, ldflags-stamped bridge
// version instead of relying on this fallback.
const defaultUserAgent = "autoreas-bridge/dev"

// httpClient is the default Fetcher adapter: an *http.Client honouring
// both a fixed timeout and ctx cancellation, with the response body capped
// at maxBytes via io.LimitReader so a hostile/huge response can never be
// fully buffered. Mirrors internal/anime/cover/http_fetcher.go's
// port/adapter shape.
type httpClient struct {
	client    *http.Client
	maxBytes  int64
	userAgent string
}

// NewHTTPClient constructs a production Fetcher. timeout <= 0 falls back
// to defaultFetchTimeout; userAgent == "" falls back to defaultUserAgent.
// Callers should pass an honest "autoreas-bridge/<version>" string.
func NewHTTPClient(timeout time.Duration, maxBytes int64, userAgent string) *httpClient {
	if timeout <= 0 {
		timeout = defaultFetchTimeout
	}
	if userAgent == "" {
		userAgent = defaultUserAgent
	}
	return &httpClient{
		client:    &http.Client{Timeout: timeout},
		maxBytes:  maxBytes,
		userAgent: userAgent,
	}
}

// Fetch implements Fetcher: it issues a GET request against url and
// returns the response body, capped at maxBytes. A non-200 status returns
// ErrNotFound (404) or ErrUnexpectedStatus (any other non-200) instead of
// a body.
func (c *httpClient) Fetch(ctx context.Context, url string) (body []byte, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := resp.Body.Close(); err == nil && closeErr != nil {
			body = nil
			err = fmt.Errorf("close myanimelist response body: %w", closeErr)
		}
	}()

	switch resp.StatusCode {
	case http.StatusOK:
		// fall through to the body read below
	case http.StatusNotFound:
		return nil, fmt.Errorf("%w: %s", ErrNotFound, url)
	default:
		return nil, fmt.Errorf("%w: status %d for %s", ErrUnexpectedStatus, resp.StatusCode, url)
	}

	limit := c.maxBytes
	if limit <= 0 {
		limit = defaultMaxBytes
	}
	body, err = io.ReadAll(io.LimitReader(resp.Body, limit))
	if err != nil {
		return nil, err
	}
	return body, nil
}

package cover

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// defaultFetchTimeout is the production default: generous enough for a slow
// CDN, short enough not to block the UI-facing GetAnimeCover binding
// indefinitely.
const defaultFetchTimeout = 10 * time.Second

// httpFetcher is the default Fetcher adapter: an *http.Client honouring both
// a fixed timeout and ctx cancellation, with the response body capped at
// maxBytes via io.LimitReader so a hostile/huge response can never be fully
// buffered (the Resolver's own size guard then rejects an over-cap body).
type httpFetcher struct {
	client   *http.Client
	maxBytes int64
}

// NewHTTPFetcher constructs a production Fetcher. timeout <= 0 falls back to
// defaultFetchTimeout.
func NewHTTPFetcher(timeout time.Duration, maxBytes int64) *httpFetcher {
	if timeout <= 0 {
		timeout = defaultFetchTimeout
	}
	return &httpFetcher{
		client:   &http.Client{Timeout: timeout},
		maxBytes: maxBytes,
	}
}

func (f *httpFetcher) Fetch(ctx context.Context, url string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("cover fetch: unexpected status %d", resp.StatusCode)
	}

	limit := f.maxBytes
	if limit <= 0 {
		limit = defaultMaxBytes
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit))
	if err != nil {
		return nil, "", err
	}
	return data, resp.Header.Get("Content-Type"), nil
}

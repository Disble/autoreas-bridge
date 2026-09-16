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

// httpFetcher is the default Fetcher adapter. It returns only complete 200
// bodies and classifies origin/transport failures without inspecting text.
type httpFetcher struct {
	client   *http.Client
	maxBytes int64
	now      func() time.Time
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
		now:      time.Now,
	}
}

func (f *httpFetcher) Fetch(ctx context.Context, url string) (result FetchResult, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return FetchResult{}, fmt.Errorf("%w: create cover request: %w", ErrTransient, err)
	}

	resp, err := f.client.Do(req)
	if err != nil {
		return FetchResult{}, fmt.Errorf("%w: request cover: %w", ErrTransient, err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); err == nil && closeErr != nil {
			result = FetchResult{}
			err = fmt.Errorf("%w: close cover response body: %w", ErrTransient, closeErr)
		}
	}()

	result.StatusCode = resp.StatusCode
	result.ContentType = resp.Header.Get("Content-Type")
	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
			result.RetryAfterSeconds, _ = parseRetryAfter(resp.Header.Get("Retry-After"), f.now())
		}
		return result, originStatusError(resp.StatusCode)
	}

	limit := f.maxBytes
	if limit <= 0 {
		limit = defaultMaxBytes
	}
	if resp.ContentLength > limit {
		return FetchResult{StatusCode: resp.StatusCode, ContentType: result.ContentType}, ErrInvalid
	}
	data, readErr := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if readErr != nil {
		return FetchResult{}, fmt.Errorf("%w: read cover response: %w", ErrTransient, readErr)
	}
	if int64(len(data)) > limit {
		return FetchResult{StatusCode: resp.StatusCode, ContentType: result.ContentType}, ErrInvalid
	}
	result.Data = data
	return result, nil
}

// originStatusError classifies an origin response by status family and its
// explicitly retryable exceptions.
func originStatusError(status int) error {
	switch {
	case status == http.StatusRequestTimeout, status == http.StatusTooManyRequests, status >= 500:
		return fmt.Errorf("%w: origin status %d", ErrTransient, status)
	case status >= 400 && status < 500:
		return fmt.Errorf("%w: origin status %d", ErrGone, status)
	default:
		return fmt.Errorf("%w: origin status %d", ErrTransient, status)
	}
}

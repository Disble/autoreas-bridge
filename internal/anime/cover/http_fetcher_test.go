package cover

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

// roundTripperFunc adapts a function to http.RoundTripper so each test can
// inject exactly the transport behaviour it needs without a real network
// call.
type roundTripperFunc func(req *http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

// newFetcherWithTransport creates a fetcher with a test transport.
func newFetcherWithTransport(rt http.RoundTripper, timeout time.Duration, maxBytes int64) *httpFetcher {
	fetcher := NewHTTPFetcher(timeout, maxBytes)
	fetcher.client.Transport = rt
	return fetcher
}

func TestHTTPFetcherFetchReturnsBodyAndContentTypeHeader(t *testing.T) {
	t.Parallel()

	fetcher := newFetcherWithTransport(roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("jpeg-bytes")),
			Header:     http.Header{"Content-Type": []string{"image/jpeg"}},
		}, nil
	}), time.Second, 1<<20)

	got, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/x.jpg")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if string(got.Data) != "jpeg-bytes" || got.ContentType != "image/jpeg" || got.StatusCode != http.StatusOK {
		t.Fatalf("Fetch() = %#v, want successful body, content type, and status", got)
	}
}

func TestHTTPFetcherFetchRejectsLimitPlusOneWithoutReturningPrefix(t *testing.T) {
	t.Parallel()

	const limit = 16
	body := strings.NewReader(strings.Repeat("x", limit+2))
	fetcher := newFetcherWithTransport(roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(body),
			Header:     http.Header{"Content-Type": []string{"image/jpeg"}},
		}, nil
	}), time.Second, limit)

	got, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/huge.jpg")
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("Fetch() error = %v, want invalid classification", err)
	}
	if got.Data != nil {
		t.Fatalf("Fetch() data = %q, want no truncated prefix", got.Data)
	}
	if body.Len() != 1 {
		t.Fatalf("remaining body bytes = %d, want 1", body.Len())
	}
	exact := newFetcherWithTransport(roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(strings.Repeat("x", limit)))}, nil
	}), time.Second, limit)
	got, err = exact.Fetch(context.Background(), "https://cdn.example.com/exact.jpg")
	if err != nil || len(got.Data) != limit {
		t.Fatalf("Fetch() = %#v, %v; want exactly-limit streamed body", got, err)
	}
}

func TestHTTPFetcherFetchRejectsDeclaredOversizeWithoutReturningBody(t *testing.T) {
	t.Parallel()

	const limit = 16
	fetcher := newFetcherWithTransport(roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode:    http.StatusOK,
			ContentLength: limit + 1,
			Body:          io.NopCloser(strings.NewReader("ignored")),
			Header:        http.Header{},
		}, nil
	}), time.Second, limit)

	got, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/declared-huge.jpg")
	if !errors.Is(err, ErrInvalid) || got.Data != nil {
		t.Fatalf("Fetch() = %#v, %v; want invalid without body", got, err)
	}
	exact := newFetcherWithTransport(roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, ContentLength: limit, Body: io.NopCloser(strings.NewReader(strings.Repeat("x", limit)))}, nil
	}), time.Second, limit)
	got, err = exact.Fetch(context.Background(), "https://cdn.example.com/declared-exact.jpg")
	if err != nil || len(got.Data) != limit {
		t.Fatalf("Fetch() = %#v, %v; want exactly-limit declared body", got, err)
	}
}

func TestHTTPFetcherFetchClassifiesOriginStatusAndRetryAfter(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		status    int
		retry     string
		want      error
		wantRetry int
	}{
		{name: "399 is transient", status: 399, want: ErrTransient},
		{name: "400 is gone", status: 400, want: ErrGone},
		{name: "499 is gone", status: 499, want: ErrGone},
		{name: "500 is transient", status: 500, want: ErrTransient},
		{name: "forbidden is gone", status: http.StatusForbidden, want: ErrGone},
		{name: "request timeout is transient", status: http.StatusRequestTimeout, retry: "22", want: ErrTransient},
		{name: "too many requests carries retry", status: http.StatusTooManyRequests, retry: "22", want: ErrTransient, wantRetry: 22},
		{name: "service unavailable carries retry", status: http.StatusServiceUnavailable, retry: "7200", want: ErrTransient, wantRetry: 3600},
		{name: "server failure is transient", status: http.StatusBadGateway, retry: "22", want: ErrTransient},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fetcher := newFetcherWithTransport(roundTripperFunc(func(*http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: tc.status,
					Body:       io.NopCloser(strings.NewReader("origin error")),
					Header:     http.Header{"Retry-After": []string{tc.retry}},
				}, nil
			}), time.Second, 100)

			got, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/status")
			if !errors.Is(err, tc.want) {
				t.Fatalf("Fetch() error = %v, want %v classification", err, tc.want)
			}
			if got.Data != nil || got.RetryAfterSeconds != tc.wantRetry {
				t.Fatalf("Fetch() = %#v, want no body and retry %d", got, tc.wantRetry)
			}
		})
	}
}

func TestHTTPFetcherFetchClassifiesTransportAndCancellationAsTransient(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		err  error
	}{
		{name: "network", err: errors.New("connection reset")},
		{name: "cancelled", err: context.Canceled},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fetcher := newFetcherWithTransport(roundTripperFunc(func(*http.Request) (*http.Response, error) {
				return nil, tc.err
			}), time.Second, 100)

			_, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/failure")
			if !errors.Is(err, ErrTransient) {
				t.Fatalf("Fetch() error = %v, want transient classification", err)
			}
		})
	}
}

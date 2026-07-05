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

func newFetcherWithTransport(rt http.RoundTripper, timeout time.Duration, maxBytes int64) *httpFetcher {
	fetcher := NewHTTPFetcher(timeout, maxBytes)
	fetcher.client.Transport = rt
	return fetcher
}

func TestHTTPFetcherFetchReturnsBodyAndContentTypeHeader(t *testing.T) {
	t.Parallel()

	rt := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("jpeg-bytes")),
			Header:     http.Header{"Content-Type": []string{"image/jpeg"}},
		}, nil
	})
	fetcher := newFetcherWithTransport(rt, time.Second, 1<<20)

	data, contentType, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/x.jpg")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if string(data) != "jpeg-bytes" {
		t.Fatalf("expected body jpeg-bytes, got %q", data)
	}
	if contentType != "image/jpeg" {
		t.Fatalf("expected content-type image/jpeg, got %q", contentType)
	}
}

func TestHTTPFetcherFetchWithNoContentTypeHeaderReturnsEmptyString(t *testing.T) {
	t.Parallel()

	rt := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("bytes")),
			Header:     http.Header{},
		}, nil
	})
	fetcher := newFetcherWithTransport(rt, time.Second, 1<<20)

	_, contentType, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/x")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if contentType != "" {
		t.Fatalf("expected empty content-type when header absent (Resolver sniffs), got %q", contentType)
	}
}

func TestHTTPFetcherFetchNon200StatusReturnsErrorWithoutLeakingBody(t *testing.T) {
	t.Parallel()

	rt := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       io.NopCloser(strings.NewReader("not found")),
			Header:     http.Header{},
		}, nil
	})
	fetcher := newFetcherWithTransport(rt, time.Second, 1<<20)

	data, _, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/missing.jpg")
	if err == nil {
		t.Fatal("expected error on non-200 status")
	}
	if data != nil {
		t.Fatalf("expected no body on error, got %q", data)
	}
}

func TestHTTPFetcherFetchTimesOutPastClientTimeout(t *testing.T) {
	t.Parallel()

	rt := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		select {
		case <-req.Context().Done():
			return nil, req.Context().Err()
		case <-time.After(2 * time.Second):
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader("late"))}, nil
		}
	})
	fetcher := newFetcherWithTransport(rt, 20*time.Millisecond, 1<<20)

	_, _, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/slow.jpg")
	if err == nil {
		t.Fatal("expected a timeout error")
	}
}

func TestHTTPFetcherFetchPropagatesContextCancellation(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	rt := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return nil, errors.New("should not be reached after cancellation")
	})
	fetcher := newFetcherWithTransport(rt, time.Second, 1<<20)

	_, _, err := fetcher.Fetch(ctx, "https://cdn.example.com/x.jpg")
	if err == nil {
		t.Fatal("expected error from a pre-cancelled context")
	}
}

func TestHTTPFetcherFetchCapsBodyReadAtMaxBytes(t *testing.T) {
	t.Parallel()

	const maxBytes = 16
	hostile := strings.Repeat("x", maxBytes*4)
	rt := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(hostile)),
			Header:     http.Header{"Content-Type": []string{"image/jpeg"}},
		}, nil
	})
	fetcher := newFetcherWithTransport(rt, time.Second, maxBytes)

	data, _, err := fetcher.Fetch(context.Background(), "https://cdn.example.com/huge.jpg")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(data) > maxBytes {
		t.Fatalf("expected fetcher to cap body at %d bytes, got %d", maxBytes, len(data))
	}
}

package cover_test

import (
	"context"
	"errors"
	"io/fs"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/cover"
)

func TestResolverLoadClassifiesAbsentWithoutIO(t *testing.T) {
	t.Parallel()

	files := &fakeFileReader{}
	fetch := &fakeFetcher{}
	resolver := cover.NewResolver(files, fetch, newFakeCache(), 0)
	for _, source := range []string{"", "null"} {
		_, err := resolver.Load(context.Background(), source)
		if !errors.Is(err, cover.ErrAbsent) {
			t.Fatalf("Load(%q) error = %v, want absent classification", source, err)
		}
	}
	if files.statCalls != 0 || files.readCalls != 0 || fetch.calls != 0 {
		t.Fatalf("unexpected I/O: stat=%d read=%d fetch=%d", files.statCalls, files.readCalls, fetch.calls)
	}
}

func TestResolverLoadBuildsLocalIdentityFromStat(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	modified := time.Date(2026, 9, 14, 12, 0, 0, 123, time.UTC)
	files := &fakeFileReader{
		files: map[string][]byte{path: jpegBytes},
		infos: map[string]cover.FileInfo{path: fakeFileInfo{size: 42, modTime: modified}},
	}
	resolver := cover.NewResolver(files, nil, nil, 100)
	source, err := resolver.Load(context.Background(), path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if source.Identity.LocalPath != path || source.Identity.Size != 42 || source.Identity.ModTimeUnixNano != modified.UnixNano() {
		t.Fatalf("local identity = %#v, want path, size, and mtime from Stat", source.Identity)
	}
	if files.statCalls != 1 || files.readCalls != 1 {
		t.Fatalf("local I/O calls = stat:%d read:%d, want one each", files.statCalls, files.readCalls)
	}
}

type failingCache struct {
	*fakeCache
}

func (failingCache) Put(string, []byte) error {
	return errors.New("cache unavailable")
}

func TestResolverLoadClassifiesLocalMissingAndReadFailure(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	cases := []struct {
		name  string
		files cover.FileReader
		want  error
	}{
		{name: "nil file reader", want: cover.ErrTransient},
		{
			name:  "missing stat",
			files: &fakeFileReader{statErrors: map[string]error{path: fs.ErrNotExist}},
			want:  cover.ErrGone,
		},
		{
			name: "read failure",
			files: &fakeFileReader{
				infos:      map[string]cover.FileInfo{path: fakeFileInfo{size: 42, modTime: time.Unix(10, 0)}},
				readErrors: map[string]error{path: errors.New("access denied")},
			},
			want: cover.ErrTransient,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resolver := cover.NewResolver(tc.files, nil, nil, 100)
			_, err := resolver.Load(context.Background(), path)
			if !errors.Is(err, tc.want) {
				t.Fatalf("Load() error = %v, want %v classification", err, tc.want)
			}
		})
	}
}

// newOriginLoadFixture wires a resolver whose raw cache optionally holds cached
// bytes or fails every write, and returns the recording cache behind it.
func newOriginLoadFixture(url string, cached []byte, fetch cover.Fetcher, failing bool, limit int64) (*cover.Resolver, *fakeCache) {
	cache := newFakeCache()
	if cached != nil {
		cache.entries[url] = cached
	}
	var loaderCache cover.Cache = cache
	if failing {
		loaderCache = failingCache{fakeCache: cache}
	}
	return cover.NewResolver(&fakeFileReader{}, fetch, loaderCache, limit), cache
}

func TestResolverLoadMapsOriginOutcomesAndAvoidsOversizeCacheWrites(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/cover.jpg"
	cases := []struct {
		name         string
		result       cover.FetchResult
		err          error
		want         error
		retry        int
		cache        bool
		limit        int64
		cached       []byte
		nilFetcher   bool
		failingCache bool
	}{
		{name: "origin forbidden", err: cover.ErrGone, want: cover.ErrGone, limit: 10},
		{name: "origin timeout", err: cover.ErrTransient, want: cover.ErrTransient, limit: 10},
		{name: "network failure", err: errors.New("connection reset"), want: cover.ErrTransient, limit: 10},
		{name: "origin retry estimate", result: cover.FetchResult{RetryAfterSeconds: 17}, err: cover.ErrTransient, want: cover.ErrTransient, retry: 17, limit: 10},
		{name: "image bytes exceed one-byte max", result: cover.FetchResult{Data: jpegBytes}, want: cover.ErrInvalid, limit: 1},
		{name: "exact result", result: cover.FetchResult{Data: jpegBytes}, cache: true, limit: 11},
		{name: "oversize result", result: cover.FetchResult{Data: append(append([]byte{}, jpegBytes...), 0)}, want: cover.ErrInvalid, limit: 11},
		{name: "non-image origin", result: cover.FetchResult{Data: []byte("<html>error</html>"), ContentType: "text/html"}, want: cover.ErrInvalid, limit: 64},
		{name: "oversize cached bytes", cached: make([]byte, 11), want: cover.ErrInvalid, limit: 10},
		{name: "nil fetcher", want: cover.ErrTransient, limit: 10, nilFetcher: true},
		{name: "cache persistence failure", result: cover.FetchResult{Data: jpegBytes}, want: cover.ErrTransient, limit: 20, failingCache: true},
		{name: "valid origin", result: cover.FetchResult{Data: jpegBytes}, cache: true, limit: 20},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var fetch cover.Fetcher = &fakeFetcher{result: tc.result, err: tc.err}
			if tc.nilFetcher {
				fetch = nil
			}
			resolver, cache := newOriginLoadFixture(url, tc.cached, fetch, tc.failingCache, tc.limit)
			source, err := resolver.Load(context.Background(), url)
			// errors.Is(nil, nil) is true, so a nil want also asserts success.
			if !errors.Is(err, tc.want) {
				t.Fatalf("Load() error = %v, want %v classification", err, tc.want)
			}
			if source.RetryAfterSeconds != tc.retry {
				t.Fatalf("retry estimate = %d, want %d", source.RetryAfterSeconds, tc.retry)
			}
			if got := len(cache.putCalls) > 0; got != tc.cache {
				t.Fatalf("cache write = %v, want %v", got, tc.cache)
			}
		})
	}
}

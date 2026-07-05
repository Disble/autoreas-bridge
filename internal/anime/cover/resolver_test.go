package cover_test

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime/cover"
)

func TestClassify(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		path string
		want cover.Kind
	}{
		{name: "empty string is absent", path: "", want: cover.KindAbsent},
		{name: "literal null sentinel is absent", path: "null", want: cover.KindAbsent},
		{name: "https url", path: "https://cdn.jkdesu.com/x.jpg", want: cover.KindURL},
		{name: "http url", path: "http://example.com/x.jpg", want: cover.KindURL},
		{name: "ftp url", path: "ftp://example.com/x.jpg", want: cover.KindURL},
		{name: "windows local path", path: `C:\anime\cover.jpg`, want: cover.KindLocalPath},
		{name: "posix local path", path: "/mnt/covers/x.png", want: cover.KindLocalPath},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := cover.Classify(tc.path); got != tc.want {
				t.Fatalf("Classify(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}

// fakeFileReader is a map-backed FileReader: keys present in files resolve
// successfully, everything else returns an error (mirrors os.ReadFile on a
// missing path).
type fakeFileReader struct {
	files map[string][]byte
}

func (f *fakeFileReader) ReadFile(path string) ([]byte, error) {
	data, ok := f.files[path]
	if !ok {
		return nil, errors.New("file not found")
	}
	return data, nil
}

// fakeFetcher records call count and returns a single canned response for
// every call (or the canned error).
type fakeFetcher struct {
	calls       int
	data        []byte
	contentType string
	err         error
}

func (f *fakeFetcher) Fetch(_ context.Context, _ string) ([]byte, string, error) {
	f.calls++
	return f.data, f.contentType, f.err
}

// fakeCache is an in-memory Cache double that also records Put calls so
// tests can assert cache-poisoning never happens on a failed resolution.
type fakeCache struct {
	entries  map[string][]byte
	putCalls []string
}

func newFakeCache() *fakeCache {
	return &fakeCache{entries: map[string][]byte{}}
}

func (c *fakeCache) Get(key string) ([]byte, bool) {
	data, ok := c.entries[key]
	return data, ok
}

func (c *fakeCache) Put(key string, data []byte) error {
	c.putCalls = append(c.putCalls, key)
	c.entries[key] = data
	return nil
}

// jpegBytes is a minimal byte sequence http.DetectContentType sniffs as
// image/jpeg (the JPEG SOI marker plus JFIF bytes are enough).
var jpegBytes = []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00}

func TestResolverResolveEmptyOrNullSentinelReturnsPlaceholderWithoutIO(t *testing.T) {
	t.Parallel()

	files := &fakeFileReader{files: map[string][]byte{}}
	fetch := &fakeFetcher{}
	cache := newFakeCache()
	r := cover.NewResolver(files, fetch, cache, 0)

	for _, path := range []string{"", "null"} {
		got := r.Resolve(context.Background(), "anime-1", path)
		if got.IsCover {
			t.Fatalf("Resolve(%q) = %#v, want placeholder", path, got)
		}
	}
	if fetch.calls != 0 {
		t.Fatalf("expected fetcher never called, got %d calls", fetch.calls)
	}
}

func TestResolverResolveLocalPathPresentReturnsDataURLWithSniffedMIME(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	files := &fakeFileReader{files: map[string][]byte{path: jpegBytes}}
	r := cover.NewResolver(files, &fakeFetcher{}, newFakeCache(), 0)

	got := r.Resolve(context.Background(), "anime-1", path)
	if !got.IsCover {
		t.Fatalf("expected cover result for existing local path, got %#v", got)
	}
	if got.DataURL == "" {
		t.Fatal("expected non-empty data URL")
	}
	const wantPrefix = "data:image/jpeg;base64,"
	if len(got.DataURL) < len(wantPrefix) || got.DataURL[:len(wantPrefix)] != wantPrefix {
		t.Fatalf("expected data URL to start with %q, got %q", wantPrefix, got.DataURL)
	}
}

func TestResolverResolveLocalPathMissingReturnsPlaceholderWithoutPanicking(t *testing.T) {
	t.Parallel()

	files := &fakeFileReader{files: map[string][]byte{}}
	r := cover.NewResolver(files, &fakeFetcher{}, newFakeCache(), 0)

	got := r.Resolve(context.Background(), "anime-1", `C:\missing\cover.jpg`)
	if got.IsCover {
		t.Fatalf("expected placeholder for missing local path, got %#v", got)
	}
}

func TestResolverResolveURLCacheHitReturnsCachedBytesWithoutFetching(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/cover.jpg"
	cache := newFakeCache()
	cache.entries[url] = jpegBytes
	fetch := &fakeFetcher{}
	r := cover.NewResolver(&fakeFileReader{}, fetch, cache, 0)

	got := r.Resolve(context.Background(), "anime-1", url)
	if !got.IsCover {
		t.Fatalf("expected cover result on cache hit, got %#v", got)
	}
	if fetch.calls != 0 {
		t.Fatalf("expected fetcher not called on cache hit, got %d calls", fetch.calls)
	}
}

func TestResolverResolveURLCacheMissSuccessfulFetchPersistsAndServes(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/cover.jpg"
	fetch := &fakeFetcher{data: jpegBytes, contentType: "image/jpeg"}
	cache := newFakeCache()
	r := cover.NewResolver(&fakeFileReader{}, fetch, cache, 0)

	got := r.Resolve(context.Background(), "anime-1", url)
	if !got.IsCover {
		t.Fatalf("expected cover result on successful download, got %#v", got)
	}
	if fetch.calls != 1 {
		t.Fatalf("expected exactly one fetch call, got %d", fetch.calls)
	}
	if len(cache.putCalls) != 1 || cache.putCalls[0] != url {
		t.Fatalf("expected Cache.Put called once with the source URL, got %#v", cache.putCalls)
	}
}

func TestResolverResolveURLCacheMissFetchErrorDegradesWithoutPoisoningCache(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/cover.jpg"
	fetch := &fakeFetcher{err: errors.New("connection refused")}
	cache := newFakeCache()
	r := cover.NewResolver(&fakeFileReader{}, fetch, cache, 0)

	got := r.Resolve(context.Background(), "anime-1", url)
	if got.IsCover {
		t.Fatalf("expected placeholder on fetch error, got %#v", got)
	}
	if len(cache.putCalls) != 0 {
		t.Fatalf("expected no cache writes on fetch error, got %#v", cache.putCalls)
	}
}

func TestResolverResolveURLNonImageContentTypeDegradesToPlaceholder(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/error-page"
	fetch := &fakeFetcher{data: []byte("<html>error</html>"), contentType: "text/html"}
	cache := newFakeCache()
	r := cover.NewResolver(&fakeFileReader{}, fetch, cache, 0)

	got := r.Resolve(context.Background(), "anime-1", url)
	if got.IsCover {
		t.Fatalf("expected placeholder for non-image content-type, got %#v", got)
	}
	if len(cache.putCalls) != 0 {
		t.Fatalf("expected non-image bodies never cached, got %#v", cache.putCalls)
	}
}

func TestResolverResolveURLOversizeBodyDegradesToPlaceholder(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/huge.jpg"
	oversize := make([]byte, 0, len(jpegBytes)+10)
	oversize = append(oversize, jpegBytes...)
	oversize = append(oversize, make([]byte, 10)...)
	fetch := &fakeFetcher{data: oversize, contentType: "image/jpeg"}
	cache := newFakeCache()
	r := cover.NewResolver(&fakeFileReader{}, fetch, cache, int64(len(jpegBytes)))

	got := r.Resolve(context.Background(), "anime-1", url)
	if got.IsCover {
		t.Fatalf("expected placeholder for oversize body, got %#v", got)
	}
	if len(cache.putCalls) != 0 {
		t.Fatalf("expected oversize bodies never cached, got %#v", cache.putCalls)
	}
}

func TestResolverResolveURLPrefersContentTypeHeaderOverSniffedMIME(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/cover.jpg"
	// jpegBytes would sniff as image/jpeg; assert the header wins by using a
	// distinguishable (still image/*) header value.
	fetch := &fakeFetcher{data: jpegBytes, contentType: "image/webp"}
	r := cover.NewResolver(&fakeFileReader{}, fetch, newFakeCache(), 0)

	got := r.Resolve(context.Background(), "anime-1", url)
	if !got.IsCover {
		t.Fatalf("expected cover result, got %#v", got)
	}
	const wantPrefix = "data:image/webp;base64,"
	if len(got.DataURL) < len(wantPrefix) || got.DataURL[:len(wantPrefix)] != wantPrefix {
		t.Fatalf("expected header content-type to win, got %q", got.DataURL)
	}
}

func TestNewDefaultResolverIsNonNilAndDegradesGracefullyOnCacheRootFailure(t *testing.T) {
	t.Parallel()

	r := cover.NewDefaultResolver(0)
	if r == nil {
		t.Fatal("expected a non-nil default resolver")
	}

	// Empty/null portada must still resolve to a placeholder through the
	// fully-wired production adapters, with no panic anywhere in the chain.
	got := r.Resolve(context.Background(), "anime-1", "")
	if got.IsCover {
		t.Fatalf("expected placeholder for empty portada, got %#v", got)
	}
}

func TestResolverResolveLocalSourceIsNeverCopiedIntoCache(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	files := &fakeFileReader{files: map[string][]byte{path: jpegBytes}}
	cache := newFakeCache()
	r := cover.NewResolver(files, &fakeFetcher{}, cache, 0)

	got := r.Resolve(context.Background(), "anime-1", path)
	if !got.IsCover {
		t.Fatalf("expected cover result for local path, got %#v", got)
	}
	if len(cache.putCalls) != 0 {
		t.Fatalf("expected local-disk source never written to cache, got %#v", cache.putCalls)
	}
}

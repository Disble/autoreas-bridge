package cover_test

import (
	"context"
	"errors"
	"io/fs"
	"testing"
	"time"

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

// fakeFileInfo supplies metadata for the FileReader stat seam.
type fakeFileInfo struct {
	size    int64
	modTime time.Time
}

func (i fakeFileInfo) Size() int64        { return i.size }
func (i fakeFileInfo) ModTime() time.Time { return i.modTime }

// fakeFileReader is a map-backed FileReader: keys present in files resolve
// successfully, everything else returns a missing-file error.
type fakeFileReader struct {
	files      map[string][]byte
	infos      map[string]cover.FileInfo
	statErrors map[string]error
	readErrors map[string]error
	statCalls  int
	readCalls  int
}

func (f *fakeFileReader) Stat(path string) (cover.FileInfo, error) {
	f.statCalls++
	if err := f.statErrors[path]; err != nil {
		return nil, err
	}
	if info, ok := f.infos[path]; ok {
		return info, nil
	}
	if data, ok := f.files[path]; ok {
		return fakeFileInfo{size: int64(len(data))}, nil
	}
	return nil, fs.ErrNotExist
}

func (f *fakeFileReader) ReadFile(path string) ([]byte, error) {
	f.readCalls++
	if err := f.readErrors[path]; err != nil {
		return nil, err
	}
	data, ok := f.files[path]
	if !ok {
		return nil, fs.ErrNotExist
	}
	return data, nil
}

// fakeFetcher records call count and returns a single canned response for
// every call (or the canned error).
type fakeFetcher struct {
	calls       int
	data        []byte
	contentType string
	result      cover.FetchResult
	err         error
}

func (f *fakeFetcher) Fetch(_ context.Context, _ string) (cover.FetchResult, error) {
	f.calls++
	if f.result.Data != nil || f.result.StatusCode != 0 || f.result.RetryAfterSeconds != 0 {
		return f.result, f.err
	}
	return cover.FetchResult{Data: f.data, ContentType: f.contentType}, f.err
}

// fakeCache is an in-memory Cache double that also records Put calls so
// tests can assert cache-poisoning never happens on a failed resolution.
type fakeCache struct {
	entries  map[string][]byte
	putCalls []string
}

// newFakeCache creates an empty in-memory cache for resolver tests.
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

func TestNewDefaultResolverIsNonNilAndDegradesGracefullyOnCacheRootFailure(t *testing.T) {
	t.Parallel()

	r := cover.NewDefaultResolver(0)
	if r == nil {
		t.Fatal("expected a non-nil default resolver")
	}

	// An empty portada must still classify as absent through the fully-wired production adapters,
	// with no panic anywhere in the chain.
	if _, err := r.Load(context.Background(), ""); !errors.Is(err, cover.ErrAbsent) {
		t.Fatalf("Load(\"\") error = %v, want ErrAbsent", err)
	}
}

// TestResolverLoadLocalSourceNeverTouchesTheCache keeps the guarantee the deleted Resolve suite
// carried: a local disk cover loads from the filesystem and is never copied into the raw cache.
func TestResolverLoadLocalSourceNeverTouchesTheCache(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	cache := newFakeCache()
	resolver := cover.NewResolver(&fakeFileReader{files: map[string][]byte{path: jpegBytes}}, &fakeFetcher{}, cache, 0)

	source, err := resolver.Load(context.Background(), path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if source.Kind != cover.KindLocalPath || len(source.Bytes) == 0 {
		t.Fatalf("source = %#v, want the local bytes with their kind", source)
	}
	if len(cache.putCalls) != 0 {
		t.Fatalf("expected a local-disk source never to be written to the cache, got %#v", cache.putCalls)
	}
}

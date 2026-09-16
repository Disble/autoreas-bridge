package cover

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/cover/thumbnail"
)

// fakeLoader is a package-private, mutable-between-calls test double for sourceLoader.
type fakeLoader struct {
	result Source
	err    error
}

func (f *fakeLoader) Load(context.Context, string) (Source, error) { return f.result, f.err }

// fakeStore is a package-private test double for thumbnailStore; onPut observes internal state exactly when a cache write happens.
type fakeStore struct {
	putErr error
	onPut  func()
}

// get always misses: these tests exercise the miss path, and the real versioned cache covers hits.
func (*fakeStore) get(int, SourceIdentity) ([]byte, string, bool) { return nil, "", false }

// put runs onPut when set, then returns the configured canned error.
func (f *fakeStore) put(int, SourceIdentity, []byte, string) error {
	if f.onPut != nil {
		f.onPut()
	}
	return f.putErr
}

// fakeTransform is a deterministic transformFunc keyed only by its input bytes, so orchestration tests need no real image bytes.
func fakeTransform(data []byte, _ thumbnail.Options) (thumbnail.Result, error) {
	return thumbnail.Result{Bytes: data, ETag: `"etag:` + string(data) + `"`}, nil
}

// countingTransform wraps fakeTransform in a call counter, proving whether the transform ran at all.
func countingTransform(calls *int) transformFunc {
	return func(data []byte, opts thumbnail.Options) (thumbnail.Result, error) {
		*calls++
		return fakeTransform(data, opts)
	}
}

// testFetcher returns URL-derived bytes for every request, satisfying Fetcher without an HTTP server.
type testFetcher struct{}

func (testFetcher) Fetch(_ context.Context, url string) (FetchResult, error) {
	return FetchResult{Data: []byte(url), ContentType: "image/jpeg"}, nil
}

// freshSlots returns a fully available two-slot gate.
func freshSlots() chan struct{} {
	slots := make(chan struct{}, 2)
	slots <- struct{}{}
	slots <- struct{}{}
	return slots
}

// newTestService builds a ThumbnailService over the given doubles and slot gate.
func newTestService(loader sourceLoader, store thumbnailStore, transform transformFunc, slots chan struct{}) *ThumbnailService {
	return &ThumbnailService{load: loader, store: store, transform: transform, slots: slots}
}

// mustRecv reads from ch or fails after 5 seconds, so a mutant that breaks a park/release path cannot hang the suite.
func mustRecv[T any](t *testing.T, ch <-chan T) (v T) {
	t.Helper()
	select {
	case v = <-ch:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting to receive")
	}
	return v
}

// TestThumbnailServiceInvalidatesLocalIdentity proves a cache hit serves the persisted entry without any transform call or slot acquisition, and that a changed local identity regenerates with a new ETag.
func TestThumbnailServiceInvalidatesLocalIdentity(t *testing.T) {
	t.Parallel()

	loader := &fakeLoader{}
	var transformCalls int
	cache := newThumbnailCache(t.TempDir())
	svc := newTestService(loader, cache, countingTransform(&transformCalls), freshSlots())

	loader.result = Source{Bytes: []byte("v1"), Identity: SourceIdentity{LocalPath: `C:\cover.jpg`, Size: 1, ModTimeUnixNano: 1}}
	first, err := svc.GetDesktop(context.Background(), "path")
	if err != nil || transformCalls != 1 {
		t.Fatalf("first GetDesktop: err=%v, transform calls=%d, want nil err and 1 call", err, transformCalls)
	}
	assertEntry(t, cache, 1, loader.result.Identity, string(first.Bytes), first.ETag)

	svc.slots = make(chan struct{}, 2) // drained: a cache hit must not need to acquire
	hit, err := svc.GetHTTP(context.Background(), "path")
	if err != nil || hit.ETag != first.ETag || string(hit.Bytes) != string(first.Bytes) {
		t.Fatalf("cache-hit GetHTTP = (%+v, %v), want the same entry as %+v with no error", hit, err, first)
	}
	if transformCalls != 1 {
		t.Fatalf("transform calls = %d, want still 1: a cache hit must bypass the slot gate", transformCalls)
	}

	svc.slots = freshSlots()
	loader.result = Source{Bytes: []byte("v2"), Identity: SourceIdentity{LocalPath: `C:\cover.jpg`, Size: 2, ModTimeUnixNano: 2}}
	second, err := svc.GetDesktop(context.Background(), "path")
	if err != nil || transformCalls != 2 {
		t.Fatalf("second GetDesktop: err=%v, transform calls=%d, want nil err and 2 calls (a changed identity regenerates)", err, transformCalls)
	}
	if first.ETag == second.ETag {
		t.Fatalf("a changed local identity must produce a different ETag, both were %s", first.ETag)
	}
}

// sidecarCache is a Cache double that also reports one persisted origin identity, so the sidecar
// reuse rule is provable without depending on a freshly written file being readable under load.
type sidecarCache struct {
	sha       string
	published []string
}

// Get always misses, so the loader takes its origin-fetch path.
func (c *sidecarCache) Get(string) ([]byte, bool) { return nil, false }

// Put accepts the raw origin entry.
func (c *sidecarCache) Put(string, []byte) error { return nil }

// originSHA256 reports the canned persisted identity.
func (c *sidecarCache) originSHA256(string) (string, bool) { return c.sha, c.sha != "" }

// putOriginSHA256 records an attempted publication of a recomputed identity.
func (c *sidecarCache) putOriginSHA256(_, sha string) error {
	c.published = append(c.published, sha)
	return nil
}

// TestResolverLoadReusesThePersistedSidecarIdentity proves the loader keeps a persisted origin
// identity instead of re-deriving it from the bytes: an identity the bytes could never hash to is
// what the loaded source carries, and no identity is republished. The rule lives in the loader, so
// the assertion is made there: a derived-cache readback would add a filesystem round-trip to a
// Windows platform that can hold a freshly written file briefly unavailable.
func TestResolverLoadReusesThePersistedSidecarIdentity(t *testing.T) {
	t.Parallel()

	const seeded = "seeded-identity-proving-sidecar-reuse"
	cache := &sidecarCache{sha: seeded}

	source, err := NewResolver(nil, testFetcher{}, cache, 0).Load(context.Background(), "https://cdn.example.com/cover.jpg")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if source.Identity.OriginSHA256 != seeded {
		t.Fatalf("identity = %q, want the persisted sidecar identity %q", source.Identity.OriginSHA256, seeded)
	}
	if len(cache.published) != 0 {
		t.Fatalf("republished identities = %v, want none: a persisted sidecar must be reused", cache.published)
	}
	if len(source.Bytes) == 0 {
		t.Fatal("loaded source has no bytes")
	}
}

// TestThumbnailServiceMapsPermanentAndTransientOutcomes proves every loader/transform/cache outcome maps to its documented class, including any retry estimate.
func TestThumbnailServiceMapsPermanentAndTransientOutcomes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		loaderErr    error
		retry        int
		putErr       error
		transformErr error
		cancelled    bool
		want         error
	}{
		{name: "absent", loaderErr: ErrAbsent, want: ErrAbsent},
		{name: "gone", loaderErr: ErrGone, want: ErrGone},
		{name: "invalid", loaderErr: ErrInvalid, want: ErrInvalid},
		{name: "transient with retry estimate", loaderErr: ErrTransient, retry: 17, want: ErrTransient},
		{name: "cache put failure is transient", putErr: errors.New("disk full"), want: ErrTransient},
		{name: "transform failure is invalid", transformErr: errors.New("decode: corrupt"), want: ErrInvalid},
		{name: "cancelled context while waiting for a slot is transient", cancelled: true, want: ErrTransient},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			transform := fakeTransform
			if tc.transformErr != nil {
				transform = func([]byte, thumbnail.Options) (thumbnail.Result, error) { return thumbnail.Result{}, tc.transformErr }
			}
			ctx, slots := context.Background(), freshSlots()
			if tc.cancelled {
				slots = make(chan struct{}, 2) // drained: acquireWaiting can only observe cancellation
				var cancel context.CancelFunc
				ctx, cancel = context.WithCancel(ctx)
				cancel()
			}

			loader := &fakeLoader{err: tc.loaderErr, result: Source{Bytes: []byte("bytes"), RetryAfterSeconds: tc.retry}}
			svc := newTestService(loader, &fakeStore{putErr: tc.putErr}, transform, slots)

			result, err := svc.GetDesktop(ctx, "path")
			if !errors.Is(err, tc.want) || result.RetryAfterSeconds != tc.retry {
				t.Fatalf("error = %v, retry = %d, want %v with retry %d", err, result.RetryAfterSeconds, tc.want, tc.retry)
			}
		})
	}
}

// TestThumbnailServiceSlotsGateOnlyTransformWork proves the constructor's two-slot gate bounds only decode/resize/encode: two transforms hold it, so HTTP acquisition saturates with the fixed retry while a third desktop call waits instead of failing fast (design D5). Each goroutine uses a distinct URL so its cache key is distinct and no concurrent write can turn a transform into a cache hit.
func TestThumbnailServiceSlotsGateOnlyTransformWork(t *testing.T) {
	t.Parallel()

	arrived, release := make(chan struct{}, 3), make(chan struct{})
	svc := NewThumbnailService(NewResolver(nil, testFetcher{}, NewDiskCache(t.TempDir()), 0), t.TempDir())
	svc.transform = func(data []byte, opts thumbnail.Options) (thumbnail.Result, error) {
		arrived <- struct{}{}
		<-release
		return fakeTransform(data, opts)
	}
	probe := newTestService(&fakeLoader{result: Source{Bytes: []byte("probe")}}, &fakeStore{}, fakeTransform, svc.slots)
	svc.httpAcquireWait, probe.httpAcquireWait = time.Millisecond, time.Millisecond

	outcomes := make(chan error, 3)
	for _, url := range []string{"https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg", "https://cdn.example.com/3.jpg"} {
		go func() { _, err := svc.GetDesktop(context.Background(), url); outcomes <- err }()
	}
	mustRecv(t, arrived)
	mustRecv(t, arrived)

	if len(svc.slots) != 0 {
		t.Fatalf("slots available with two transforms in flight = %d, want 0", len(svc.slots))
	}
	if result, err := probe.GetHTTP(context.Background(), "probe"); !errors.Is(err, ErrTransient) || result.RetryAfterSeconds != 5 {
		t.Fatalf("GetHTTP with both slots held = (%v, retry %d), want ErrTransient retry 5", err, result.RetryAfterSeconds)
	}

	close(release)
	mustRecv(t, arrived) // the third desktop call waited for a released slot instead of failing fast
	for range 3 {
		if err := mustRecv(t, outcomes); err != nil {
			t.Fatalf("concurrent GetDesktop: %v", err)
		}
	}
}

// TestThumbnailServiceCacheWriteDoesNotHoldASlot proves a derived-cache write happens after the slot is released, so a slow store never extends the bounded window (design D5).
func TestThumbnailServiceCacheWriteDoesNotHoldASlot(t *testing.T) {
	t.Parallel()

	slots := freshSlots()
	var duringPut int
	svc := newTestService(&fakeLoader{result: Source{Bytes: []byte("x")}}, &fakeStore{onPut: func() { duringPut = len(slots) }}, fakeTransform, slots)

	if _, err := svc.GetDesktop(context.Background(), "path"); err != nil {
		t.Fatalf("GetDesktop: %v", err)
	}
	if duringPut != cap(slots) {
		t.Fatalf("slots available during store.put = %d, want %d (both free before the cache write)", duringPut, cap(slots))
	}
}

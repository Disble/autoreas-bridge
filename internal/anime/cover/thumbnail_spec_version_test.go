package cover

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"autoreas-bridge/internal/anime/cover/thumbnail"
)

// previousSpecVersion is the rule identity the bridge served before the 480 px / JPEG q85 policy. A real user's
// cache root already holds entries at that version, so it is seeded by name and must never satisfy the current spec.
const previousSpecVersion = 1

// currentPolicySpecVersion is the on-disk namespace the current policy persists under, spelled out rather than read from
// the production constant: it describes what a cache root already contains, so a service looking under another
// namespace must fail here instead of silently agreeing with a changed constant.
const currentPolicySpecVersion = 2

// TestThumbnailServiceCacheVersionBoundary proves a previous spec version's derived entry cannot satisfy the current
// rules through the public service boundary, that the regenerated output is published under the current version with
// its own ETag and then served consistently from the cache, and that no other stored artifact is disturbed.
func TestThumbnailServiceCacheVersionBoundary(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/cover.jpg"
	root := t.TempDir()
	cache := newThumbnailCache(root)
	source := tallCoverJPEG(t)
	identity := SourceIdentity{OriginSHA256: sha256Hex(source)}

	// The artifacts a live cache root holds beside a derived entry: the raw origin bytes and their identity sidecar.
	raw := NewDiskCache(root)
	if err := raw.Put(url, source); err != nil {
		t.Fatalf("seed raw origin entry: %v", err)
	}
	if err := raw.putOriginSHA256(url, identity.OriginSHA256); err != nil {
		t.Fatalf("seed origin identity sidecar: %v", err)
	}
	mustPut(t, cache, previousSpecVersion, identity, "previous-spec-bytes", `"previous-spec-etag"`)

	svc := newTestService(&fakeLoader{result: Source{Bytes: source, Identity: identity}}, cache, thumbnail.Transform, freshSlots())
	ctx := context.Background()

	first, err := svc.GetDesktop(ctx, url)
	if err != nil {
		t.Fatalf("GetDesktop: %v", err)
	}
	if string(first.Bytes) == "previous-spec-bytes" || first.ETag == `"previous-spec-etag"` {
		t.Fatal("served the previous spec version's entry; a rule change must turn it into a cache miss")
	}
	if want := `"` + sha256Hex(first.Bytes) + `"`; first.ETag != want {
		t.Fatalf("ETag = %q, want %q, the strong validator of exactly the served bytes", first.ETag, want)
	}
	assertEntry(t, cache, thumbnail.SpecVersion, identity, string(first.Bytes), first.ETag)

	// A cache hit acquires no slot, so a drained gate proves the second serve came from the published entry.
	svc.slots = make(chan struct{}, 2)
	second, err := svc.GetHTTP(ctx, url)
	if err != nil {
		t.Fatalf("GetHTTP of the published entry: %v", err)
	}
	if second.ETag != first.ETag || !bytes.Equal(second.Bytes, first.Bytes) {
		t.Fatalf("second serve = %d bytes ETag %s, want the first serve's %d bytes and ETag %s", len(second.Bytes), second.ETag, len(first.Bytes), first.ETag)
	}

	// The rule change adds a new version directory; it deletes and rewrites nothing that was already stored.
	assertEntry(t, cache, previousSpecVersion, identity, "previous-spec-bytes", `"previous-spec-etag"`)
	if got, ok := raw.Get(url); !ok || !bytes.Equal(got, source) {
		t.Fatalf("raw origin entry = %d bytes, %v; want the untouched source bytes", len(got), ok)
	}
	if got, ok := raw.originSHA256(url); !ok || got != identity.OriginSHA256 {
		t.Fatalf("origin sidecar = %q, %v; want the untouched identity %q", got, ok, identity.OriginSHA256)
	}
}

// TestThumbnailServiceReusesThePersistedCurrentPolicyEntry proves the persisted-cache contract rather than the value of a
// constant: an entry already on disk under the current policy's version is served byte-for-byte with its own ETag even
// when no transform could run, and that serve adds no further version namespace and rewrites no origin artifact.
func TestThumbnailServiceReusesThePersistedCurrentPolicyEntry(t *testing.T) {
	t.Parallel()

	const url = "https://cdn.example.com/cover.jpg"
	root := t.TempDir()
	cache := newThumbnailCache(root)
	source := tallCoverJPEG(t)
	identity := SourceIdentity{OriginSHA256: sha256Hex(source)}

	// A genuine current-policy derivative, persisted at the version directory a previous run of the current policy wrote.
	derived, err := thumbnail.Transform(source, thumbnail.Options{})
	if err != nil {
		t.Fatalf("build the persisted current-policy fixture: %v", err)
	}
	wantETag := `"` + sha256Hex(derived.Bytes) + `"`
	mustPut(t, cache, currentPolicySpecVersion, identity, string(derived.Bytes), wantETag)

	raw := NewDiskCache(root)
	if err := raw.Put(url, source); err != nil {
		t.Fatalf("seed raw origin entry: %v", err)
	}
	if err := raw.putOriginSHA256(url, identity.OriginSHA256); err != nil {
		t.Fatalf("seed origin identity sidecar: %v", err)
	}

	// No transform can run: the gate is empty and the bounded HTTP acquire is already expired, so a miss could only fail.
	svc := newTestService(&fakeLoader{result: Source{Bytes: source, Identity: identity}}, cache, forbiddenTransform(t), make(chan struct{}, 2))
	served, err := svc.GetHTTP(context.Background(), url)
	if err != nil {
		t.Fatalf("GetHTTP of the persisted current-policy entry: %v", err)
	}
	if served.ETag != wantETag || !bytes.Equal(served.Bytes, derived.Bytes) {
		t.Fatalf("served %d bytes ETag %s, want the persisted %d bytes and ETag %s", len(served.Bytes), served.ETag, len(derived.Bytes), wantETag)
	}

	// A serve that missed would publish its own version directory; the persisted layout must be all that is on disk.
	assertOnlyVersionDir(t, root, currentPolicySpecVersion)
	if got, ok := raw.Get(url); !ok || !bytes.Equal(got, source) {
		t.Fatalf("raw origin entry = %d bytes, %v; want the untouched source bytes", len(got), ok)
	}
	if got, ok := raw.originSHA256(url); !ok || got != identity.OriginSHA256 {
		t.Fatalf("origin sidecar = %q, %v; want the untouched identity %q", got, ok, identity.OriginSHA256)
	}
}

// forbiddenTransform is a transformFunc that records any invocation, so a serve claiming a cache hit cannot have generated bytes.
func forbiddenTransform(t *testing.T) transformFunc {
	return func([]byte, thumbnail.Options) (thumbnail.Result, error) {
		t.Error("transform ran; a persisted current-policy entry must be served without one")
		return thumbnail.Result{}, errors.New("transform must not run")
	}
}

// assertOnlyVersionDir fails unless root's thumbnail root holds exactly the single version directory named, which is the
// namespace a serve may address.
func assertOnlyVersionDir(t *testing.T, root string, version int) {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(root, "thumbs"))
	if err != nil {
		t.Fatalf("ReadDir(thumbs): %v", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	slices.Sort(names)
	if wantName := fmt.Sprintf("v%d", version); !slices.Equal(names, []string{wantName}) {
		t.Fatalf("version namespaces = %v, want exactly [%s]", names, wantName)
	}
}

// tallCoverJPEG encodes a deterministic gradient cover taller than the current height ceiling, so a rule change is
// visible in the served bytes rather than only in a cache key.
func tallCoverJPEG(t *testing.T) []byte {
	t.Helper()

	img := image.NewNRGBA(image.Rect(0, 0, 600, 900))
	for y := range 900 {
		for x := range 600 {
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(x % 256), G: uint8(y % 256), B: uint8((x * y) % 256), A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatalf("encode cover JPEG: %v", err)
	}
	return buf.Bytes()
}

// sha256Hex is the hex digest both a URL source identity and the served-byte ETag are built from.
func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

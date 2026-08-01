package backup

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// buildBundle writes a well-formed bundle via the same bundleWriter export
// uses, so "an exported bundle" tests exercise the real write path.
func buildBundle(t *testing.T, dest string, formatVersion int, dataByGroup map[string]string) {
	t.Helper()

	bw, err := newBundleWriter(dest)
	if err != nil {
		t.Fatalf("newBundleWriter: %v", err)
	}

	var contexts []ContextEntry
	for _, name := range orderedKeys(dataByGroup) {
		contexts = append(contexts, writeDataEntry(t, bw, name, dataByGroup[name]))
	}

	m := Manifest{
		FormatVersion:  formatVersion,
		BridgeVersion:  "dev",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		Contexts:       contexts,
		BundleChecksum: computeBundleChecksum(contexts),
	}
	if err := bw.writeManifest(m); err != nil {
		t.Fatalf("writeManifest: %v", err)
	}
	if err := bw.close(); err != nil {
		t.Fatalf("close: %v", err)
	}
}

// orderedKeys returns m's keys in a fixed, deterministic order so bundle
// contents are reproducible across test runs.
func orderedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j-1] > keys[j]; j-- {
			keys[j-1], keys[j] = keys[j], keys[j-1]
		}
	}
	return keys
}

func TestVerifyBundleAcceptsAnExportedBundle(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	buildBundle(t, dest, SupportedFormatVersion, map[string]string{"anime_snapshots": `{"a":1}` + "\n"})

	vb, err := VerifyBundle(context.Background(), dest)
	if err != nil {
		t.Fatalf("VerifyBundle: %v", err)
	}
	defer func() { _ = vb.Close() }()

	if vb.Manifest.BridgeVersion != "dev" {
		t.Fatalf("unexpected bridge version: %q", vb.Manifest.BridgeVersion)
	}
}

func TestImportRefusesNewerFormatVersionWithoutSideEffects(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	// The data entry's declared sha256 is deliberately wrong for its actual
	// bytes. If the version gate did not short-circuit before entry hashing,
	// verification would fail with ErrChecksumMismatch instead of
	// ErrUnsupportedFormatVersion -- proving no data entry was read.
	buildBundleWithDeclaredChecksum(t, dest, 99, "anime_snapshots", `{"a":1}`+"\n", "0000000000000000000000000000000000000000000000000000000000000000")

	_, err := VerifyBundle(context.Background(), dest)
	if !errors.Is(err, ErrUnsupportedFormatVersion) {
		t.Fatalf("expected ErrUnsupportedFormatVersion, got %v", err)
	}
}

// buildBundleWithDeclaredChecksum writes one data entry whose manifest-declared
// sha256 is declaredSHA256 regardless of the entry's real bytes, so tests can
// prove ordering (version gate before checksum check) or tampering (checksum
// mismatch) without duplicating the whole bundleWriter dance.
func buildBundleWithDeclaredChecksum(t *testing.T, dest string, formatVersion int, name, body, declaredSHA256 string) {
	t.Helper()

	bw, err := newBundleWriter(dest)
	if err != nil {
		t.Fatalf("newBundleWriter: %v", err)
	}
	w, _, err := bw.createDataEntry(name)
	if err != nil {
		t.Fatalf("createDataEntry: %v", err)
	}
	if _, err := io.WriteString(w, body); err != nil {
		t.Fatalf("write entry: %v", err)
	}

	contexts := []ContextEntry{{Name: name, RecordCount: 1, SHA256: declaredSHA256}}
	m := Manifest{
		FormatVersion:  formatVersion,
		BridgeVersion:  "dev",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		Contexts:       contexts,
		BundleChecksum: computeBundleChecksum(contexts),
	}
	if err := bw.writeManifest(m); err != nil {
		t.Fatalf("writeManifest: %v", err)
	}
	if err := bw.close(); err != nil {
		t.Fatalf("close: %v", err)
	}
}

func TestVerifyBundleAcceptsEqualOrOlderFormatVersion(t *testing.T) {
	t.Parallel()

	for _, fv := range []int{SupportedFormatVersion, SupportedFormatVersion - 1} {
		if fv < 0 {
			continue
		}
		dest := filepath.Join(t.TempDir(), "bundle.zip")
		buildBundle(t, dest, fv, map[string]string{"anime_snapshots": `{"a":1}` + "\n"})

		vb, err := VerifyBundle(context.Background(), dest)
		if err != nil {
			t.Fatalf("VerifyBundle(formatVersion=%d): %v", fv, err)
		}
		_ = vb.Close()
	}
}

// writeRawZip writes a zip file at dest containing exactly the given
// entries, bypassing bundleWriter entirely -- used to build bundles missing
// a manifest.json.
func writeRawZip(t *testing.T, dest string, entries map[string]string) {
	t.Helper()

	f, err := os.Create(dest)
	if err != nil {
		t.Fatalf("create %q: %v", dest, err)
	}
	zw := zip.NewWriter(f)
	for _, name := range orderedKeys(entries) {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create entry %q: %v", name, err)
		}
		if _, err := io.WriteString(w, entries[name]); err != nil {
			t.Fatalf("write entry %q: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip writer: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close bundle file: %v", err)
	}
}

func TestVerifyBundleRejectsZipWithoutManifest(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	writeRawZip(t, dest, map[string]string{"data/anime_snapshots.jsonl": `{"a":1}` + "\n"})

	vb, err := VerifyBundle(context.Background(), dest)
	if !errors.Is(err, ErrMissingManifest) {
		t.Fatalf("expected ErrMissingManifest, got %v", err)
	}
	if vb != nil {
		t.Fatal("expected nil VerifiedBundle on missing-manifest error")
	}
}

func TestVerifyBundleRejectsNonZipFile(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "not-a-zip.zip")
	if err := os.WriteFile(dest, []byte("this is not a zip file"), 0o600); err != nil {
		t.Fatalf("write non-zip file: %v", err)
	}

	if _, err := VerifyBundle(context.Background(), dest); err == nil {
		t.Fatal("expected error verifying a non-zip file, got nil")
	}
}

func TestTamperedDataEntryIsRejectedBeforeAnyWrite(t *testing.T) {
	t.Parallel()

	original := `{"a":1}` + "\n"
	h := sha256.Sum256([]byte(original))
	originalSHA256 := hex.EncodeToString(h[:])

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	// The manifest declares the ORIGINAL content's checksum, but the actual
	// entry bytes are tampered -- simulating post-export corruption.
	buildBundleWithDeclaredChecksum(t, dest, SupportedFormatVersion, "anime_snapshots", `{"a":999}`+"\n", originalSHA256)

	if _, err := VerifyBundle(context.Background(), dest); !errors.Is(err, ErrChecksumMismatch) {
		t.Fatalf("expected ErrChecksumMismatch, got %v", err)
	}
}

func TestVerifyBundleRejectsTamperedManifestContextTuple(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	bw, err := newBundleWriter(dest)
	if err != nil {
		t.Fatalf("newBundleWriter: %v", err)
	}
	entry := writeDataEntry(t, bw, "anime_snapshots", `{"a":1}`+"\n")
	originalContexts := []ContextEntry{entry}
	bundleChecksum := computeBundleChecksum(originalContexts)

	// Tamper the context tuple (recordCount) AFTER the checksum was computed
	// over the original tuple, so bundleChecksum no longer matches.
	tampered := []ContextEntry{{Name: entry.Name, RecordCount: entry.RecordCount + 1, SHA256: entry.SHA256}}

	if err := bw.writeManifest(Manifest{
		FormatVersion:  SupportedFormatVersion,
		BridgeVersion:  "dev",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		Contexts:       tampered,
		BundleChecksum: bundleChecksum,
	}); err != nil {
		t.Fatalf("writeManifest: %v", err)
	}
	if err := bw.close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	if _, err := VerifyBundle(context.Background(), dest); !errors.Is(err, ErrChecksumMismatch) {
		t.Fatalf("expected ErrChecksumMismatch, got %v", err)
	}
}

// zeroReader emits n zero bytes without allocating them all at once, so an
// oversized-entry test can exceed maxEntryBytes without materializing a huge
// buffer in memory.
type zeroReader struct{ n int64 }

func (z *zeroReader) Read(p []byte) (int, error) {
	if z.n <= 0 {
		return 0, io.EOF
	}
	if int64(len(p)) > z.n {
		p = p[:z.n]
	}
	for i := range p {
		p[i] = 0
	}
	z.n -= int64(len(p))
	return len(p), nil
}

func TestOversizedEntryIsRefused(t *testing.T) {
	t.Parallel()

	oversizeBy := int64(1)
	size := int64(maxEntryBytes) + oversizeBy

	h := sha256.New()
	if _, err := io.Copy(h, &zeroReader{n: size}); err != nil {
		t.Fatalf("hash oversized payload: %v", err)
	}
	declaredSHA256 := hex.EncodeToString(h.Sum(nil))

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	bw, err := newBundleWriter(dest)
	if err != nil {
		t.Fatalf("newBundleWriter: %v", err)
	}
	w, _, err := bw.createDataEntry("anime_snapshots")
	if err != nil {
		t.Fatalf("createDataEntry: %v", err)
	}
	// All-zero content is highly compressible: deflate keeps the actual zip
	// file small even though it decompresses past maxEntryBytes.
	if _, err := io.Copy(w, &zeroReader{n: size}); err != nil {
		t.Fatalf("write oversized entry: %v", err)
	}

	contexts := []ContextEntry{{Name: "anime_snapshots", RecordCount: 0, SHA256: declaredSHA256}}
	if err := bw.writeManifest(Manifest{
		FormatVersion:  SupportedFormatVersion,
		BridgeVersion:  "dev",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		Contexts:       contexts,
		BundleChecksum: computeBundleChecksum(contexts),
	}); err != nil {
		t.Fatalf("writeManifest: %v", err)
	}
	if err := bw.close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	_, err = VerifyBundle(context.Background(), dest)
	if !errors.Is(err, ErrEntryTooLarge) {
		t.Fatalf("expected ErrEntryTooLarge, got %v", err)
	}
}

func TestHostileEntryNameCreatesNoFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	dest := filepath.Join(dir, "bundle.zip")

	f, err := os.Create(dest)
	if err != nil {
		t.Fatalf("create %q: %v", dest, err)
	}
	zw := zip.NewWriter(f)

	// A hostile entry name with parent-directory traversal segments.
	hostile, err := zw.Create("../../evil.jsonl")
	if err != nil {
		t.Fatalf("create hostile entry: %v", err)
	}
	if _, err := io.WriteString(hostile, "not a real group\n"); err != nil {
		t.Fatalf("write hostile entry: %v", err)
	}

	manifestEntry, err := zw.Create("manifest.json")
	if err != nil {
		t.Fatalf("create manifest entry: %v", err)
	}
	emptyBundleChecksum := computeBundleChecksum(nil)
	if _, err := io.WriteString(manifestEntry, `{"formatVersion":1,"bridgeVersion":"dev","createdAt":"2026-07-31T00:00:00Z","contexts":[],"bundleChecksum":"`+emptyBundleChecksum+`"}`); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip writer: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close bundle file: %v", err)
	}

	vb, err := VerifyBundle(context.Background(), dest)
	if err != nil {
		t.Fatalf("VerifyBundle: %v", err)
	}
	defer func() { _ = vb.Close() }()

	// The hostile entry matches no known group name -- confirm OpenGroup
	// simply reports it absent rather than resolving it to any path.
	if _, ok, err := vb.OpenGroup("../../evil"); ok || err != nil {
		t.Fatalf("expected the hostile entry to match no group, got ok=%v err=%v", ok, err)
	}

	// No file was ever extracted anywhere near the bundle or above it.
	if _, err := os.Stat(filepath.Join(dir, "..", "..", "evil.jsonl")); !os.IsNotExist(err) {
		t.Fatalf("expected no file to be created from the hostile entry name, stat err: %v", err)
	}
}

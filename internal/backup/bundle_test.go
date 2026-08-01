package backup

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestManifestEncodeDecodeRoundTrip(t *testing.T) {
	t.Parallel()

	want := Manifest{
		FormatVersion: SupportedFormatVersion,
		BridgeVersion: "dev",
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
		Contexts: []ContextEntry{
			{Name: "anime_snapshots", RecordCount: 3, SHA256: "abc123"},
			{Name: "seasons", RecordCount: 1, SHA256: "def456"},
		},
		BundleChecksum: "outerchecksum",
	}

	raw, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}

	var got Manifest
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal manifest: %v", err)
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("round-trip mismatch: want %+v, got %+v", want, got)
	}
}

func TestManifestFieldNamesAreEnglishJSON(t *testing.T) {
	t.Parallel()

	m := Manifest{
		FormatVersion: SupportedFormatVersion,
		BridgeVersion: "dev",
		CreatedAt:     "2026-07-31T00:00:00Z",
		Contexts: []ContextEntry{
			{Name: "anime_snapshots", RecordCount: 1, SHA256: "hash"},
		},
		BundleChecksum: "checksum",
	}

	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}

	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		t.Fatalf("unmarshal top level: %v", err)
	}

	requireExactKeys(t, top, []string{"formatVersion", "bridgeVersion", "createdAt", "contexts", "bundleChecksum"}, "top level")

	var contexts []map[string]json.RawMessage
	if err := json.Unmarshal(top["contexts"], &contexts); err != nil {
		t.Fatalf("unmarshal contexts: %v", err)
	}
	for _, entry := range contexts {
		requireExactKeys(t, entry, []string{"name", "recordCount", "sha256"}, "context entry")
	}

	for _, field := range top {
		if strings.ContainsAny(string(field), "áéíóúñÁÉÍÓÚÑ") {
			t.Fatalf("found Spanish-looking characters in manifest field: %s", field)
		}
	}
}

// requireExactKeys fails the test unless got holds exactly the wanted keys —
// no more, no fewer. The manifest is a wire contract, so an extra key is as
// much a breach as a missing one.
func requireExactKeys(t *testing.T, got map[string]json.RawMessage, want []string, where string) {
	t.Helper()

	for _, key := range want {
		if _, ok := got[key]; !ok {
			t.Fatalf("expected %s key %q, got %v", where, key, got)
		}
	}
	if len(got) != len(want) {
		t.Fatalf("expected exactly %d %s keys, got %d: %v", len(want), where, len(got), got)
	}
}

func TestManifestFormatVersionIsEncodedAsNumber(t *testing.T) {
	t.Parallel()

	m := Manifest{FormatVersion: SupportedFormatVersion, BridgeVersion: "dev", CreatedAt: "2026-07-31T00:00:00Z"}
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}

	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		t.Fatalf("unmarshal top level: %v", err)
	}

	fv := strings.TrimSpace(string(top["formatVersion"]))
	if strings.HasPrefix(fv, `"`) {
		t.Fatalf("expected formatVersion to be a JSON number, got quoted string %s", fv)
	}
}

func TestManifestCreatedAtIsRFC3339UTC(t *testing.T) {
	t.Parallel()

	createdAt := time.Now().UTC().Format(time.RFC3339)
	m := Manifest{FormatVersion: SupportedFormatVersion, BridgeVersion: "dev", CreatedAt: createdAt}

	parsed, err := time.Parse(time.RFC3339, m.CreatedAt)
	if err != nil {
		t.Fatalf("parse createdAt as RFC3339: %v", err)
	}
	if _, offset := parsed.Zone(); offset != 0 {
		t.Fatalf("expected UTC offset 0, got %d", offset)
	}
}

func TestManifestFormatVersionIsSupportedConstant(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	bw, err := newBundleWriter(dest)
	if err != nil {
		t.Fatalf("newBundleWriter: %v", err)
	}
	m := newManifest("dev", time.Now().UTC().Format(time.RFC3339), nil)
	if err := bw.writeManifest(m); err != nil {
		t.Fatalf("writeManifest: %v", err)
	}
	if err := bw.close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	got, err := ReadManifestFile(dest)
	if err != nil {
		t.Fatalf("ReadManifestFile: %v", err)
	}
	if got.FormatVersion != SupportedFormatVersion {
		t.Fatalf("expected FormatVersion == SupportedFormatVersion (%d), got %d", SupportedFormatVersion, got.FormatVersion)
	}
}

// writeDataEntry writes body as one data entry named name and returns the
// ContextEntry describing it, including the hash of the bytes actually written.
func writeDataEntry(t *testing.T, bw *bundleWriter, name, body string) ContextEntry {
	t.Helper()

	entryWriter, sum, err := bw.createDataEntry(name)
	if err != nil {
		t.Fatalf("createDataEntry(%q): %v", name, err)
	}
	if _, err := io.WriteString(entryWriter, body); err != nil {
		t.Fatalf("write entry %q: %v", name, err)
	}
	return ContextEntry{Name: name, RecordCount: strings.Count(body, "\n"), SHA256: sum()}
}

func TestEntrySHA256MatchesWrittenBytes(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	bw, err := newBundleWriter(dest)
	if err != nil {
		t.Fatalf("newBundleWriter: %v", err)
	}

	bodies := map[string]string{
		"alpha": "line-one\nline-two\n",
		"beta":  "only-line\n",
	}

	var contexts []ContextEntry
	for _, name := range []string{"alpha", "beta"} {
		contexts = append(contexts, writeDataEntry(t, bw, name, bodies[name]))
	}

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

	zr, err := zip.OpenReader(dest)
	if err != nil {
		t.Fatalf("zip.OpenReader: %v", err)
	}
	defer func() { _ = zr.Close() }()

	for _, ctxEntry := range contexts {
		f := findZipFile(t, zr.File, "data/"+ctxEntry.Name+".jsonl")
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open zip entry %q: %v", f.Name, err)
		}
		data, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatalf("read zip entry %q: %v", f.Name, err)
		}
		sum := sha256.Sum256(data)
		want := hex.EncodeToString(sum[:])
		if ctxEntry.SHA256 != want {
			t.Fatalf("entry %q: declared sha256 %q does not match written bytes %q", ctxEntry.Name, ctxEntry.SHA256, want)
		}
	}
}

func TestBundleChecksumChangesWithContent(t *testing.T) {
	t.Parallel()

	a := []ContextEntry{{Name: "anime_snapshots", RecordCount: 3, SHA256: "aaa"}}
	b := []ContextEntry{{Name: "anime_snapshots", RecordCount: 5, SHA256: "bbb"}}

	if computeBundleChecksum(a) == computeBundleChecksum(b) {
		t.Fatal("expected bundle checksum to differ for different contexts, got equal values")
	}
}

func TestBundleChecksumIsDeterministicForIdenticalContent(t *testing.T) {
	t.Parallel()

	a := []ContextEntry{{Name: "anime_snapshots", RecordCount: 3, SHA256: "aaa"}}
	b := []ContextEntry{{Name: "anime_snapshots", RecordCount: 3, SHA256: "aaa"}}

	if computeBundleChecksum(a) != computeBundleChecksum(b) {
		t.Fatal("expected bundle checksum to be deterministic for identical content")
	}
}

func TestReadManifestReturnsWrittenManifest(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	bw, err := newBundleWriter(dest)
	if err != nil {
		t.Fatalf("newBundleWriter: %v", err)
	}
	want := Manifest{
		FormatVersion:  SupportedFormatVersion,
		BridgeVersion:  "1.2.3",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		Contexts:       []ContextEntry{{Name: "seasons", RecordCount: 2, SHA256: "abc"}},
		BundleChecksum: "outer",
	}
	if err := bw.writeManifest(want); err != nil {
		t.Fatalf("writeManifest: %v", err)
	}
	if err := bw.close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	got, err := ReadManifestFile(dest)
	if err != nil {
		t.Fatalf("ReadManifestFile: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected read-back manifest to equal written manifest, want %+v, got %+v", want, got)
	}
}

func TestReadManifestFailsOnBundleWithoutManifest(t *testing.T) {
	t.Parallel()

	dest := filepath.Join(t.TempDir(), "bundle.zip")

	// Build a raw zip with data entries only, bypassing bundleWriter entirely,
	// to simulate an export that crashed before the manifest was written.
	if _, err := createZipFileForTest(t, dest, "data/anime_snapshots.jsonl", `{"animeId":"a"}`+"\n"); err != nil {
		t.Fatalf("build headless bundle: %v", err)
	}

	_, err := ReadManifestFile(dest)
	if err == nil {
		t.Fatal("expected error reading a bundle with no manifest.json, got nil")
	}
	if !strings.Contains(err.Error(), "manifest") {
		t.Fatalf("expected error to mention the missing manifest, got: %v", err)
	}
}

// findZipFile locates a zip entry by name, failing the test if it is absent.
func findZipFile(t *testing.T, files []*zip.File, name string) *zip.File {
	t.Helper()
	for _, f := range files {
		if f.Name == name {
			return f
		}
	}
	t.Fatalf("zip entry %q not found", name)
	return nil
}

// createZipFileForTest writes a single-entry zip with no manifest.json, used
// to simulate a crash before the manifest was written.
func createZipFileForTest(t *testing.T, dest, entryName, body string) (string, error) {
	t.Helper()
	f, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer func() { _ = f.Close() }()

	zw := zip.NewWriter(f)
	w, err := zw.Create(entryName)
	if err != nil {
		return "", err
	}
	if _, err := io.WriteString(w, body); err != nil {
		return "", err
	}
	if err := zw.Close(); err != nil {
		return "", err
	}
	return dest, nil
}

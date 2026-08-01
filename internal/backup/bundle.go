// Package backup writes portable backup bundles: a single .zip container
// holding manifest.json plus one data/{name}.jsonl file per exported table
// group. The package knows zip containers, JSONL framing, SHA-256, and the
// manifest — it does not know a single table, column, or domain type.
package backup

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
)

// SupportedFormatVersion is the bundle format this build produces and
// accepts. It is written unconditionally into every manifest.
const SupportedFormatVersion = 1

// ErrMissingManifest is returned when a bundle has no manifest.json entry —
// the signature of an export that crashed before its commit point.
var ErrMissingManifest = errors.New("backup: bundle has no manifest.json")

// ContextEntry describes one exported table group inside the manifest.
type ContextEntry struct {
	Name        string `json:"name"`
	RecordCount int    `json:"recordCount"`
	SHA256      string `json:"sha256"`
}

// Manifest is the bundle's commit record: written only after every
// data/{name}.jsonl entry is complete and hashed.
type Manifest struct {
	FormatVersion  int            `json:"formatVersion"`
	BridgeVersion  string         `json:"bridgeVersion"`
	CreatedAt      string         `json:"createdAt"`
	Contexts       []ContextEntry `json:"contexts"`
	BundleChecksum string         `json:"bundleChecksum"`
}

// bundleWriter wraps a zip.Writer over a destination file, giving callers
// one data entry at a time and a manifest entry that must be written last.
// It is unexported: the export driver in export.go is the only caller.
type bundleWriter struct {
	f  *os.File
	zw *zip.Writer
}

// newBundleWriter creates dest and opens a zip writer over it.
func newBundleWriter(dest string) (*bundleWriter, error) {
	f, err := os.Create(dest)
	if err != nil {
		return nil, fmt.Errorf("create bundle file %q: %w", dest, err)
	}
	return &bundleWriter{f: f, zw: zip.NewWriter(f)}, nil
}

// createDataEntry opens "data/{name}.jsonl" for writing inside the zip and
// returns a writer that tees every write into a running SHA-256 hash, plus a
// sum function that reports the hex digest of the bytes actually written.
// Callers MUST call sum only after every write to the returned writer is
// done — it hashes the same bytes that reached the zip, not a second read.
func (bw *bundleWriter) createDataEntry(name string) (w io.Writer, sum func() string, err error) {
	entry, err := bw.zw.Create("data/" + name + ".jsonl")
	if err != nil {
		return nil, nil, fmt.Errorf("create data entry %q: %w", name, err)
	}
	h := sha256.New()
	return io.MultiWriter(entry, h), func() string { return hex.EncodeToString(h.Sum(nil)) }, nil
}

// writeManifest writes manifest.json. Callers MUST call this only after
// every data entry has been fully written — it is the bundle's commit point.
func (bw *bundleWriter) writeManifest(m Manifest) error {
	w, err := bw.zw.Create("manifest.json")
	if err != nil {
		return fmt.Errorf("create manifest entry: %w", err)
	}
	if err := json.NewEncoder(w).Encode(m); err != nil {
		return fmt.Errorf("encode manifest: %w", err)
	}
	return nil
}

// close flushes the zip's central directory and closes the destination file.
func (bw *bundleWriter) close() error {
	zipErr := bw.zw.Close()
	fileErr := bw.f.Close()
	if zipErr != nil {
		return fmt.Errorf("close zip writer: %w", zipErr)
	}
	if fileErr != nil {
		return fmt.Errorf("close bundle file: %w", fileErr)
	}
	return nil
}

// newManifest builds the manifest for a completed export: it always stamps
// the package's SupportedFormatVersion, never a caller-supplied value, and
// derives BundleChecksum from the same contexts it records.
func newManifest(bridgeVersion, createdAt string, contexts []ContextEntry) Manifest {
	return Manifest{
		FormatVersion:  SupportedFormatVersion,
		BridgeVersion:  bridgeVersion,
		CreatedAt:      createdAt,
		Contexts:       contexts,
		BundleChecksum: computeBundleChecksum(contexts),
	}
}

// computeBundleChecksum hashes the ordered (name, recordCount, sha256) tuples
// of every context entry, so the checksum changes with either the content or
// the export order.
func computeBundleChecksum(contexts []ContextEntry) string {
	h := sha256.New()
	for _, c := range contexts {
		// Writing to a hash never fails; the error is discarded deliberately.
		_, _ = fmt.Fprintf(h, "%s:%d:%s\n", c.Name, c.RecordCount, c.SHA256)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// ReadManifest reads manifest.json out of a bundle already open as r/size.
// It returns ErrMissingManifest when no manifest.json entry exists — the
// bundle is then not a partial bundle, it is not a bundle.
func ReadManifest(r io.ReaderAt, size int64) (Manifest, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return Manifest{}, fmt.Errorf("open bundle as zip: %w", err)
	}

	for _, f := range zr.File {
		if f.Name != "manifest.json" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return Manifest{}, fmt.Errorf("open manifest entry: %w", err)
		}
		defer func() { _ = rc.Close() }()

		var m Manifest
		if err := json.NewDecoder(rc).Decode(&m); err != nil {
			return Manifest{}, fmt.Errorf("decode manifest: %w", err)
		}
		return m, nil
	}

	return Manifest{}, ErrMissingManifest
}

// ReadManifestFile opens path and reads its manifest, per ReadManifest.
func ReadManifestFile(path string) (Manifest, error) {
	f, err := os.Open(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("open bundle file %q: %w", path, err)
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		return Manifest{}, fmt.Errorf("stat bundle file %q: %w", path, err)
	}

	return ReadManifest(f, info.Size())
}

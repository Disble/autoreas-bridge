package backup

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// ErrUnsupportedFormatVersion is returned for a bundle this build is too old
// to read. Fail closed: a build that cannot name a field cannot know what
// dropping it costs.
var ErrUnsupportedFormatVersion = errors.New("backup: bundle format version is newer than this build supports")

// ErrChecksumMismatch is returned when a bundle's declared checksums do not
// match its bytes.
var ErrChecksumMismatch = errors.New("backup: bundle checksum does not match its contents")

// ErrEntryTooLarge is returned when a data entry decompresses past
// maxEntryBytes -- the decompression-bomb bound.
var ErrEntryTooLarge = errors.New("backup: bundle data entry exceeds the size limit")

// maxEntryBytes bounds each decompressed data entry. Nothing legitimate this
// build exports comes close; a bundle that does is either corrupt or hostile.
const maxEntryBytes = 512 << 20 // 512 MiB

// VerifiedBundle is an opened, version-gated, checksum-verified bundle. Its
// data entries have been hashed but not decoded and not applied. Callers MUST
// Close it.
type VerifiedBundle struct {
	Manifest Manifest

	zr      *zip.ReadCloser
	entries map[string]*zip.File
}

// VerifyBundle opens src, reads its manifest, refuses a formatVersion newer
// than SupportedFormatVersion, and verifies every contexts[] entry's sha256
// against its own bytes plus the bundleChecksum -- all before any caller can
// read a record. It writes nothing anywhere.
//
// ctx is accepted for signature symmetry with Preview and Apply, which do
// perform cancellable work; VerifyBundle's own work is local and unbounded by
// context cancellation today.
func VerifyBundle(_ context.Context, src string) (*VerifiedBundle, error) {
	zr, err := zip.OpenReader(src)
	if err != nil {
		return nil, fmt.Errorf("open bundle %q as zip: %w", src, err)
	}

	m, err := readManifestFromZip(zr)
	if err != nil {
		_ = zr.Close()
		return nil, err
	}

	// The version gate runs before any data entry is opened, hashed, or read
	// -- refusing a newer bundle must have zero side effects, and reading a
	// data entry this build cannot fully interpret would be one.
	if m.FormatVersion > SupportedFormatVersion {
		_ = zr.Close()
		return nil, fmt.Errorf("%w: bundle format version %d, this build supports up to %d",
			ErrUnsupportedFormatVersion, m.FormatVersion, SupportedFormatVersion)
	}

	entries := indexZipEntries(zr)

	if err := verifyContextChecksums(m, entries); err != nil {
		_ = zr.Close()
		return nil, err
	}

	if computeBundleChecksum(m.Contexts) != m.BundleChecksum {
		_ = zr.Close()
		return nil, fmt.Errorf("%w: bundle checksum", ErrChecksumMismatch)
	}

	return &VerifiedBundle{Manifest: m, zr: zr, entries: entries}, nil
}

// indexZipEntries builds a name-to-file lookup over every entry in zr. Names
// are matched exactly against this map; no archive-supplied name is ever
// joined to a filesystem path.
func indexZipEntries(zr *zip.ReadCloser) map[string]*zip.File {
	entries := make(map[string]*zip.File, len(zr.File))
	for _, f := range zr.File {
		entries[f.Name] = f
	}
	return entries
}

// verifyContextChecksums hashes each context entry's declared data file and
// compares it against the manifest's recorded sha256, bounding every read by
// maxEntryBytes so a hostile entry cannot exhaust memory.
func verifyContextChecksums(m Manifest, entries map[string]*zip.File) error {
	for _, c := range m.Contexts {
		f, ok := entries["data/"+c.Name+".jsonl"]
		if !ok {
			return fmt.Errorf("%w: manifest names group %q with no matching data entry", ErrChecksumMismatch, c.Name)
		}
		sum, err := hashZipEntry(f)
		if err != nil {
			return err
		}
		if sum != c.SHA256 {
			return fmt.Errorf("%w: group %q", ErrChecksumMismatch, c.Name)
		}
	}
	return nil
}

// hashZipEntry computes the SHA-256 of f's decompressed bytes, refusing an
// entry whose decompressed size exceeds maxEntryBytes.
func hashZipEntry(f *zip.File) (string, error) {
	rc, err := f.Open()
	if err != nil {
		return "", fmt.Errorf("open bundle entry %q: %w", f.Name, err)
	}
	defer func() { _ = rc.Close() }()

	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(rc, maxEntryBytes+1))
	if err != nil {
		return "", fmt.Errorf("read bundle entry %q: %w", f.Name, err)
	}
	if n > maxEntryBytes {
		return "", fmt.Errorf("%w: entry %q", ErrEntryTooLarge, f.Name)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// readManifestFromZip reads manifest.json out of an already-open zip, using
// the identical decode step as ReadManifest so the two never drift.
func readManifestFromZip(zr *zip.ReadCloser) (Manifest, error) {
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

// limitedReadCloser pairs a bounded io.Reader with the underlying entry's
// Close, so OpenGroup callers get one bounded stream they can Close normally.
type limitedReadCloser struct {
	io.Reader
	c io.Closer
}

// Close releases the underlying zip entry reader.
func (l *limitedReadCloser) Close() error {
	return l.c.Close()
}

// OpenGroup returns a reader over the bundle's data/{name}.jsonl entry, or
// false when the bundle does not carry that group. The reader is bounded by
// maxEntryBytes.
func (b *VerifiedBundle) OpenGroup(name string) (io.ReadCloser, bool, error) {
	f, ok := b.entries["data/"+name+".jsonl"]
	if !ok {
		return nil, false, nil
	}
	rc, err := f.Open()
	if err != nil {
		return nil, true, fmt.Errorf("open bundle entry %q: %w", f.Name, err)
	}
	return &limitedReadCloser{Reader: io.LimitReader(rc, maxEntryBytes), c: rc}, true, nil
}

// GroupNames lists the group names the bundle carries, in manifest order.
func (b *VerifiedBundle) GroupNames() []string {
	names := make([]string, 0, len(b.Manifest.Contexts))
	for _, c := range b.Manifest.Contexts {
		names = append(names, c.Name)
	}
	return names
}

// Close releases the underlying archive.
func (b *VerifiedBundle) Close() error {
	return b.zr.Close()
}

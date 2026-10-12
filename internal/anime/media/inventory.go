// Package media captures the media files of one folder and prepares them in the shape the identity
// decision consumes.
//
// It is the observation edge of the duration notice: read-only, one level deep, no recursion and no
// writes. It lists, filters by the extension set it was given, and reads each file's creation and
// modification times. It classifies nothing — deciding which episode a file is belongs to
// internal/anime/identity, so this package never names an episode.
//
// The extension set is injected rather than owned here, so the files this inventory sees are exactly
// the files the download pipeline counts as episodes, and there is one source of truth for that.
//
// An absent or unreadable folder returns an error rather than an empty list, because "nothing to
// read" and "nobody could read it" are different facts and a caller must not confuse them.
package media

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"autoreas-bridge/internal/anime/identity"
)

// errNoCreationTime reports a file the filesystem will not date.
var errNoCreationTime = errors.New("creation time unavailable on this filesystem")

// Inventory captures the media files of a folder.
type Inventory struct {
	extensions map[string]bool
}

// New returns an Inventory that considers a file a candidate when the lowercased extension of its
// name is a key in extensions. The map is read and never written.
func New(extensions map[string]bool) *Inventory {
	return &Inventory{extensions: extensions}
}

// Capture lists the immediate media files of folder and returns one entry per candidate, in the name
// order os.ReadDir already guarantees. Subdirectories are never entered.
//
// A file that cannot be described, or that changed while it was being described, is reported as an
// entry carrying that fact: it is never dropped and never zero-filled. Nothing is written.
func (i *Inventory) Capture(folder string) ([]identity.Entry, error) {
	dirEntries, err := os.ReadDir(folder)
	if err != nil {
		return nil, fmt.Errorf("media inventory: list %q: %w", folder, err)
	}

	entries := make([]identity.Entry, 0, len(dirEntries))
	for _, dirEntry := range dirEntries {
		name := dirEntry.Name()
		if !i.isCandidate(name) {
			continue
		}

		path := filepath.Join(folder, name)
		info, err := os.Stat(path)
		if err != nil {
			// A candidate the filesystem refuses to describe still exists as a name. Reporting it
			// keeps the reason visible instead of pretending the folder is smaller than it is.
			entries = append(entries, identity.Entry{Basename: name, Err: err.Error()})
			continue
		}
		if !info.Mode().IsRegular() {
			// A directory or a device whose name merely looks like a video can never be an
			// episode, so it is not a candidate at all.
			continue
		}

		entries = append(entries, describe(name, path, info))
	}
	return entries, nil
}

// isCandidate reports whether a file name is worth describing at all. It is decided from the name
// alone, before any filesystem call, so a file that is not a candidate costs nothing.
func (i *Inventory) isCandidate(name string) bool {
	return i.extensions[strings.ToLower(filepath.Ext(name))]
}

// describe builds the entry for one readable regular file.
func describe(name, path string, info os.FileInfo) identity.Entry {
	first := readingOf(info)
	again, statErr := os.Stat(path)

	entry := identity.Entry{
		Basename: name,
		MtimeNs:  strconv.FormatInt(info.ModTime().UnixNano(), 10),
		Changed:  changedWhileListing(first, again, statErr),
	}

	birthNs, birthErr := creationNs(info)
	if birthErr != nil {
		// Without a creation time the entry cannot take part in chronology. The algorithm reads a
		// set error as an unusable reading, which is safer than pretending the file is very old.
		entry.Err = birthErr.Error()
		return entry
	}
	entry.BirthNs = birthNs
	return entry
}

// reading is the part of one file's description this package compares before and after listing. Two
// equal readings cannot come from a file that changed in between.
type reading struct {
	sizeBytes int64
	mtimeNs   int64
}

// readingOf reduces a file description to the fields that decide whether it can be trusted.
func readingOf(info os.FileInfo) reading {
	if info == nil {
		return reading{}
	}
	return reading{sizeBytes: info.Size(), mtimeNs: info.ModTime().UnixNano()}
}

// changedWhileListing reports whether a file must be distrusted: because it could not be described a
// second time, or because the second description differs from the first. A file still being written
// while it is listed is exactly this case.
func changedWhileListing(first reading, again os.FileInfo, err error) bool {
	if err != nil {
		return true
	}
	return readingOf(again) != first
}

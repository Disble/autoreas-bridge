// Package filesystem implements the EpisodeCounter and Flattener ports (design.md §3.4,
// PoC #10/#11 cmd/poc/finder.go). The live filesystem tally produced by CountAtRoot is the
// SINGLE SOURCE OF TRUTH for download state (ADR-DISK) -- it is re-derived every run and is
// NEVER read from or cached in bridge.db.
package filesystem

import (
	"os"
	"path/filepath"
	"strings"

	"autoreas-bridge/internal/download/config"
)

// EpisodeCounter tallies on-disk video files for an anime's download folder (design.md §3.4).
type EpisodeCounter interface {
	// CountAtRoot tallies video files DIRECTLY in folder (non-recursive) -- the canonical
	// "downloaded" count. NEVER cached; re-derived from the filesystem on every call.
	CountAtRoot(folder string) int
	// CountRecursive tallies video files in folder + all subfolders -- used during completion
	// polling, before Flatten has had a chance to move JD's package subfolders to root.
	CountRecursive(folder string) int
}

type episodeCounter struct{}

// NewEpisodeCounter returns the EpisodeCounter adapter (no dependencies -- pure os/filepath
// I/O against the VideoFileExtensions allowlist from PR1's config package).
func NewEpisodeCounter() EpisodeCounter {
	return episodeCounter{}
}

// CountAtRoot mirrors cmd/poc/finder.go countDownloadedEpisodes: it ignores subdirectories
// entirely and returns 0 (rather than erroring) when folder cannot be read, because "the
// folder does not exist yet" is a normal pre-download state, not a failure.
func (episodeCounter) CountAtRoot(folder string) int {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return 0
	}

	count := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if isVideoFile(entry.Name()) {
			count++
		}
	}
	return count
}

// CountRecursive mirrors cmd/poc/finder.go countAllVideoFiles: it walks folder and every
// subfolder, counting video files anywhere underneath. Walk errors are ignored per-entry
// (mirroring the PoC) because a transient stat failure on one file MUST NOT abort the whole
// tally -- the caller re-polls on an interval regardless.
func (episodeCounter) CountRecursive(folder string) int {
	count := 0
	_ = filepath.Walk(folder, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if isVideoFile(info.Name()) {
			count++
		}
		return nil
	})
	return count
}

// isVideoFile checks a file name's extension against the shared PR1 allowlist
// (config.VideoFileExtensions) so EpisodeCounter and Flatten agree with the rest of the
// download context on what counts as a downloaded episode.
func isVideoFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return config.VideoFileExtensions[ext]
}

var _ EpisodeCounter = episodeCounter{}

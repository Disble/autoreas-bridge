// Package filesystem implements the EpisodeCounter and Flattener ports (design.md §3.4,
// PoC #10/#11 cmd/poc/finder.go). The live filesystem tally produced by CountAtRoot is the
// SINGLE SOURCE OF TRUTH for download state (ADR-DISK) -- it is re-derived every run and is
// NEVER read from or cached in bridge.db.
package filesystem

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
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
	// HighestEpisodeAtRoot returns the highest episode number detected from video files directly
	// in folder. It is the preferred baseline for catch-up decisions because online latest is an
	// episode NUMBER, not a file count.
	HighestEpisodeAtRoot(folder string) int
	// HighestEpisodeRecursive returns the highest episode number detected from videos anywhere
	// under folder. It is used while waiting for JD package subfolders to finish landing.
	HighestEpisodeRecursive(folder string) int
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

func (episodeCounter) HighestEpisodeAtRoot(folder string) int {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return 0
	}

	highest := 0
	for _, entry := range entries {
		if entry.IsDir() || !isVideoFile(entry.Name()) {
			continue
		}
		highest = max(highest, episodeNumberFromName(entry.Name()))
	}
	return highest
}

func (episodeCounter) HighestEpisodeRecursive(folder string) int {
	highest := 0
	_ = filepath.Walk(folder, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !isVideoFile(info.Name()) {
			return nil
		}
		highest = max(highest, episodeNumberFromName(info.Name()))
		return nil
	})
	return highest
}

// isVideoFile checks a file name's extension against the shared PR1 allowlist
// (config.VideoFileExtensions) so EpisodeCounter and Flatten agree with the rest of the
// download context on what counts as a downloaded episode.
func isVideoFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return config.VideoFileExtensions[ext]
}

// episodeMarkers are the tokens that introduce an episode number when it is not
// already separated by punctuation ("ep01", "cap12", "S01E12"). Ordered longest
// first so the longest marker wins.
var episodeMarkers = []string{"episodio", "episode", "capitulo", "cap", "ep", "e"}

// digitRunPattern finds every digit run in a name; which of them (if any) is an
// episode number is decided by the delimiter rules below, not by the regex.
var digitRunPattern = regexp.MustCompile(`[0-9]+`)

// maxEpisodeNumberDigits bounds a plausible episode number. Longer digit runs are
// identifiers, not episodes.
const maxEpisodeNumberDigits = 4

// episodeNumberFromName extracts the trailing episode number from a file name, or
// 0 when the name does not clearly carry one.
//
// This parser is deliberately conservative, because its two failure modes are not
// symmetric. Reading too LOW is harmless: downloadedEpisodeBaseline takes
// max(highest, count), so the file still counts and the run simply re-checks.
// Reading too HIGH is silent and permanent: it advances the catch-up cursor past
// episodes that were never downloaded and then reports the anime as up to date
// forever. `d2ouiemgt90z.mp4` -- a real JDownloader/Vidhide filename -- used to
// read as episode 90 and abandoned 11 episodes of a 12-episode season.
//
// A digit run is accepted only when it is a standalone token -- introduced by the
// start of the name, a separator, or an episode marker not glued to a letter, and
// followed by the end of the name or a separator. The LAST qualifying run wins, so
// "Anime 12 (1080p)" reads 12 while "1080p" is rejected for being glued to a
// letter. Everything else returns 0.
func episodeNumberFromName(name string) int {
	base := strings.TrimSuffix(name, filepath.Ext(name))

	episode := 0
	for _, match := range digitRunPattern.FindAllStringIndex(base, -1) {
		start, end := match[0], match[1]
		digits := base[start:end]
		if len(digits) > maxEpisodeNumberDigits {
			continue
		}
		if end < len(base) && isAlphanumericByte(base[end]) {
			continue
		}
		if !introducesEpisodeNumber(base[:start]) {
			continue
		}
		n, err := strconv.Atoi(digits)
		if err != nil {
			continue
		}
		episode = n
	}
	return episode
}

// introducesEpisodeNumber reports whether the text preceding a trailing digit run
// makes that run an episode number rather than the tail of an opaque token.
func introducesEpisodeNumber(prefix string) bool {
	if prefix == "" {
		return true
	}
	if !isAlphanumericByte(prefix[len(prefix)-1]) {
		return true
	}

	lowered := strings.ToLower(prefix)
	for _, marker := range episodeMarkers {
		if !strings.HasSuffix(lowered, marker) {
			continue
		}
		// "S01E12" counts; "xyzape01" does not -- a marker glued to a letter is
		// just the end of a word.
		beforeMarker := lowered[:len(lowered)-len(marker)]
		if beforeMarker == "" || !isLetterByte(beforeMarker[len(beforeMarker)-1]) {
			return true
		}
	}
	return false
}

// isAlphanumericByte reports whether b is an ASCII letter or digit.
func isAlphanumericByte(b byte) bool {
	return isLetterByte(b) || (b >= '0' && b <= '9')
}

// isLetterByte reports whether b is an ASCII letter.
func isLetterByte(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

var _ EpisodeCounter = episodeCounter{}

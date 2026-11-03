package filesystem

import (
	"fmt"
	"strings"
)

// minEpisodeDigits pads episode numbers to two digits ("04"). Padding is NOT
// for Windows Explorer, which has sorted numerically via StrCmpLogicalW since
// XP -- it is for every plain-lexicographic consumer downstream: player
// playlists, ffmpeg globs, mobile file browsers, media-server scanners, shell
// sort. Two is a fixed floor rather than a width derived from the season
// length, because widening it later would mean renaming episodes already on
// disk, and retroactive renames are exactly what this package must never do.
const minEpisodeDigits = 2

// reservedNameChars are the characters Windows forbids in a file name. Canonical
// anime names routinely contain them ("Re:Zero", "Fate/Zero"), so an
// unsanitized rename would fail on some of the most-watched shows.
const reservedNameChars = `<>:"/\|?*`

// EpisodeBaseName builds the canonical episode file name WITHOUT an extension
// ("NegaPosi Angler - 04"). JDownloader performs the rename and appends the extension
// it actually downloaded; Bridge itself never renames a file on disk.
//
// The name is for people and players only: the download cursor is the number of video
// files in the folder (downloadedEpisodeBaseline), never a number read from a name.
func EpisodeBaseName(canonicalName string, episode int) (string, error) {
	safeName := sanitizeFileNameBase(canonicalName)
	if safeName == "" {
		return "", fmt.Errorf("canonical name %q has no usable characters for a file name", canonicalName)
	}
	return fmt.Sprintf("%s - %0*d", safeName, minEpisodeDigits, episode), nil
}

// sanitizeFileNameBase strips characters no filesystem will accept, collapses the
// whitespace that stripping leaves behind, and trims the trailing dots and
// spaces Windows silently drops from a file name.
func sanitizeFileNameBase(name string) string {
	cleaned := strings.Map(func(r rune) rune {
		if r < ' ' || strings.ContainsRune(reservedNameChars, r) {
			return -1
		}
		return r
	}, name)
	return strings.Trim(strings.Join(strings.Fields(cleaned), " "), " .")
}

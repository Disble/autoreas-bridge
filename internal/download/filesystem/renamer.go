package filesystem

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Renamer gives a freshly downloaded episode a name the episode counter can
// read back.
//
// This is not cosmetic. downloadedEpisodeBaseline resolves the download cursor
// as max(HighestEpisodeAtRoot, CountAtRoot); the count half exists only because
// hoster filenames like "qk2rlwv6tci3.mp4" parse to no episode at all, and
// counting files is correct only while a folder has no gaps and no extras.
// Renaming to "<Anime> - <NN>.<ext>" makes the highest-episode read authoritative
// and demotes the count to a fallback that never has to fire.
type Renamer interface {
	// RenameLatestEpisode renames the most recently modified video file at the
	// root of folder to the canonical episode name, returning the resulting file
	// name. It never overwrites an existing file.
	RenameLatestEpisode(folder, canonicalName string, episode int) (string, error)
}

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

// errNoVideoAtRoot reports that the folder root holds nothing that could be the
// episode that just finished downloading.
var errNoVideoAtRoot = errors.New("no video file at folder root")

// renamer is the filesystem-backed Renamer.
type renamer struct{}

// NewRenamer builds the filesystem-backed episode renamer.
func NewRenamer() Renamer {
	return renamer{}
}

// RenameLatestEpisode renames the newest root-level video file to
// "<sanitized canonical name> - <padded episode><original extension>".
//
// The newest video is the right target because the pipeline downloads one
// episode at a time per anime folder and only calls this once the filesystem
// has confirmed that episode landed, so the file JD just finished is the most
// recently modified one. Subfolders are ignored: flattening them is the
// Flattener's job and has already run by this point.
func (r renamer) RenameLatestEpisode(folder, canonicalName string, episode int) (string, error) {
	base, err := EpisodeBaseName(canonicalName, episode)
	if err != nil {
		return "", err
	}

	current, err := latestVideoAtRoot(folder)
	if err != nil {
		return "", err
	}

	target := base + filepath.Ext(current)
	if target == current {
		return current, nil
	}

	targetPath := filepath.Join(folder, target)
	if _, err := os.Lstat(targetPath); err == nil {
		return "", fmt.Errorf("rename %q: %q already exists", current, target)
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("stat %q: %w", target, err)
	}

	if err := os.Rename(filepath.Join(folder, current), targetPath); err != nil {
		return "", fmt.Errorf("rename %q to %q: %w", current, target, err)
	}
	return target, nil
}

// EpisodeBaseName builds the canonical episode file name WITHOUT an extension
// ("NegaPosi Angler - 04"). It is the single source of truth for that shape, shared by
// the filesystem renamer and by the JDownloader-side rename, which appends the extension
// JD actually downloaded rather than one read off disk.
func EpisodeBaseName(canonicalName string, episode int) (string, error) {
	safeName := sanitizeFileNameBase(canonicalName)
	if safeName == "" {
		return "", fmt.Errorf("canonical name %q has no usable characters for a file name", canonicalName)
	}
	return fmt.Sprintf("%s - %0*d", safeName, minEpisodeDigits, episode), nil
}

// latestVideoAtRoot returns the name of the most recently modified video file
// directly inside folder.
func latestVideoAtRoot(folder string) (string, error) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return "", fmt.Errorf("read folder %q: %w", folder, err)
	}

	var newest string
	var newestModTime int64
	for _, entry := range entries {
		if entry.IsDir() || !isVideoFile(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if newest == "" || info.ModTime().UnixNano() > newestModTime {
			newest = entry.Name()
			newestModTime = info.ModTime().UnixNano()
		}
	}
	if newest == "" {
		return "", fmt.Errorf("%q: %w", folder, errNoVideoAtRoot)
	}
	return newest, nil
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

var _ Renamer = renamer{}

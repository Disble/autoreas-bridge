package filesystem

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// writeFileAt creates a file with a controlled modification time, so tests can
// state exactly which file is "the one that just finished downloading".
func writeFileAt(t *testing.T, dir, name string, modTime time.Time) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	if err := os.Chtimes(path, modTime, modTime); err != nil {
		t.Fatalf("chtimes %s: %v", name, err)
	}
	return path
}

// namesAtRoot lists the folder's entries so assertions can talk about the whole
// resulting folder, not just the renamer's return value.
func namesAtRoot(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names
}

func TestRenameLatestEpisodeGivesTheNewestVideoAParseableName(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-time.Hour)
	writeFileAt(t, dir, "NegaPosi Angler - 03.mp4", base)
	writeFileAt(t, dir, "qk2rlwv6tci3.mp4", base.Add(time.Minute))

	renamed, err := NewRenamer().RenameLatestEpisode(dir, "NegaPosi Angler", 4)
	if err != nil {
		t.Fatalf("rename: %v", err)
	}

	if renamed != "NegaPosi Angler - 04.mp4" {
		t.Fatalf("renamed = %q, want %q", renamed, "NegaPosi Angler - 04.mp4")
	}
	// The whole point of the feature: the counter must now read the episode back.
	if got := episodeNumberFromName(renamed); got != 4 {
		t.Fatalf("episodeNumberFromName(%q) = %d, want 4", renamed, got)
	}
}

func TestRenameLatestEpisodeKeepsTheSourceExtension(t *testing.T) {
	dir := t.TempDir()
	writeFileAt(t, dir, "opaque.mkv", time.Now())

	renamed, err := NewRenamer().RenameLatestEpisode(dir, "Frieren", 7)
	if err != nil {
		t.Fatalf("rename: %v", err)
	}

	if renamed != "Frieren - 07.mkv" {
		t.Fatalf("renamed = %q, want %q", renamed, "Frieren - 07.mkv")
	}
}

func TestRenameLatestEpisodePadsToTwoDigitsAndLetsLongerNumbersThrough(t *testing.T) {
	for _, tc := range []struct {
		episode int
		want    string
	}{
		{episode: 4, want: "Show - 04.mp4"},
		{episode: 12, want: "Show - 12.mp4"},
		{episode: 100, want: "Show - 100.mp4"},
	} {
		dir := t.TempDir()
		writeFileAt(t, dir, "opaque.mp4", time.Now())

		renamed, err := NewRenamer().RenameLatestEpisode(dir, "Show", tc.episode)
		if err != nil {
			t.Fatalf("episode %d: rename: %v", tc.episode, err)
		}
		if renamed != tc.want {
			t.Fatalf("episode %d: renamed = %q, want %q", tc.episode, renamed, tc.want)
		}
	}
}

// Canonical names carry characters Windows forbids in a filename. Without
// sanitizing, the rename fails outright on some of the most-watched shows.
func TestRenameLatestEpisodeStripsFilesystemReservedCharacters(t *testing.T) {
	for _, tc := range []struct {
		canonical string
		want      string
	}{
		{canonical: "Re:Zero", want: "ReZero - 01.mp4"},
		{canonical: "Fate/Zero", want: "FateZero - 01.mp4"},
		{canonical: `Kaguya-sama: Love is War`, want: "Kaguya-sama Love is War - 01.mp4"},
		{canonical: `A*B?C"D<E>F|G\H`, want: "ABCDEFGH - 01.mp4"},
	} {
		dir := t.TempDir()
		writeFileAt(t, dir, "opaque.mp4", time.Now())

		renamed, err := NewRenamer().RenameLatestEpisode(dir, tc.canonical, 1)
		if err != nil {
			t.Fatalf("%q: rename: %v", tc.canonical, err)
		}
		if renamed != tc.want {
			t.Fatalf("%q: renamed = %q, want %q", tc.canonical, renamed, tc.want)
		}
	}
}

func TestRenameLatestEpisodeIsANoOpWhenTheFileAlreadyHasTheTargetName(t *testing.T) {
	dir := t.TempDir()
	writeFileAt(t, dir, "Show - 05.mp4", time.Now())

	renamed, err := NewRenamer().RenameLatestEpisode(dir, "Show", 5)
	if err != nil {
		t.Fatalf("rename: %v", err)
	}

	if renamed != "Show - 05.mp4" {
		t.Fatalf("renamed = %q, want the unchanged name", renamed)
	}
	if names := namesAtRoot(t, dir); len(names) != 1 {
		t.Fatalf("folder = %v, want the single original file", names)
	}
}

// Overwriting would destroy an episode the user already has. The rename is a
// convenience; losing a file to it is never an acceptable price.
func TestRenameLatestEpisodeRefusesToOverwriteAnExistingTarget(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-time.Hour)
	writeFileAt(t, dir, "Show - 06.mp4", base)
	writeFileAt(t, dir, "opaque.mp4", base.Add(time.Minute))

	_, err := NewRenamer().RenameLatestEpisode(dir, "Show", 6)
	if err == nil {
		t.Fatal("rename succeeded, want a refusal because the target already exists")
	}

	names := namesAtRoot(t, dir)
	if len(names) != 2 {
		t.Fatalf("folder = %v, want both files left untouched", names)
	}
}

// Subtitles, .nfo sidecars and JD's own leftovers must not be mistaken for the
// episode that just landed.
func TestRenameLatestEpisodeIgnoresNonVideoFilesEvenWhenTheyAreNewer(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-time.Hour)
	writeFileAt(t, dir, "opaque.mp4", base)
	writeFileAt(t, dir, "opaque.srt", base.Add(time.Minute))
	writeFileAt(t, dir, "package.nfo", base.Add(2*time.Minute))

	renamed, err := NewRenamer().RenameLatestEpisode(dir, "Show", 2)
	if err != nil {
		t.Fatalf("rename: %v", err)
	}

	if renamed != "Show - 02.mp4" {
		t.Fatalf("renamed = %q, want the video file renamed", renamed)
	}
}

// The error must name the actual cause. Without the "nothing found" guard the
// call still fails -- but only later, when it tries to rename an empty path,
// which on some systems means renaming the folder itself.
func TestRenameLatestEpisodeReportsAnErrorWhenTheFolderHasNoVideo(t *testing.T) {
	dir := t.TempDir()
	writeFileAt(t, dir, "readme.txt", time.Now())

	_, err := NewRenamer().RenameLatestEpisode(dir, "Show", 1)
	if !errors.Is(err, errNoVideoAtRoot) {
		t.Fatalf("err = %v, want errNoVideoAtRoot", err)
	}
	if names := namesAtRoot(t, dir); len(names) != 1 || names[0] != "readme.txt" {
		t.Fatalf("folder = %v, want the original file untouched", names)
	}
}

// A directory whose name ends in a video extension must not be treated as the
// downloaded episode -- renaming it would move a whole folder.
func TestRenameLatestEpisodeNeverTreatsADirectoryAsTheDownloadedEpisode(t *testing.T) {
	dir := t.TempDir()
	base := time.Now().Add(-time.Hour)
	writeFileAt(t, dir, "opaque.mp4", base)
	decoy := filepath.Join(dir, "extracted.mp4")
	if err := os.Mkdir(decoy, 0o750); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.Chtimes(decoy, base.Add(time.Minute), base.Add(time.Minute)); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	renamed, err := NewRenamer().RenameLatestEpisode(dir, "Show", 8)
	if err != nil {
		t.Fatalf("rename: %v", err)
	}

	if renamed != "Show - 08.mp4" {
		t.Fatalf("renamed = %q, want the real video renamed", renamed)
	}
	info, err := os.Stat(decoy)
	if err != nil || !info.IsDir() {
		t.Fatalf("decoy directory was disturbed: err=%v", err)
	}
}

func TestRenameLatestEpisodeReportsAnErrorWhenTheFolderDoesNotExist(t *testing.T) {
	if _, err := NewRenamer().RenameLatestEpisode(filepath.Join(t.TempDir(), "missing"), "Show", 1); err == nil {
		t.Fatal("rename succeeded, want an error for a missing folder")
	}
}

// A canonical name that sanitizes away entirely would produce " - 01.mp4", which
// is worse than the opaque name it replaced.
func TestRenameLatestEpisodeRefusesAnEmptyCanonicalName(t *testing.T) {
	for _, canonical := range []string{"", "   ", `///`} {
		dir := t.TempDir()
		writeFileAt(t, dir, "opaque.mp4", time.Now())

		if _, err := NewRenamer().RenameLatestEpisode(dir, canonical, 1); err == nil {
			t.Fatalf("%q: rename succeeded, want a refusal for an unusable canonical name", canonical)
		}
		if names := namesAtRoot(t, dir); names[0] != "opaque.mp4" {
			t.Fatalf("%q: folder = %v, want the original file untouched", canonical, names)
		}
	}
}

// Subfolders are the flattener's job, not the renamer's.
func TestRenameLatestEpisodeOnlyLooksAtTheFolderRoot(t *testing.T) {
	dir := t.TempDir()
	nested := filepath.Join(dir, "Season 1")
	if err := os.Mkdir(nested, 0o750); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	base := time.Now().Add(-time.Hour)
	writeFileAt(t, dir, "opaque.mp4", base)
	writeFileAt(t, nested, "newer.mp4", base.Add(time.Minute))

	renamed, err := NewRenamer().RenameLatestEpisode(dir, "Show", 3)
	if err != nil {
		t.Fatalf("rename: %v", err)
	}

	if renamed != "Show - 03.mp4" {
		t.Fatalf("renamed = %q, want the root-level video renamed", renamed)
	}
}

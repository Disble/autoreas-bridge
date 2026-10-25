package filesystem

import (
	"os"
	"path/filepath"
	"testing"
)

// writeFile creates a test file and its parent directories.
func writeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// --- CountAtRoot (non-recursive) ---

func TestCountAtRootCountsOnlyVideoFilesDirectlyInFolder(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "ep01.mp4"))
	writeFile(t, filepath.Join(root, "ep02.mkv"))
	writeFile(t, filepath.Join(root, "readme.txt"))        // non-video, ignored
	writeFile(t, filepath.Join(root, "Pack1", "ep03.mp4")) // subfolder, ignored by CountAtRoot

	counter := NewEpisodeCounter()
	got := counter.CountAtRoot(root)
	if got != 2 {
		t.Fatalf("expected CountAtRoot=2, got %d", got)
	}
}

func TestCountAtRootReturnsZeroWhenFolderDoesNotExist(t *testing.T) {
	t.Parallel()

	counter := NewEpisodeCounter()
	got := counter.CountAtRoot(filepath.Join(t.TempDir(), "does-not-exist"))
	if got != 0 {
		t.Fatalf("expected 0 for a missing folder, got %d", got)
	}
}

func TestCountAtRootIsCaseInsensitiveOnExtension(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "EP01.MP4"))

	counter := NewEpisodeCounter()
	got := counter.CountAtRoot(root)
	if got != 1 {
		t.Fatalf("expected CountAtRoot=1 for uppercase extension, got %d", got)
	}
}

func TestHighestEpisodeAtRootUsesTrailingEpisodeNumberFromVideoFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "trigunstampedesvs-06.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampadesesq-08.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampadeevs-09.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampadesvqs-10.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampedestems-11", "episode.mp4"))

	counter := NewEpisodeCounter()
	got := counter.HighestEpisodeAtRoot(root)
	if got != 10 {
		t.Fatalf("expected highest root episode 10, got %d", got)
	}
}

// episodeNumberFromName is the single most dangerous parser in the download
// context: an over-read is silent and permanent. `d2ouiemgt90z.mp4` -- the real
// name Vidhide/JDownloader gave episode 1 of a 12-episode season -- was read as
// episode 90, which ended the catch-up loop after one episode and made the anime
// read as "up to date" forever. Under-reading is safe (CountAtRoot still counts
// the file), so anything ambiguous MUST return 0.
func TestEpisodeNumberFromNameReadsConventionalEpisodeNames(t *testing.T) {
	t.Parallel()

	cases := map[string]int{
		"trigunstampedesvs-06": 6,
		"Anime - 12":           12,
		"Anime_03":             3,
		"ep01":                 1,
		"EP 7":                 7,
		"cap12":                12,
		"Anime S01E12":         12,
		"Anime 12 (1080p)":     12,
		"5":                    5,
	}

	for name, want := range cases {
		if got := episodeNumberFromName(name + ".mp4"); got != want {
			t.Fatalf("episodeNumberFromName(%q) = %d, want %d", name, got, want)
		}
	}
}

func TestEpisodeNumberFromNameRefusesDigitsBuriedInOpaqueNames(t *testing.T) {
	t.Parallel()

	for _, name := range []string{
		"d2ouiemgt90z",     // the hoster hash that caused the bug
		"Anime [1080p]",    // resolution suffix, not an episode
		"Anime 720p",       // resolution suffix, not an episode
		"abc123def",        // digits mid-token
		"xyzape01",         // "e" preceded by a letter is not an episode marker
		"file9999999",      // implausibly long digit run
		"Anime - 9999999",  // properly delimited, but too long to be an episode
		"Anime - 20260805", // a date, not an episode
		"no digits at all", // nothing to read
	} {
		if got := episodeNumberFromName(name + ".mp4"); got != 0 {
			t.Fatalf("episodeNumberFromName(%q) = %d, want 0 (ambiguous names must not be read)", name, got)
		}
	}
}

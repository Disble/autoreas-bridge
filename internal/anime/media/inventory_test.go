package media

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
	"time"
)

// extensions is the injected candidate set used by these tests. It is deliberately NOT the
// production set: the point of injection is that this package owns no list of its own.
func extensions() map[string]bool {
	return map[string]bool{".mp4": true, ".mkv": true}
}

// writeFile creates one file inside folder and returns its path.
func writeFile(t *testing.T, folder, name, content string) string {
	t.Helper()

	path := filepath.Join(folder, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

// captureOne captures exactly one entry from folder.
func captureOne(t *testing.T, folder string) entry {
	t.Helper()

	got, err := New(extensions()).Capture(folder)
	if err != nil {
		t.Fatalf("capture %s: %v", folder, err)
	}
	if len(got) != 1 {
		t.Fatalf("expected exactly one entry, got %d (%v)", len(got), got)
	}
	return entry{basename: got[0].Basename, birthNs: got[0].BirthNs, mtimeNs: got[0].MtimeNs,
		errText: got[0].Err, changed: got[0].Changed}
}

// entry mirrors the fields these tests inspect, so a failure prints only what is compared.
type entry struct {
	basename string
	birthNs  string
	mtimeNs  string
	errText  string
	changed  bool
}

func TestCaptureListsOnlyTheCandidatesInNameOrder(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	writeFile(t, folder, "Show - 02.mkv", "b")
	writeFile(t, folder, "Show - 01.mp4", "a")
	writeFile(t, folder, "Show - 03.MP4", "c")
	writeFile(t, folder, "Show - 04.avi", "not in the injected set")
	writeFile(t, folder, "notes.txt", "not a candidate")
	writeFile(t, folder, "README", "no extension")
	writeFile(t, folder, ".hidden", "dotfile")
	if err := os.Mkdir(filepath.Join(folder, "AAA - 00.mp4"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.Mkdir(filepath.Join(folder, "Show - 05.mp4"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	got, err := New(extensions()).Capture(folder)
	if err != nil {
		t.Fatalf("capture: %v", err)
	}

	want := []string{"Show - 01.mp4", "Show - 02.mkv", "Show - 03.MP4"}
	if len(got) != len(want) {
		t.Fatalf("expected %d entries, got %d (%v)", len(want), len(got), got)
	}
	for i, name := range want {
		if got[i].Basename != name {
			t.Errorf("entry %d: want %q, got %q", i, name, got[i].Basename)
		}
	}
}

func TestCaptureReportsAnUnlistableFolderAsAnErrorNotAsEmpty(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		folder func(t *testing.T) string
	}{
		{"absent", func(t *testing.T) string { return filepath.Join(t.TempDir(), "missing") }},
		{"a file rather than a folder", func(t *testing.T) string {
			return writeFile(t, t.TempDir(), "Show - 01.mp4", "a")
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := New(extensions()).Capture(tc.folder(t))
			if err == nil {
				t.Fatalf("expected an error, got %d entries and no error", len(got))
			}
			if len(got) != 0 {
				t.Errorf("a failed capture must return no entries, got %v", got)
			}
		})
	}
}

func TestCaptureOfAnEmptyFolderIsAnEmptyListAndNotAnError(t *testing.T) {
	t.Parallel()

	got, err := New(extensions()).Capture(t.TempDir())
	if err != nil {
		t.Fatalf("an empty folder is not a failure: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no entries, got %v", got)
	}
}

func TestCaptureReadsTheRealTimesAndNeverSubstitutesThem(t *testing.T) {
	t.Parallel()

	if runtime.GOOS != "windows" {
		t.Skip("the creation time is read from the Windows filesystem")
	}

	folder := t.TempDir()
	path := writeFile(t, folder, "Show - 01.mp4", "a")
	modified := time.Date(2001, 2, 3, 4, 5, 6, 0, time.UTC)
	if err := os.Chtimes(path, modified, modified); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	got := captureOne(t, folder)
	if want := strconv.FormatInt(modified.UnixNano(), 10); got.mtimeNs != want {
		t.Errorf("mtime: want %s, got %s", want, got.mtimeNs)
	}
	birth, err := strconv.ParseInt(got.birthNs, 10, 64)
	if err != nil {
		t.Fatalf("creation time %q is not a number: %v", got.birthNs, err)
	}
	if birth <= 0 {
		t.Fatalf("creation time %d is not a real reading", birth)
	}
	if birth == modified.UnixNano() {
		t.Error("the creation time was substituted with the modification time")
	}
	if got.errText != "" {
		t.Errorf("a readable file must carry no error, got %q", got.errText)
	}
}

func TestCaptureReportsACandidateItCannotDescribeAndKeepsListingTheRest(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	writeFile(t, folder, "Show - 01.mp4", "a")
	writeFile(t, folder, "Show - 02.mp4", "b")
	writeFile(t, folder, "Show - 03.mp4", "c")

	inventory := New(extensions())
	real := inventory.stat
	inventory.stat = func(path string) (os.FileInfo, error) {
		if filepath.Base(path) == "Show - 02.mp4" {
			return nil, os.ErrPermission
		}
		return real(path)
	}

	got, err := inventory.Capture(folder)
	if err != nil {
		t.Fatalf("capture: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("every candidate must still be reported, got %d (%v)", len(got), got)
	}
	if got[1].Basename != "Show - 02.mp4" || got[1].Err == "" {
		t.Errorf("the undescribable candidate must carry its reason, got %+v", got[1])
	}
	if got[2].Basename != "Show - 03.mp4" {
		t.Errorf("the listing must continue past a failure, next entry is %q", got[2].Basename)
	}
}

func TestChangedWhileListingDistrustsAnErrorAndADifferentReading(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	path := writeFile(t, folder, "Show - 01.mp4", "a")
	stat := func(t *testing.T) os.FileInfo {
		t.Helper()

		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat: %v", err)
		}
		return info
	}

	first := readingOf(stat(t))
	if changedWhileListing(first, stat(t), nil) {
		t.Error("an unchanged file must stay trusted")
	}
	if !changedWhileListing(first, nil, os.ErrNotExist) {
		t.Error("a file that could not be described a second time must not be trusted")
	}

	later := time.Date(2002, 2, 3, 4, 5, 6, 0, time.UTC)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatalf("chtimes: %v", err)
	}
	if !changedWhileListing(first, stat(t), nil) {
		t.Error("a file whose modification time moved must not be trusted")
	}
}

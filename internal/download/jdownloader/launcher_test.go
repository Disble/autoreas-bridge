package jdownloader

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// --- ResolveExePath (Autoreas Settings downloader.dir) ---

// writeSettingsFile writes launcher settings to a temporary test file.
func writeSettingsFile(t *testing.T, dir, content string) string {
	t.Helper()
	path := filepath.Join(dir, "Settings")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write settings fixture: %v", err)
	}
	return path
}

func TestResolveExePathReturnsDownloaderDirWhenSettingsPresentAndValid(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := writeSettingsFile(t, dir, `{"downloader":{"dir":"C:/Program Files/JDownloader/JDownloader.exe"}}`)

	got, err := resolveExePathFromFile(path)
	if err != nil {
		t.Fatalf("resolveExePathFromFile: %v", err)
	}
	if got != "C:/Program Files/JDownloader/JDownloader.exe" {
		t.Fatalf("unexpected exe path: %q", got)
	}
}

func TestResolveExePathReturnsErrorWhenSettingsFileMissing(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	missing := filepath.Join(dir, "does-not-exist")

	_, err := resolveExePathFromFile(missing)
	if err == nil {
		t.Fatal("expected an error when the Settings file is missing")
	}
}

func TestResolveExePathReturnsErrorWhenSettingsJSONIsInvalid(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := writeSettingsFile(t, dir, `{not-valid-json`)

	_, err := resolveExePathFromFile(path)
	if err == nil {
		t.Fatal("expected an error when Settings JSON is invalid")
	}
}

func TestResolveExePathReturnsErrorWhenDownloaderDirIsEmpty(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := writeSettingsFile(t, dir, `{"downloader":{"dir":""}}`)

	_, err := resolveExePathFromFile(path)
	if err == nil {
		t.Fatal("expected an error when downloader.dir is empty/unconfigured")
	}
}

func TestResolveExePathReturnsErrorWhenDownloaderKeyIsAbsent(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := writeSettingsFile(t, dir, `{"darkMode":true}`)

	_, err := resolveExePathFromFile(path)
	if err == nil {
		t.Fatal("expected an error when the downloader key is absent from Settings")
	}
}

func TestAutoreasSettingsPathReturnsErrorWhenAPPDATAUnset(t *testing.T) {
	t.Parallel()

	_, err := autoreasSettingsPathFromEnv(func(string) string { return "" })
	if err == nil {
		t.Fatal("expected an error when APPDATA is not set")
	}
}

func TestAutoreasSettingsPathJoinsAPPDATAWithAutoreasSettings(t *testing.T) {
	t.Parallel()

	got, err := autoreasSettingsPathFromEnv(func(key string) string {
		if key == "APPDATA" {
			return `C:\Users\someone\AppData\Roaming`
		}
		return ""
	})
	if err != nil {
		t.Fatalf("autoreasSettingsPathFromEnv: %v", err)
	}
	want := filepath.Join(`C:\Users\someone\AppData\Roaming`, "Autoreas", "Settings")
	if got != want {
		t.Fatalf("unexpected settings path: got %q want %q", got, want)
	}
}

// --- exeLauncher (os/exec seam, NOT spawning a real process in tests) ---

func TestExeLauncherInvokesStartFuncWithResolvedPath(t *testing.T) {
	t.Parallel()

	var capturedPath string
	launcher := newExeLauncherWithStart(func(path string) error {
		capturedPath = path
		return nil
	}, func() (string, error) {
		return "C:/JD/JDownloader.exe", nil
	})

	if err := launcher(); err != nil {
		t.Fatalf("launcher: %v", err)
	}
	if capturedPath != "C:/JD/JDownloader.exe" {
		t.Fatalf("expected start to receive resolved exe path, got %q", capturedPath)
	}
}

func TestExeLauncherPropagatesResolveError(t *testing.T) {
	t.Parallel()

	resolveErr := errors.New("settings unreadable")
	called := false
	launcher := newExeLauncherWithStart(func(string) error {
		called = true
		return nil
	}, func() (string, error) {
		return "", resolveErr
	})

	err := launcher()
	if !errors.Is(err, resolveErr) {
		t.Fatalf("expected resolve error to propagate, got %v", err)
	}
	if called {
		t.Fatal("expected the start func NOT to be invoked when resolution fails")
	}
}

func TestExeLauncherPropagatesStartError(t *testing.T) {
	t.Parallel()

	startErr := errors.New("exec failed")
	launcher := newExeLauncherWithStart(func(string) error {
		return startErr
	}, func() (string, error) {
		return "C:/JD/JDownloader.exe", nil
	})

	err := launcher()
	if !errors.Is(err, startErr) {
		t.Fatalf("expected start error to propagate, got %v", err)
	}
}

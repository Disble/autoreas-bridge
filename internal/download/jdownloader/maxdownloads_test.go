package jdownloader

import (
	"os"
	"path/filepath"
	"testing"
)

// writeGeneralSettings lays out a fake JDownloader install: cfg/ sits beside the executable,
// which is how JD stores its configuration next to JDownloader2.exe.
func writeGeneralSettings(t *testing.T, body string) string {
	t.Helper()
	root := t.TempDir()
	cfg := filepath.Join(root, "cfg")
	if err := os.MkdirAll(cfg, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if body != "" {
		path := filepath.Join(cfg, "org.jdownloader.settings.GeneralSettings.json")
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
	}
	return filepath.Join(root, "JDownloader2.exe")
}

func TestMaxSimultaneousDownloadsReadsTheConfiguredLimit(t *testing.T) {
	t.Parallel()

	exe := writeGeneralSettings(t, `{"maxsimultanedownloads":3,"maxsimultanedownloadsperhost":1}`)

	got, err := MaxSimultaneousDownloads(exe)
	if err != nil {
		t.Fatalf("expected the limit to be read, got: %v", err)
	}
	if got != 3 {
		t.Fatalf("limit = %d, want 3", got)
	}
}

// The observed default on a real install is 1, which is exactly the value that makes Bridge
// flood JD with work it will queue -- so it must be read faithfully, not treated as unset.
func TestMaxSimultaneousDownloadsReadsAnExplicitOne(t *testing.T) {
	t.Parallel()

	exe := writeGeneralSettings(t, `{"maxsimultanedownloads":1}`)

	got, err := MaxSimultaneousDownloads(exe)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if got != 1 {
		t.Fatalf("limit = %d, want 1", got)
	}
}

func TestMaxSimultaneousDownloadsErrorsWhenTheConfigIsMissing(t *testing.T) {
	t.Parallel()

	exe := writeGeneralSettings(t, "")

	if _, err := MaxSimultaneousDownloads(exe); err == nil {
		t.Fatal("expected an error when the config file does not exist")
	}
}

// A key JD has never written is absent, not zero. Reporting 0 would stall every run, so an
// absent or non-positive value must surface as an error and let the caller decide.
func TestMaxSimultaneousDownloadsErrorsWhenTheKeyIsAbsentOrNonPositive(t *testing.T) {
	t.Parallel()

	for name, body := range map[string]string{
		"absent": `{"maxsimultanedownloadsperhost":1}`,
		"zero":   `{"maxsimultanedownloads":0}`,
		"nega":   `{"maxsimultanedownloads":-2}`,
	} {
		exe := writeGeneralSettings(t, body)
		if _, err := MaxSimultaneousDownloads(exe); err == nil {
			t.Fatalf("%s: expected an error, got none", name)
		}
	}
}

func TestMaxSimultaneousDownloadsErrorsOnMalformedJSON(t *testing.T) {
	t.Parallel()

	exe := writeGeneralSettings(t, `{"maxsimultanedownloads":`)

	if _, err := MaxSimultaneousDownloads(exe); err == nil {
		t.Fatal("expected an error on malformed config JSON")
	}
}

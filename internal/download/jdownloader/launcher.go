package jdownloader

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// autoreasSettings mirrors the subset of fields this adapter cares about from the Autoreas
// Electron Settings JSON file (cmd/poc/settings.go). The real file has many more fields
// (darkMode, days, is-season, etc.) -- only downloader.dir is consumed here.
type autoreasSettings struct {
	Downloader struct {
		Dir string `json:"dir"`
	} `json:"downloader"`
}

// autoreasSettingsPathFromEnv resolves the Autoreas Settings file path from an injected
// lookup func so tests never touch the real process environment (cmd/poc/settings.go
// autoreasSettingsPath, made testable via dependency injection).
func autoreasSettingsPathFromEnv(getenv func(string) string) (string, error) {
	appData := getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("jdownloader: APPDATA env var not set")
	}
	return filepath.Join(appData, "Autoreas", "Settings"), nil
}

// resolveExePathFromFile reads and parses the Settings file at path and returns the
// configured JDownloader executable path (downloader.dir), mirroring cmd/poc/settings.go
// downloaderExePath but accepting an explicit path so tests use real temp files instead of
// the real %APPDATA% location.
func resolveExePathFromFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("jdownloader: read settings %s: %w", path, err)
	}

	var s autoreasSettings
	if err := json.Unmarshal(data, &s); err != nil {
		return "", fmt.Errorf("jdownloader: parse settings %s: %w", path, err)
	}

	if s.Downloader.Dir == "" {
		return "", fmt.Errorf("jdownloader: downloader.dir not configured in Autoreas Settings (%s)", path)
	}

	return s.Downloader.Dir, nil
}

// ResolveExePath resolves the real JDownloader executable path from the real Autoreas
// Settings file at %APPDATA%/Autoreas/Settings (production entry point; Phase 6 wiring calls
// this to build the launcher passed to New).
func ResolveExePath() (string, error) {
	path, err := autoreasSettingsPathFromEnv(os.Getenv)
	if err != nil {
		return "", err
	}
	return resolveExePathFromFile(path)
}

// newExeLauncherWithStart is the test seam behind NewExeLauncher: it accepts an injected
// "start a process at this path" func and an injected exe-path resolver, so tests exercise
// the launch flow (resolve -> start) without spawning a real process or touching the real
// filesystem/environment.
func newExeLauncherWithStart(start func(path string) error, resolve func() (string, error)) func() error {
	return func() error {
		exePath, err := resolve()
		if err != nil {
			return fmt.Errorf("jdownloader: resolve exe path: %w", err)
		}
		if err := start(exePath); err != nil {
			return fmt.Errorf("jdownloader: launch %s: %w", exePath, err)
		}
		return nil
	}
}

// NewExeLauncher returns a launcher func() error suitable for myJDAdapter's launcher field
// (New/withLauncher): it resolves the exe path from the real Autoreas Settings file and
// starts the process via os/exec, mirroring cmd/poc/jdownloader.go's ensureOnline launch step.
// Production-only entry point -- never invoked directly by tests.
func NewExeLauncher() func() error {
	return newExeLauncherWithStart(startProcess, ResolveExePath)
}

// startProcess launches path as a detached child process via os/exec, matching the PoC's
// cmd.Start() (fire-and-forget; the adapter polls ListDevices afterwards rather than waiting
// on the process).
func startProcess(path string) error {
	cmd := exec.Command(path)
	return cmd.Start()
}

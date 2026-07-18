package main

import (
	"bytes"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

type lefthookConfig struct {
	PreCommit struct {
		Jobs []lefthookJob `yaml:"jobs"`
	} `yaml:"pre-commit"`
}

type lefthookJob struct {
	Name string `yaml:"name"`
	Run  string `yaml:"run"`
}

func TestCountEffectiveLines(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		content []byte
		want    int
	}{
		{
			name:    "ignores blank and comment only lines",
			content: []byte("package sample\n\n// comment\n/* block\ncomment */\nfunc run() {\n\tvalue := 1 // inline comment\n\t_ = value\n}\n"),
			want:    5,
		},
		{
			name:    "treats crlf and no trailing newline deterministically",
			content: []byte("package sample\r\n\r\nfunc run() {\r\n\tvalue := \"// not comment\"\r\n\t_ = value\r\n}"),
			want:    5,
		},
		{
			name:    "counts code lines that contain block comments",
			content: []byte("package sample\nfunc run() {\n\tvalue := 1 /* keep counting */ + 2\n\t_ = value\n}\n"),
			want:    5,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := countEffectiveLines(tt.content)
			if got != tt.want {
				t.Fatalf("countEffectiveLines() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestRunReportsViolationsAndSkipsExcludedFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeGoFile(t, root, "new_over_limit.go", repeatedEffectiveLineFile(501))
	writeGoFile(t, root, "legacy_growth.go", repeatedEffectiveLineFile(504))
	writeGoFile(t, root, "legacy_at_ceiling.go", repeatedEffectiveLineFile(503))
	writeGoFile(t, root, "generated/mock_generated.go", repeatedEffectiveLineFile(900))

	manifestPath := filepath.Join(root, "baseline.yaml")
	manifest := strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
exclude_paths:
  - .git/**
  - node_modules/**
  - vendor/**
exclude_file_patterns:
  - "**/*_generated.go"
files:
  - path: legacy_growth.go
    max_effective_lines: 503
    reason: legacy debt
  - path: legacy_at_ceiling.go
    max_effective_lines: 503
    reason: legacy debt
`)
	if err := os.WriteFile(manifestPath, []byte(manifest+"\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() manifest error = %v", err)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := run(root, manifestPath, &stdout, &stderr)
	if err == nil {
		t.Fatal("run() error = nil, want failure")
	}

	message := stderr.String()
	for _, want := range []string{
		"new_over_limit.go: 501 effective lines (new file over 500; limit 500)",
		"legacy_growth.go: 504 effective lines (baseline growth; ceiling 503)",
		"Shrink the file below 500 or update the committed baseline only for approved legacy debt.",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("run() stderr missing %q in %q", want, message)
		}
	}

	if strings.Contains(message, "legacy_at_ceiling.go") {
		t.Fatalf("run() stderr unexpectedly mentioned baseline file at ceiling: %q", message)
	}
	if strings.Contains(message, "mock_generated.go") {
		t.Fatalf("run() stderr unexpectedly mentioned excluded generated file: %q", message)
	}
	if stdout.Len() != 0 {
		t.Fatalf("run() stdout = %q, want empty", stdout.String())
	}
}

func TestRunReportsWarningsWithoutFailing(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeGoFile(t, root, "warning_only.go", repeatedEffectiveLineFile(400))
	writeGoFile(t, root, "warning_test.go", repeatedEffectiveLineFile(500))

	manifestPath := filepath.Join(root, "baseline.yaml")
	manifest := strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files: []
`)
	if err := os.WriteFile(manifestPath, []byte(manifest+"\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() manifest error = %v", err)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := run(root, manifestPath, &stdout, &stderr)
	if err != nil {
		t.Fatalf("run() error = %v, want nil", err)
	}

	message := stdout.String()
	for _, want := range []string{
		"Go file size warnings:",
		"warning_only.go: 400 effective lines (warning threshold 400; hard limit 500)",
		"warning_test.go: 500 effective lines (warning threshold 400; hard limit 500)",
		"Go file size check passed.",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("run() stdout missing %q in %q", want, message)
		}
	}

	if stderr.Len() != 0 {
		t.Fatalf("run() stderr = %q, want empty", stderr.String())
	}
}

func TestRunReportsWarningsAndFailuresTogether(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeGoFile(t, root, "warning_only.go", repeatedEffectiveLineFile(430))
	writeGoFile(t, root, "new_over_limit.go", repeatedEffectiveLineFile(501))
	writeGoFile(t, root, "legacy_growth.go", repeatedEffectiveLineFile(504))

	manifestPath := filepath.Join(root, "baseline.yaml")
	manifest := strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: legacy_growth.go
    max_effective_lines: 503
    reason: legacy debt
`)
	if err := os.WriteFile(manifestPath, []byte(manifest+"\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() manifest error = %v", err)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := run(root, manifestPath, &stdout, &stderr)
	if err == nil {
		t.Fatal("run() error = nil, want failure")
	}

	stdoutMessage := stdout.String()
	if !strings.Contains(stdoutMessage, "warning_only.go: 430 effective lines (warning threshold 400; hard limit 500)") {
		t.Fatalf("run() stdout missing warning output in %q", stdoutMessage)
	}

	stderrMessage := stderr.String()
	for _, want := range []string{
		"new_over_limit.go: 501 effective lines (new file over 500; limit 500)",
		"legacy_growth.go: 504 effective lines (baseline growth; ceiling 503)",
		"Shrink the file below 500 or update the committed baseline only for approved legacy debt.",
	} {
		if !strings.Contains(stderrMessage, want) {
			t.Fatalf("run() stderr missing %q in %q", want, stderrMessage)
		}
	}
}

func TestRunPassesForCurrentRepositoryBaseline(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	manifestPath := filepath.Join(root, "tools", "checkgofilesize", "baseline.yaml")

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := run(root, manifestPath, &stdout, &stderr)
	if err != nil {
		t.Fatalf("run() error = %v, stderr = %q", err, stderr.String())
	}

	if !strings.Contains(stdout.String(), "Go file size check passed.") {
		t.Fatalf("run() stdout = %q, want pass message", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("run() stderr = %q, want empty", stderr.String())
	}
}

func TestRepositoryBaselineTracksExactlyCurrentOversizedFiles(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	manifestPath := filepath.Join(root, "tools", "checkgofilesize", "baseline.yaml")

	content, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}

	var manifest baselineManifest
	if err := yaml.Unmarshal(content, &manifest); err != nil {
		t.Fatalf("yaml.Unmarshal() error = %v", err)
	}

	counts, err := scanGoFiles(root, manifest)
	if err != nil {
		t.Fatalf("scanGoFiles() error = %v", err)
	}

	oversizedPaths := make([]string, 0)
	for path, count := range counts {
		if count > manifest.DefaultMaxEffectiveLines {
			oversizedPaths = append(oversizedPaths, path)
		}
	}
	slices.Sort(oversizedPaths)

	baselinePaths := make([]string, 0, len(manifest.Files))
	baselineCounts := make(map[string]int, len(manifest.Files))
	for _, file := range manifest.Files {
		normalizedPath := normalizePath(file.Path)
		baselinePaths = append(baselinePaths, normalizedPath)
		baselineCounts[normalizedPath] = file.MaxEffectiveLines
	}
	slices.Sort(baselinePaths)

	actualCounts := make(map[string]int, len(oversizedPaths))
	for _, filePath := range oversizedPaths {
		actualCounts[filePath] = counts[filePath]
	}

	if !slices.Equal(oversizedPaths, baselinePaths) {
		t.Fatalf("baseline paths = %v, want %v (baseline counts = %v, actual counts = %v)", baselinePaths, oversizedPaths, baselineCounts, actualCounts)
	}

	if !mapsEqual(actualCounts, baselineCounts) {
		t.Fatalf("baseline counts = %v, want %v", baselineCounts, actualCounts)
	}
}

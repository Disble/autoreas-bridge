package main

import (
	"bytes"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

type lefthookConfig struct {
	PreCommit struct {
		Jobs []struct {
			Name string `yaml:"name"`
			Run  string `yaml:"run"`
		} `yaml:"jobs"`
	} `yaml:"pre-commit"`
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

func TestLoadBaselineRejectsInvalidEntries(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		files       map[string]string
		manifest    string
		wantMessage string
	}{
		{
			name: "rejects duplicate paths",
			files: map[string]string{
				"legacy.go": repeatedEffectiveLineFile(501),
			},
			manifest: strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: legacy.go
    max_effective_lines: 501
    reason: first entry
  - path: legacy.go
    max_effective_lines: 501
    reason: duplicate entry
`),
			wantMessage: "duplicate baseline path",
		},
		{
			name: "rejects glob paths in baseline entries",
			files: map[string]string{
				"legacy.go": repeatedEffectiveLineFile(501),
			},
			manifest: strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: internal/**/*.go
    max_effective_lines: 501
    reason: invalid glob
`),
			wantMessage: "must be exact repo-relative paths",
		},
		{
			name: "rejects entries at or below the default limit",
			files: map[string]string{
				"legacy.go": repeatedEffectiveLineFile(500),
			},
			manifest: strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: legacy.go
    max_effective_lines: 500
    reason: should not be baseline debt
`),
			wantMessage: "must be above default_max_effective_lines",
		},
		{
			name: "rejects entries for files that are not oversized",
			files: map[string]string{
				"legacy.go": repeatedEffectiveLineFile(499),
			},
			manifest: strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: legacy.go
    max_effective_lines: 501
    reason: file is already within policy
`),
			wantMessage: "is not oversized under deterministic counting",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			for path, content := range tt.files {
				fullPath := filepath.Join(root, filepath.FromSlash(path))
				if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
					t.Fatalf("MkdirAll() error = %v", err)
				}
				if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
					t.Fatalf("WriteFile() error = %v", err)
				}
			}

			manifestPath := filepath.Join(root, "baseline.yaml")
			if err := os.WriteFile(manifestPath, []byte(tt.manifest+"\n"), 0o644); err != nil {
				t.Fatalf("WriteFile() manifest error = %v", err)
			}

			_, err := loadBaseline(root, manifestPath)
			if err == nil {
				t.Fatal("loadBaseline() error = nil, want failure")
			}
			if !strings.Contains(err.Error(), tt.wantMessage) {
				t.Fatalf("loadBaseline() error = %q, want substring %q", err.Error(), tt.wantMessage)
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

func TestRepositoryHookRunsGoFileSizeBeforeGolangCILint(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	content := readRepoFile(t, root, "lefthook.yml")

	var config lefthookConfig
	if err := yaml.Unmarshal(content, &config); err != nil {
		t.Fatalf("yaml.Unmarshal() error = %v", err)
	}

	jobs := config.PreCommit.Jobs
	goFileSizeIndex := -1
	golangciIndex := -1
	for index, job := range jobs {
		if job.Name == "go-filesize" {
			goFileSizeIndex = index
			if job.Run != "go run ./tools/checkgofilesize" {
				t.Fatalf("go-filesize run = %q, want %q", job.Run, "go run ./tools/checkgofilesize")
			}
		}
		if job.Name == "golangci-lint" {
			golangciIndex = index
		}
	}

	if goFileSizeIndex == -1 {
		t.Fatal("lefthook.yml is missing pre-commit job go-filesize")
	}
	if golangciIndex == -1 {
		t.Fatal("lefthook.yml is missing pre-commit job golangci-lint")
	}
	if goFileSizeIndex > golangciIndex {
		t.Fatalf("go-filesize job index = %d, want before golangci-lint index = %d", goFileSizeIndex, golangciIndex)
	}
	if goFileSizeIndex == 0 {
		t.Fatal("go-filesize should run after gofmt in the deterministic Go gate sequence")
	}
	if jobs[goFileSizeIndex-1].Name != "gofmt" {
		t.Fatalf("job before go-filesize = %q, want gofmt", jobs[goFileSizeIndex-1].Name)
	}
}

func TestRepositoryPolicyDocsDescribeCrossCuttingGoFileSizeRule(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	checks := []struct {
		path     string
		snippets []string
	}{
		{
			path: "AGENTS.md",
			snippets: []string{
				"Go and frontend files share a 500 effective-line architecture policy",
				"Existing oversized Go files may stay only when `tools/checkgofilesize/baseline.yaml` records a no-growth ceiling",
			},
		},
		{
			path: "CLAUDE.md",
			snippets: []string{
				"Go and frontend files share the same 500 effective-line architecture policy",
				"`go run ./tools/checkgofilesize` is part of the repo-owned pre-commit gate",
			},
		},
		{
			path: filepath.Join("docs", "architecture.md"),
			snippets: []string{
				"Go and frontend source files follow a shared 500 effective-line ceiling",
				"`tools/checkgofilesize/baseline.yaml` carries temporary no-growth ceilings for legacy Go debt",
			},
		},
	}

	for _, check := range checks {
		check := check
		t.Run(check.path, func(t *testing.T) {
			t.Parallel()

			requireFileContainsAll(t, readRepoFile(t, root, check.path), check.path, check.snippets...)
		})
	}
}

func TestRepositoryBaselineDocumentsMaintenanceRule(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	requireFileContainsAll(t, readRepoFile(t, root, filepath.Join("tools", "checkgofilesize", "baseline.yaml")), "tools/checkgofilesize/baseline.yaml", []string{
		"Baseline maintenance rules:",
		"Shrink ceilings in the same PR when a legacy file gets smaller.",
		"Remove the entry as soon as deterministic counting reaches 500 effective lines or fewer.",
	}...)
}

func TestRepositoryVerificationEvidenceCapturesDirectInspectionAndNegativeCases(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	content := readRepoFile(t, root, filepath.Join("docs", "verification", "global-go-file-size-policy-slice-2.md"))
	requireFileContainsAll(t, content, "docs/verification/global-go-file-size-policy-slice-2.md", []string{
		"# Verification Evidence — Global Go File Size Policy Slice 2",
		"Direct inspection is mandatory.",
		"go run ./tools/checkgofilesize",
		"new file over 500",
		"baseline growth",
		"app.go",
		"internal/anime/domain/anime_raw.go",
		"internal/download/service_test.go",
		"lefthook.yml",
	}...)

	if !strings.Contains(string(content), strconv.Quote("Go file size check failed:")) {
		t.Fatalf("verification evidence missing quoted negative validator output header")
	}
}

func repeatedEffectiveLineFile(lines int) string {
	builder := strings.Builder{}
	builder.WriteString("package sample\n")
	for index := 0; index < lines-1; index++ {
		builder.WriteString("var value")
		builder.WriteString(strings.Repeat("x", index%3))
		builder.WriteString(" = 1\n")
	}
	return builder.String()
}

func repoRootFromTest(t *testing.T) string {
	t.Helper()

	root := filepath.Clean(filepath.Join("..", ".."))
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("repo root %q missing go.mod: %v", root, err)
	}
	return root
}

func writeGoFile(t *testing.T, root string, relativePath string, content string) {
	t.Helper()

	fullPath := filepath.Join(root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func mapsEqual(left map[string]int, right map[string]int) bool {
	if len(left) != len(right) {
		return false
	}

	for key, value := range left {
		if right[key] != value {
			return false
		}
	}

	return true
}

func readRepoFile(t *testing.T, root string, relativePath string) []byte {
	t.Helper()

	content, err := os.ReadFile(filepath.Join(root, relativePath))
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", relativePath, err)
	}

	return content
}

func requireFileContainsAll(t *testing.T, content []byte, path string, snippets ...string) {
	t.Helper()

	text := string(content)
	for _, snippet := range snippets {
		if !strings.Contains(text, snippet) {
			t.Fatalf("%s missing snippet %q", path, snippet)
		}
	}
}

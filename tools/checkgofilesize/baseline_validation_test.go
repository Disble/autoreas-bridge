package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadBaselineRejectsInvalidEntries(t *testing.T) {
	t.Parallel()
	for _, tt := range baselineValidationCases() {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			runBaselineValidationCase(t, tt)
		})
	}
}

type baselineValidationCase struct {
	name        string
	files       map[string]string
	manifest    string
	wantMessage string
}

// baselineValidationCases returns the set of table-driven test cases
// exercising baseline file validation rules in checkgofilesize.
func baselineValidationCases() []baselineValidationCase {
	return []baselineValidationCase{
		{name: "rejects duplicate paths", files: map[string]string{"legacy.go": repeatedEffectiveLineFile(501)}, manifest: strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: legacy.go
    max_effective_lines: 501
    reason: first entry
  - path: legacy.go
    max_effective_lines: 501
    reason: duplicate entry
`), wantMessage: "duplicate baseline path"},
		{name: "rejects glob paths in baseline entries", files: map[string]string{"legacy.go": repeatedEffectiveLineFile(501)}, manifest: strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: internal/**/*.go
    max_effective_lines: 501
    reason: invalid glob
`), wantMessage: "must be exact repo-relative paths"},
		{name: "rejects entries at or below the default limit", files: map[string]string{"legacy.go": repeatedEffectiveLineFile(500)}, manifest: strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: legacy.go
    max_effective_lines: 500
    reason: should not be baseline debt
`), wantMessage: "must be above default_max_effective_lines"},
		{name: "rejects entries for files that are not oversized", files: map[string]string{"legacy.go": repeatedEffectiveLineFile(499)}, manifest: strings.TrimSpace(`
version: 1
default_max_effective_lines: 500
files:
  - path: legacy.go
    max_effective_lines: 501
    reason: file is already within policy
		`), wantMessage: "is not oversized under deterministic counting"},
	}
}

// runBaselineValidationCase executes one invalid-baseline test case.
func runBaselineValidationCase(t *testing.T, tt baselineValidationCase) {
	t.Helper()
	root := t.TempDir()
	for path, content := range tt.files {
		writeGoFile(t, root, path, content)
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
}

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repeatedEffectiveLineFile creates source with the requested effective line count.
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

// repoRootFromTest resolves and validates the repository root for a test.
func repoRootFromTest(t *testing.T) string {
	t.Helper()

	root := filepath.Clean(filepath.Join("..", ".."))
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("repo root %q missing go.mod: %v", root, err)
	}
	return root
}

// writeGoFile creates a test Go file beneath a temporary root.
func writeGoFile(t *testing.T, root, relativePath, content string) {
	t.Helper()

	fullPath := filepath.Join(root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

// mapsEqual reports whether two string-to-int maps contain the same entries.
func mapsEqual(left, right map[string]int) bool {
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

// readRepoFile reads a repository file for test assertions.
func readRepoFile(t *testing.T, root, relativePath string) []byte {
	t.Helper()

	content, err := os.ReadFile(filepath.Join(root, relativePath))
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", relativePath, err)
	}

	return content
}

// requireFileContainsAll asserts that a file contains every requested snippet.
func requireFileContainsAll(t *testing.T, content []byte, path string, snippets ...string) {
	t.Helper()

	text := string(content)
	for _, snippet := range snippets {
		if !strings.Contains(text, snippet) {
			t.Fatalf("%s missing snippet %q", path, snippet)
		}
	}
}

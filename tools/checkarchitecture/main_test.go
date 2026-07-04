package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunRejectsActivityLogReferencesOutsideActivityContext(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, root, "internal/anime/service.go", `package anime
const query = "INSERT INTO activity_log DEFAULT VALUES"
`)

	err := run(root)
	if err == nil {
		t.Fatal("expected architecture violation")
	}
}

func TestRunAllowsActivityLogReferencesInsideActivityContext(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, root, "internal/activity/sqlite_store.go", `package activity
const query = "INSERT INTO activity_log DEFAULT VALUES"
`)

	if err := run(root); err != nil {
		t.Fatalf("expected activity context reference to pass, got %v", err)
	}
}

func writeFile(t *testing.T, root string, name string, content string) {
	t.Helper()

	path := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
}

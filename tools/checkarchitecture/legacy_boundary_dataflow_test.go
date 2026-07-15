package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestRunRejectsLexicalAnimeDataFileIOBypasses(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		content string
	}{
		{
			name: "function alias",
			content: `package season
import (
  "os"
  "path/filepath"
)
func read() {
  readFile := os.ReadFile
  _, _ = readFile(filepath.Join("data", "animes.dat"))
}
`,
		},
		{
			name: "constant folded filename",
			content: `package season
import "os"
func read() { _, _ = os.ReadFile("animes" + ".dat") }
`,
		},
		{
			name: "directory filesystem receiver",
			content: `package season
import "os"
func read() {
  animeFS := os.DirFS("data")
  _, _ = animeFS.Open("animes.dat")
}
`,
		},
		{
			name: "read before path reassignment",
			content: `package season
import "os"
func read() {
  source := "animes.dat"
  _, _ = os.ReadFile(source)
  source = "settings.json"
}
`,
		},
		{
			name: "aliased append open",
			content: `package season
import "os"
func appendAnime() {
  animePath := "data/animes.dat"
  openFile := os.OpenFile
  _, _ = openFile(animePath, os.O_APPEND|os.O_WRONLY, 0600)
}
`,
		},
		{
			name: "assigned joined write path",
			content: `package season
import (
  "os"
  pathutil "path/filepath"
)
func write() {
  name := "animes.dat"
  target := pathutil.Join("data", name)
  _ = os.WriteFile(target, nil, 0600)
}
`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			file := "internal/season/parallel_io.go"
			writeFile(t, root, file, tt.content)
			err := run(root)
			if err == nil {
				t.Fatal("expected animes.dat file-I/O violation")
			}
			message := filepath.ToSlash(err.Error())
			if !strings.Contains(message, file) || !strings.Contains(message, "animes.dat file I/O") {
				t.Fatalf("expected actionable file-I/O diagnostic, got %v", err)
			}
		})
	}
}

func TestRunAllowsUnrelatedIOBeforeAnimePathReassignmentAndInShadowedScope(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, root, "internal/season/unrelated_io.go", `package season
import "os"
func readSettings() {
  source := "settings.json"
  _, _ = os.ReadFile(source)
  source = "animes.dat"
  _ = source
}
func readShadowed() {
  source := "animes.dat"
  {
    source := "settings.json"
    readFile := os.ReadFile
    _, _ = readFile(source)
  }
  _ = source
}
`)

	if err := run(root); err != nil {
		t.Fatalf("expected position-aware unrelated I/O to pass, got %v", err)
	}
}

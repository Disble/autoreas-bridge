package main

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestPatchAnimeRequestBodyDocumentsEnglishAliasesAdditively proves the SDD-55 openapi
// spec scenario "Renamed fields are documented": docs/openapi.yaml documents the new
// English wire field names for PATCH /api/animes/{id} alongside the Legacy-Spanish names,
// which stay present and working (additive rename; no field removed).
func TestPatchAnimeRequestBodyDocumentsEnglishAliasesAdditively(t *testing.T) {
	root, err := findRepoRoot()
	if err != nil {
		t.Fatalf("locate repo root: %v", err)
	}

	properties := patchAnimeRequestBodyProperties(t, filepath.Join(root, "docs", "openapi.yaml"))

	for _, want := range []string{"status", "episodesWatched", "days"} {
		if _, ok := properties[want]; !ok {
			t.Fatalf("expected PATCH /api/animes/{id} request body to document English field %q, got properties %#v", want, keysOf(properties))
		}
	}
	for _, want := range []string{"estado", "nrocapvisto", "dias"} {
		if _, ok := properties[want]; !ok {
			t.Fatalf("expected PATCH /api/animes/{id} request body to still document Legacy-Spanish field %q (additive rename), got properties %#v", want, keysOf(properties))
		}
	}
}

// patchAnimeRequestBodyProperties parses the PATCH /api/animes/{id} request body schema
// properties from an OpenAPI YAML document.
func patchAnimeRequestBodyProperties(t *testing.T, yamlPath string) map[string]any {
	t.Helper()

	content, err := os.ReadFile(yamlPath)
	if err != nil {
		t.Fatalf("read %s: %v", yamlPath, err)
	}

	var doc struct {
		Paths map[string]struct {
			Patch struct {
				RequestBody struct {
					Content struct {
						JSON struct {
							Schema struct {
								Properties map[string]any `yaml:"properties"`
							} `yaml:"schema"`
						} `yaml:"application/json"`
					} `yaml:"content"`
				} `yaml:"requestBody"`
			} `yaml:"patch"`
		} `yaml:"paths"`
	}
	if err := yaml.Unmarshal(content, &doc); err != nil {
		t.Fatalf("unmarshal %s: %v", yamlPath, err)
	}

	patchPath, ok := doc.Paths["/api/animes/{id}"]
	if !ok {
		t.Fatalf("expected /api/animes/{id} to be documented in %s", yamlPath)
	}
	return patchPath.Patch.RequestBody.Content.JSON.Schema.Properties
}

// keysOf returns the keys of a string-keyed map for failure-message readability.
func keysOf(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// findRepoRoot walks up from the working directory until it finds go.mod.
func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, statErr := os.Stat(filepath.Join(dir, "go.mod")); statErr == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", os.ErrNotExist
		}
		dir = parent
	}
}

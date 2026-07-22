package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestPatchAnimeRequestBodyDocumentsEnglishOnly proves the SDD-56 hard-cutover openapi
// scenario: docs/openapi.yaml documents ONLY the English wire field names for
// PATCH /api/animes/{id}. The Legacy-Spanish keys (estado, nrocapvisto, dias,
// fechaUltCapVisto) are no longer documented as accepted request-body properties --
// they are deprecated and rejected with 400 when sent without their English
// replacement (see the 400 response description, asserted below).
func TestPatchAnimeRequestBodyDocumentsEnglishOnly(t *testing.T) {
	root, err := findRepoRoot()
	if err != nil {
		t.Fatalf("locate repo root: %v", err)
	}

	yamlPath := filepath.Join(root, "docs", "openapi.yaml")
	properties := patchAnimeRequestBodyProperties(t, yamlPath)

	for _, want := range []string{"status", "episodesWatched", "days", "lastWatchedAt", "base"} {
		if _, ok := properties[want]; !ok {
			t.Fatalf("expected PATCH /api/animes/{id} request body to document English field %q, got properties %#v", want, keysOf(properties))
		}
	}
	for _, gone := range []string{"estado", "nrocapvisto", "dias", "fechaUltCapVisto"} {
		if _, ok := properties[gone]; ok {
			t.Fatalf("expected PATCH /api/animes/{id} request body to no longer document deprecated Spanish field %q (SDD-56 hard cutover), got properties %#v", gone, keysOf(properties))
		}
	}

	response400 := patchAnime400Description(t, yamlPath)
	if !strings.Contains(response400, "renamed") {
		t.Fatalf("expected PATCH /api/animes/{id} 400 response to document the deprecated-Spanish-key rejection, got %q", response400)
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

// patchAnime400Description parses the PATCH /api/animes/{id} 400 response description
// from an OpenAPI YAML document.
func patchAnime400Description(t *testing.T, yamlPath string) string {
	t.Helper()

	content, err := os.ReadFile(yamlPath)
	if err != nil {
		t.Fatalf("read %s: %v", yamlPath, err)
	}

	var doc struct {
		Paths map[string]struct {
			Patch struct {
				Responses map[string]struct {
					Description string `yaml:"description"`
				} `yaml:"responses"`
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
	return patchPath.Patch.Responses["400"].Description
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

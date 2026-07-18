package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"gopkg.in/yaml.v3"
)

var routerPathPattern = regexp.MustCompile(`mux\.Handle(?:Func)?\("([^"]+)"`)

type openAPIDoc struct {
	OpenAPI string                   `yaml:"openapi"`
	Info    struct{ Version string } `yaml:"info"`
	Paths   map[string]interface{}   `yaml:"paths"`
}

func main() {
	root, err := os.Getwd()
	if err != nil {
		fail("resolve working directory", err)
	}

	yamlPath := filepath.Join(root, "docs", "openapi.yaml")
	if _, err := os.Stat(yamlPath); os.IsNotExist(err) {
		fmt.Println("docs/openapi.yaml not found; skipping OpenAPI gate.")
		return
	}

	routerPath := filepath.Join(root, "internal", "api", "router.go")

	raw, err := extractPaths(routerPath)
	if err != nil {
		fail("read internal/api/router.go", err)
	}

	required := normalizePaths(raw)

	specPaths, err := parseYAMLPaths(yamlPath)
	if err != nil {
		fail("parse docs/openapi.yaml", err)
	}

	var missing []string
	for _, p := range required {
		if !specPaths[p] {
			missing = append(missing, p)
		}
	}

	if len(missing) > 0 {
		for _, p := range missing {
			fmt.Fprintf(os.Stderr, "path %q is documented in router.go but missing from docs/openapi.yaml\n", p)
		}
		os.Exit(1)
	}

	fmt.Println("OpenAPI gate passed.")
}

// extractPaths reads registered route paths from a router source file.
func extractPaths(routerFile string) ([]string, error) {
	content, err := os.ReadFile(routerFile)
	if err != nil {
		return nil, err
	}

	matches := routerPathPattern.FindAllSubmatch(content, -1)
	paths := make([]string, 0, len(matches))
	for _, m := range matches {
		if len(m) > 1 {
			paths = append(paths, string(m[1]))
		}
	}

	return paths, nil
}

// normalizePaths filters and canonicalizes extracted route paths.
func normalizePaths(raw []string) []string {
	skip := map[string]bool{
		"/api/animes": true,
		"/ws":         true,
	}
	normalize := map[string]string{
		"/api/animes/":    "/api/animes/{id}",
		"/api/devices/":   "/api/devices/{id}",
		"/api/conflicts/": "/api/conflicts/{id}/resolve",
	}

	seen := map[string]bool{}
	result := make([]string, 0, len(raw))

	for _, p := range raw {
		if skip[p] {
			continue
		}
		if norm, ok := normalize[p]; ok {
			p = norm
		}
		if !seen[p] {
			seen[p] = true
			result = append(result, p)
		}
	}

	return result
}

// parseYAMLPaths reads and validates the documented paths from an OpenAPI YAML file.
func parseYAMLPaths(yamlFile string) (map[string]bool, error) {
	content, err := os.ReadFile(yamlFile)
	if err != nil {
		return nil, err
	}

	var doc openAPIDoc
	if err := yaml.Unmarshal(content, &doc); err != nil {
		return nil, err
	}

	if doc.OpenAPI == "" {
		return nil, fmt.Errorf("docs/openapi.yaml is missing required \"openapi\" field")
	}

	paths := make(map[string]bool, len(doc.Paths))
	for k := range doc.Paths {
		paths[k] = true
	}

	return paths, nil
}

// fail reports a non-nil error and terminates the check.
func fail(context string, err error) {
	if err == nil {
		return
	}
	fmt.Fprintf(os.Stderr, "%s: %v\n", context, err)
	os.Exit(1)
}

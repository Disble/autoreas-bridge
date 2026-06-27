package main

import (
	"errors"
	"fmt"
	"go/scanner"
	"go/token"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

type baselineManifest struct {
	Version                  int             `yaml:"version"`
	DefaultMaxEffectiveLines int             `yaml:"default_max_effective_lines"`
	ExcludePaths             []string        `yaml:"exclude_paths"`
	ExcludeFilePatterns      []string        `yaml:"exclude_file_patterns"`
	Files                    []baselineEntry `yaml:"files"`
}

type baselineEntry struct {
	Path              string `yaml:"path"`
	MaxEffectiveLines int    `yaml:"max_effective_lines"`
	Reason            string `yaml:"reason"`
}

type violation struct {
	Path              string
	EffectiveLines    int
	MaxEffectiveLines int
	Reason            string
}

type warningEntry struct {
	Path             string
	EffectiveLines   int
	WarningThreshold int
	HardLimit        int
}

func main() {
	root, err := os.Getwd()
	if err != nil {
		fail("resolve working directory", err)
	}

	manifestPath := filepath.Join(root, "tools", "checkgofilesize", "baseline.yaml")
	if err := run(root, manifestPath, os.Stdout, os.Stderr); err != nil {
		os.Exit(1)
	}
}

func run(root string, manifestPath string, stdout io.Writer, stderr io.Writer) error {
	manifest, err := loadBaseline(root, manifestPath)
	if err != nil {
		return writeError(stderr, "load baseline manifest", err)
	}

	warnings, violations, err := checkFiles(root, manifest)
	if err != nil {
		return writeError(stderr, "check Go file sizes", err)
	}

	if len(warnings) > 0 {
		_, _ = fmt.Fprintln(stdout, formatWarnings(warnings))
	}

	if len(violations) == 0 {
		_, _ = fmt.Fprintln(stdout, "Go file size check passed.")
		return nil
	}

	_, _ = fmt.Fprintln(stderr, formatViolations(violations))
	return errors.New("go file size check failed")
}

func loadBaseline(root string, manifestPath string) (baselineManifest, error) {
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		return baselineManifest{}, fmt.Errorf("read baseline manifest: %w", err)
	}

	var manifest baselineManifest
	if err := yaml.Unmarshal(content, &manifest); err != nil {
		return baselineManifest{}, fmt.Errorf("parse baseline manifest: %w", err)
	}

	if manifest.Version != 1 {
		return baselineManifest{}, fmt.Errorf("baseline manifest version must be 1")
	}
	if manifest.DefaultMaxEffectiveLines <= 0 {
		return baselineManifest{}, fmt.Errorf("default_max_effective_lines must be greater than zero")
	}

	seenPaths := make(map[string]struct{}, len(manifest.Files))
	for _, file := range manifest.Files {
		normalizedPath := normalizePath(file.Path)
		if normalizedPath == "" {
			return baselineManifest{}, fmt.Errorf("baseline entries require a path")
		}
		if containsGlob(normalizedPath) {
			return baselineManifest{}, fmt.Errorf("baseline path %q must be exact repo-relative paths", file.Path)
		}
		if _, exists := seenPaths[normalizedPath]; exists {
			return baselineManifest{}, fmt.Errorf("duplicate baseline path %q", normalizedPath)
		}
		seenPaths[normalizedPath] = struct{}{}

		if file.MaxEffectiveLines <= manifest.DefaultMaxEffectiveLines {
			return baselineManifest{}, fmt.Errorf("baseline path %q must be above default_max_effective_lines", normalizedPath)
		}

		fullPath := filepath.Join(root, filepath.FromSlash(normalizedPath))
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return baselineManifest{}, fmt.Errorf("baseline path %q must point to an existing file: %w", normalizedPath, err)
		}

		effectiveLines := countEffectiveLines(content)
		if effectiveLines <= manifest.DefaultMaxEffectiveLines {
			return baselineManifest{}, fmt.Errorf("baseline path %q is not oversized under deterministic counting (counted %d, limit %d)", normalizedPath, effectiveLines, manifest.DefaultMaxEffectiveLines)
		}
	}

	return manifest, nil
}

func checkFiles(root string, manifest baselineManifest) ([]warningEntry, []violation, error) {
	counts, err := scanGoFiles(root, manifest)
	if err != nil {
		return nil, nil, err
	}

	baseline := make(map[string]baselineEntry, len(manifest.Files))
	for _, file := range manifest.Files {
		baseline[normalizePath(file.Path)] = baselineEntry{
			Path:              normalizePath(file.Path),
			MaxEffectiveLines: file.MaxEffectiveLines,
			Reason:            file.Reason,
		}
	}

	warnings := make([]warningEntry, 0)
	violations := make([]violation, 0)
	for filePath, count := range counts {
		if count >= 400 && count <= manifest.DefaultMaxEffectiveLines {
			warnings = append(warnings, warningEntry{
				Path:             filePath,
				EffectiveLines:   count,
				WarningThreshold: 400,
				HardLimit:        manifest.DefaultMaxEffectiveLines,
			})
		}

		if entry, exists := baseline[filePath]; exists {
			if count > entry.MaxEffectiveLines {
				violations = append(violations, violation{
					Path:              filePath,
					EffectiveLines:    count,
					MaxEffectiveLines: entry.MaxEffectiveLines,
					Reason:            "baseline growth",
				})
			}
			continue
		}

		if count > manifest.DefaultMaxEffectiveLines {
			violations = append(violations, violation{
				Path:              filePath,
				EffectiveLines:    count,
				MaxEffectiveLines: manifest.DefaultMaxEffectiveLines,
				Reason:            "new file over 500",
			})
		}
	}

	sort.Slice(warnings, func(left int, right int) bool {
		return warnings[left].Path < warnings[right].Path
	})

	sort.Slice(violations, func(left int, right int) bool {
		return violations[left].Path < violations[right].Path
	})

	return warnings, violations, nil
}

func scanGoFiles(root string, manifest baselineManifest) (map[string]int, error) {
	files, err := collectGoFiles(root, manifest)
	if err != nil {
		return nil, err
	}

	counts := make(map[string]int, len(files))
	for _, filePath := range files {
		fullPath := filepath.Join(root, filepath.FromSlash(filePath))
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return nil, err
		}
		counts[filePath] = countEffectiveLines(content)
	}

	return counts, nil
}

func collectGoFiles(root string, manifest baselineManifest) ([]string, error) {
	files := make([]string, 0)

	err := filepath.WalkDir(root, func(currentPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		relPath, err := filepath.Rel(root, currentPath)
		if err != nil {
			return err
		}
		normalizedPath := normalizePath(relPath)

		if entry.IsDir() {
			if normalizedPath == ".git" || normalizedPath == "node_modules" || normalizedPath == "vendor" {
				return filepath.SkipDir
			}
			if matchesAny(normalizedPath, manifest.ExcludePaths) {
				return filepath.SkipDir
			}
			return nil
		}

		if filepath.Ext(currentPath) != ".go" {
			return nil
		}
		if matchesAny(normalizedPath, manifest.ExcludePaths) || matchesAny(normalizedPath, manifest.ExcludeFilePatterns) {
			return nil
		}

		files = append(files, normalizedPath)
		return nil
	})

	if err != nil {
		return nil, err
	}

	sort.Strings(files)
	return files, nil
}

func countEffectiveLines(content []byte) int {
	fileSet := token.NewFileSet()
	file := fileSet.AddFile("source.go", fileSet.Base(), len(content))

	var scan scanner.Scanner
	scan.Init(file, content, nil, scanner.ScanComments)

	countedLines := make(map[int]struct{})
	for {
		position, tok, _ := scan.Scan()
		if tok == token.EOF {
			break
		}
		if tok == token.COMMENT || tok == token.SEMICOLON {
			continue
		}

		countedLines[fileSet.Position(position).Line] = struct{}{}
	}

	return len(countedLines)
}

func normalizePath(value string) string {
	return strings.Trim(strings.ReplaceAll(value, "\\", "/"), "/")
}

func containsGlob(value string) bool {
	return strings.ContainsAny(value, "*?[")
}

func matchesAny(filePath string, patterns []string) bool {
	for _, pattern := range patterns {
		if matchGlob(normalizePath(pattern), filePath) {
			return true
		}
	}
	return false
}

func matchGlob(pattern string, filePath string) bool {
	if pattern == "" {
		return false
	}

	matcher, err := regexp.Compile(globToRegexp(pattern))
	if err != nil {
		return false
	}

	return matcher.MatchString(filePath)
}

func globToRegexp(pattern string) string {
	builder := strings.Builder{}
	builder.WriteString("^")

	for index := 0; index < len(pattern); index++ {
		if pattern[index] == '*' {
			if index+1 < len(pattern) && pattern[index+1] == '*' {
				builder.WriteString(".*")
				index++
				continue
			}

			builder.WriteString("[^/]*")
			continue
		}

		if pattern[index] == '?' {
			builder.WriteString("[^/]")
			continue
		}

		builder.WriteString(regexp.QuoteMeta(string(pattern[index])))
	}

	builder.WriteString("$")
	return builder.String()
}

func formatViolations(violations []violation) string {
	builder := strings.Builder{}
	builder.WriteString("Go file size check failed:\n")
	for _, violation := range violations {
		builder.WriteString("- ")
		builder.WriteString(violation.Path)
		builder.WriteString(": ")
		builder.WriteString(fmt.Sprintf("%d effective lines ", violation.EffectiveLines))
		switch violation.Reason {
		case "baseline growth":
			builder.WriteString(fmt.Sprintf("(baseline growth; ceiling %d)", violation.MaxEffectiveLines))
		default:
			builder.WriteString(fmt.Sprintf("(new file over 500; limit %d)", violation.MaxEffectiveLines))
		}
		builder.WriteString("\n")
	}
	builder.WriteString("Shrink the file below 500 or update the committed baseline only for approved legacy debt.")
	return builder.String()
}

func formatWarnings(warnings []warningEntry) string {
	builder := strings.Builder{}
	builder.WriteString("Go file size warnings:\n")
	for _, warning := range warnings {
		builder.WriteString("- ")
		builder.WriteString(warning.Path)
		builder.WriteString(": ")
		builder.WriteString(fmt.Sprintf("%d effective lines (warning threshold %d; hard limit %d)", warning.EffectiveLines, warning.WarningThreshold, warning.HardLimit))
		builder.WriteString("\n")
	}
	builder.WriteString("Warnings do not fail the gate. Shrink the file before it crosses the hard limit.")
	return builder.String()
}

func writeError(writer io.Writer, context string, err error) error {
	_, _ = fmt.Fprintf(writer, "%s: %v\n", context, err)
	return err
}

func fail(context string, err error) {
	if err == nil {
		return
	}

	_, _ = fmt.Fprintf(os.Stderr, "%s: %v\n", context, err)
	os.Exit(1)
}

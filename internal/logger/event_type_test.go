package logger_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// eventTypeShape is the vocabulary rule for logger.Fields.EventType:
// a lowercase domain segment, a dot, then a lowercase verb segment.
//
// The rule is a SHAPE rather than a closed list of constants on purpose.
// internal/download emits its event types through a wrapper that takes the
// value as a parameter (service_effects.go), generating well over a dozen
// `download.*` types at its call sites; a central registry would fight that
// design for no gain. What matters for grouping is that every emitted value
// partitions into a domain and names an action within it, which is exactly
// what this shape enforces.
var eventTypeShape = regexp.MustCompile(`^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$`)

// literalEventType matches a struct-literal assignment of a quoted event type.
var literalEventType = regexp.MustCompile(`EventType:\s*"([^"]*)"`)

// downloadLogfEventType matches the fourth argument of internal/download's
// logf wrapper, which is that package's event type.
var downloadLogfEventType = regexp.MustCompile(`\.logf\([^,]+,[^,]+,[^,]+,\s*"([^"]*)"`)

// TestEmittedEventTypesFollowTheDomainVerbShape is the deterministic guard for
// the event-type vocabulary.
//
// Before this test the convention held by discipline alone across five domains,
// with nothing to stop the next call site breaking it. An event type is a
// grouping dimension: the moment one area is spelled two ways, a count grouped
// by it splits into buckets that mean nothing, and nobody finds out because
// nothing fails. This is that failure.
func TestEmittedEventTypesFollowTheDomainVerbShape(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	offenders := map[string][]string{}
	walkProductionGoFiles(t, root, func(path, contents string) {
		collectMisshapedEventTypes(root, path, contents, offenders)
	})

	if len(offenders) == 0 {
		return
	}
	report := []string{}
	for value, files := range offenders {
		report = append(report, "  "+value+"  <- "+strings.Join(files, ", "))
	}
	t.Fatalf("event types must be shaped domain.verb (e.g. anime.write, sync.reconcile); offenders:\n%s",
		strings.Join(report, "\n"))
}

// collectMisshapedEventTypes records every event type in one file that does not
// follow the domain.verb shape, keyed by value so one drifted spelling reports
// every place it appears.
func collectMisshapedEventTypes(root, path, contents string, offenders map[string][]string) {
	for _, pattern := range []*regexp.Regexp{literalEventType, downloadLogfEventType} {
		for _, match := range pattern.FindAllStringSubmatch(contents, -1) {
			value := match[1]
			if value == "" || eventTypeShape.MatchString(value) {
				continue
			}
			offenders[value] = append(offenders[value], relativeToRoot(root, path))
		}
	}
}

// relativeToRoot renders a scanned path for the failure report.
func relativeToRoot(root, path string) string {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return path
	}
	return filepath.ToSlash(relative)
}

// repositoryRoot walks up from the package directory until it finds go.mod.
func repositoryRoot(t *testing.T) string {
	t.Helper()

	directory, err := os.Getwd()
	if err != nil {
		t.Fatalf("resolve working directory: %v", err)
	}
	for {
		if _, statErr := os.Stat(filepath.Join(directory, "go.mod")); statErr == nil {
			return directory
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("could not locate the repository root (no go.mod found)")
		}
		directory = parent
	}
}

// walkProductionGoFiles visits every non-test Go file in the module, skipping
// vendored and generated trees.
func walkProductionGoFiles(t *testing.T, root string, visit func(path, contents string)) {
	t.Helper()

	skipped := map[string]bool{"node_modules": true, "frontend": true, "build": true, ".git": true, ".ignore": true}
	visited := 0
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if skipped[entry.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		contents, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		visited++
		visit(path, string(contents))
		return nil
	})
	if err != nil {
		t.Fatalf("walk repository: %v", err)
	}
	if visited == 0 {
		t.Fatal("scanned no production Go files: the guard would pass without looking")
	}
}

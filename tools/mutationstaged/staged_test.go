package main

import (
	"regexp"
	"strings"
	"testing"
)

// TestSelectMutableGoSourcesKeepsOnlyProductionGo asserts the staged-file
// filter matches the frontend guard's intent: production source only, with
// tests, tooling, and non-Go files dropped.
func TestSelectMutableGoSourcesKeepsOnlyProductionGo(t *testing.T) {
	t.Parallel()

	got := selectMutableGoSources([]string{
		"internal/observability/eventlog/sink.go",
		"internal/observability/eventlog/sink_test.go",
		"tools/checkgofmt/main.go",
		"frontend/src/app.tsx",
		"docs/mutation-testing.md",
		"app.go",
		"",
		"   ",
	})

	want := []string{"internal/observability/eventlog/sink.go", "app.go"}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected %v, got %v", want, got)
		}
	}
}

// TestSelectMutableGoSourcesNormalisesWindowsSeparators asserts Git output
// with backslashes still matches the forward-slash prefixes the filter uses.
// Without this the tooling exclusions silently stop applying on Windows.
func TestSelectMutableGoSourcesNormalisesWindowsSeparators(t *testing.T) {
	t.Parallel()

	got := selectMutableGoSources([]string{`tools\checkgofmt\main.go`, `internal\anime\writer.go`})

	if len(got) != 1 || got[0] != "internal/anime/writer.go" {
		t.Fatalf("expected backslash paths normalised and tools/ still excluded, got %v", got)
	}
}

// TestBuildIgnorePatternExcludesEverythingButStaged asserts the generated
// pattern matches every tracked file except the staged ones -- the inversion
// that scopes a run, since ooze can only exclude.
func TestBuildIgnorePatternExcludesEverythingButStaged(t *testing.T) {
	t.Parallel()

	tracked := []string{"a/one.go", "a/two.go", "b/three.go"}
	staged := []string{"a/two.go"}

	pattern := buildIgnorePattern(tracked, staged)
	matcher, err := regexp.Compile(pattern)
	if err != nil {
		t.Fatalf("generated pattern must be valid RE2, got %q: %v", pattern, err)
	}

	if matcher.MatchString("a/two.go") {
		t.Fatal("expected the staged file NOT to be ignored")
	}
	for _, ignored := range []string{"a/one.go", "b/three.go"} {
		if !matcher.MatchString(ignored) {
			t.Fatalf("expected %q to be ignored", ignored)
		}
	}
}

// TestBuildIgnorePatternAnchorsToWholePath asserts the pattern is anchored, so
// a tracked file is not ignored merely because its path is a substring of
// another. Unanchored, "a/one.go" would also match "vendor/a/one.golden".
func TestBuildIgnorePatternAnchorsToWholePath(t *testing.T) {
	t.Parallel()

	matcher := regexp.MustCompile(buildIgnorePattern([]string{"a/one.go"}, nil))

	if matcher.MatchString("vendor/a/one.golden") {
		t.Fatal("expected the ignore pattern to be anchored to the whole path")
	}
	if !matcher.MatchString("a/one.go") {
		t.Fatal("expected the exact tracked path to match")
	}
}

// TestBuildIgnorePatternEscapesRegexMetacharacters asserts path segments are
// quoted. A literal dot must not act as a wildcard, or an unrelated file could
// be excluded from mutation without anyone noticing.
func TestBuildIgnorePatternEscapesRegexMetacharacters(t *testing.T) {
	t.Parallel()

	matcher := regexp.MustCompile(buildIgnorePattern([]string{"a/one.go"}, nil))

	if matcher.MatchString("a/oneXgo") {
		t.Fatal("expected the dot to be escaped rather than matching any character")
	}
}

// TestBuildIgnorePatternReturnsEmptyWhenNothingToExclude asserts the empty
// case is signalled rather than rendered. An empty pattern matches every path,
// so emitting one would ignore the entire repository and silently mutate
// nothing while still reporting success.
func TestBuildIgnorePatternReturnsEmptyWhenNothingToExclude(t *testing.T) {
	t.Parallel()

	if got := buildIgnorePattern([]string{"a/one.go"}, []string{"a/one.go"}); got != "" {
		t.Fatalf("expected an empty signal when every tracked file is staged, got %q", got)
	}
	if regexp.MustCompile("").MatchString("anything/at/all.go") != true {
		t.Fatal("guard assumption broken: an empty pattern no longer matches everything")
	}
}

// TestPackagePatternsForDeduplicatesAndSorts asserts several staged files in
// one package collapse to a single test target.
func TestPackagePatternsForDeduplicatesAndSorts(t *testing.T) {
	t.Parallel()

	got := packagePatternsFor([]string{
		"internal/anime/writer.go",
		"internal/anime/write_service.go",
		"internal/api/handlers/sync_handler.go",
	})

	want := []string{"./internal/anime/", "./internal/api/handlers/"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

// TestPackagePatternsForHandlesRepositoryRootFiles asserts a staged file at
// the module root maps to "./" rather than "././".
func TestPackagePatternsForHandlesRepositoryRootFiles(t *testing.T) {
	t.Parallel()

	got := packagePatternsFor([]string{"app.go"})

	if len(got) != 1 || got[0] != "./" {
		t.Fatalf(`expected ["./"] for a root-level file, got %v`, got)
	}
}

// TestBuildTestCommandScopesToStagedPackages asserts the per-mutant command
// runs only the owning packages. Falling back to ./... would multiply every
// mutant by the whole module's suite.
func TestBuildTestCommandScopesToStagedPackages(t *testing.T) {
	t.Parallel()

	got := buildTestCommand([]string{"internal/anime/writer.go", "internal/anime/editor_service.go"})

	if got != "go test -short -count=1 ./internal/anime/" {
		t.Fatalf("expected a package-scoped -short test command, got %q", got)
	}
	if strings.Contains(got, "./...") {
		t.Fatal("expected the guard never to fall back to the whole module")
	}
}

// TestBuildTestCommandIsEmptyWithoutStagedFiles asserts the no-work case is
// distinguishable, so the caller exits cleanly instead of running ooze with a
// malformed command.
func TestBuildTestCommandIsEmptyWithoutStagedFiles(t *testing.T) {
	t.Parallel()

	if got := buildTestCommand(nil); got != "" {
		t.Fatalf("expected an empty command with nothing staged, got %q", got)
	}
}

// TestNormalizeTrackedPathsDoesNotFilter asserts the exclusion set spans every
// tracked Go file. Filtering it the way the staged list is filtered would omit
// tools/ and every _test.go from the ignore pattern, leaving ooze free to
// mutate them -- which is the difference between mutating one staged file and
// mutating the whole repository.
func TestNormalizeTrackedPathsDoesNotFilter(t *testing.T) {
	t.Parallel()

	got := normalizeTrackedPaths([]string{
		`tools\checkgofmt\main.go`,
		"internal/anime/writer_test.go",
		"internal/anime/writer.go",
		"",
	})

	want := []string{"tools/checkgofmt/main.go", "internal/anime/writer_test.go", "internal/anime/writer.go"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("expected every tracked path retained and normalised, got %v", got)
	}
}

// TestBuildIgnorePatternMatchesWindowsSeparators is the regression test for a
// silent scoping failure. ooze's fsrepository derives each path with
// filepath.Rel, which yields backslashes on Windows, so a forward-slash-only
// pattern matches nothing: every exclusion is dropped and the whole repository
// gets mutated while the run still looks correctly configured.
func TestBuildIgnorePatternMatchesWindowsSeparators(t *testing.T) {
	t.Parallel()

	matcher := regexp.MustCompile(buildIgnorePattern([]string{"internal/anime/writer.go"}, nil))

	if !matcher.MatchString(`internal\anime\writer.go`) {
		t.Fatal("expected the ignore pattern to match backslash-separated paths (ooze on Windows)")
	}
	if !matcher.MatchString("internal/anime/writer.go") {
		t.Fatal("expected the ignore pattern to still match forward-slash paths")
	}
}

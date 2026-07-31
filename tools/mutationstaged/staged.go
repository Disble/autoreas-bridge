// Package main scopes ooze mutation testing to the staged Go production
// files, mirroring frontend/scripts/dlinter-mutation-staged.mjs.
//
// Two differences from the TypeScript guard are inherent to ooze and cannot be
// engineered away here:
//
//   - Stryker mutates specific line ranges; ooze mutates whole files. A staged
//     one-line change therefore costs a whole-file mutation run.
//   - Stryker keeps an incremental cache; ooze has none, so nothing is reused
//     between commits.
//
// Both make this guard materially more expensive than its frontend
// counterpart. See docs/mutation-testing.md for where it belongs in the hook
// chain.
package main

import (
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"
)

// mutationExcludedPrefixes are repository areas never worth mutating: build
// tooling that ships in no binary, and the frontend tree, which holds no Go.
var mutationExcludedPrefixes = []string{"tools/", "frontend/"}

// isMutableGoSource reports whether a repository-relative path is Go
// production source eligible for mutation. Test files are excluded because
// they are the oracle, not the subject.
func isMutableGoSource(file string) bool {
	if !strings.HasSuffix(file, ".go") || strings.HasSuffix(file, "_test.go") {
		return false
	}
	for _, prefix := range mutationExcludedPrefixes {
		if strings.HasPrefix(file, prefix) {
			return false
		}
	}
	return true
}

// selectMutableGoSources filters a list of repository-relative paths down to
// the mutable Go production sources, preserving order and dropping blanks.
func selectMutableGoSources(files []string) []string {
	selected := []string{}
	for _, file := range files {
		file = strings.TrimSpace(strings.ReplaceAll(file, "\\", "/"))
		if file != "" && isMutableGoSource(file) {
			selected = append(selected, file)
		}
	}
	return selected
}

// normalizeTrackedPaths trims and slash-normalises repository paths without
// filtering them. The exclusion set must span every tracked Go file, mutable
// or not, because ooze mutates whatever the ignore pattern fails to name.
func normalizeTrackedPaths(files []string) []string {
	normalized := []string{}
	for _, file := range files {
		file = strings.TrimSpace(strings.ReplaceAll(file, "\\", "/"))
		if file != "" {
			normalized = append(normalized, file)
		}
	}
	return normalized
}

// buildIgnorePattern returns a single RE2 pattern matching every tracked Go
// file that is NOT staged, which is how a run gets scoped to the staged set.
//
// ooze's IgnoreSourceFiles is exclusion-only and Go's RE2 has no negative
// lookahead -- `^(?!...)` panics at regexp.MustCompile -- so "only these
// files" has to be expressed as "everything except these files", enumerated.
// An empty result means there is nothing to exclude, and the caller must not
// pass a pattern at all: an empty pattern matches every path and would
// silently ignore the whole repository.
func buildIgnorePattern(tracked, staged []string) string {
	stagedSet := make(map[string]struct{}, len(staged))
	for _, file := range staged {
		stagedSet[file] = struct{}{}
	}

	excluded := []string{}
	for _, file := range tracked {
		if _, isStaged := stagedSet[file]; isStaged {
			continue
		}
		// Separators become a character class matching either form. ooze's
		// fsrepository derives each path with filepath.Rel, which yields
		// backslashes on Windows, so a forward-slash-only pattern matches
		// nothing -- every exclusion silently drops and the whole repository
		// is mutated while the run still looks correctly scoped.
		excluded = append(excluded, strings.ReplaceAll(regexp.QuoteMeta(file), "/", `[/\\]`))
	}
	if len(excluded) == 0 {
		return ""
	}
	sort.Strings(excluded)
	return "^(?:" + strings.Join(excluded, "|") + ")$"
}

// packagePatternsFor maps staged files to the `./dir/` package patterns whose
// tests must run for each mutant. Scoping the test command this way is the
// difference between running one package and running the whole module for
// every mutant.
func packagePatternsFor(staged []string) []string {
	seen := map[string]struct{}{}
	patterns := []string{}
	for _, file := range staged {
		dir := path.Dir(file)
		if dir == "." {
			dir = ""
		}
		pattern := "./" + dir
		if dir != "" {
			pattern += "/"
		}
		if _, done := seen[pattern]; done {
			continue
		}
		seen[pattern] = struct{}{}
		patterns = append(patterns, pattern)
	}
	sort.Strings(patterns)
	return patterns
}

// buildTestCommand renders the command ooze runs for every mutant, scoped to
// the packages owning the staged files.
func buildTestCommand(staged []string) string {
	patterns := packagePatternsFor(staged)
	if len(patterns) == 0 {
		return ""
	}
	// -short: the guard re-runs this command once per mutant, so tests that
	// exist to wait out a real timeout are skipped. See the testing.Short()
	// guards in the queue suites for the trade that makes.
	return "go test -short -count=1 " + strings.Join(patterns, " ")
}

// describeSelection renders the one-line summary printed before a run, so the
// hook output says what is about to be mutated rather than going quiet for
// minutes.
func describeSelection(staged []string) string {
	return fmt.Sprintf("go mutation guard: %d staged production file(s), %d package(s): %s",
		len(staged), len(packagePatternsFor(staged)), strings.Join(packagePatternsFor(staged), " "))
}

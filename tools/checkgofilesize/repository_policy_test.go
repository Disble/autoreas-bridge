package main

import (
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestRepositoryHookRunsFrontendFileSizeWarningBeforeFrontendLint(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	content := readRepoFile(t, root, "lefthook.yml")

	var config lefthookConfig
	if err := yaml.Unmarshal(content, &config); err != nil {
		t.Fatalf("yaml.Unmarshal() error = %v", err)
	}

	jobs := config.PreCommit.Jobs
	warningIndex := -1
	lintIndex := -1
	for index, job := range jobs {
		if job.Name == "frontend-filesize-warning" {
			warningIndex = index
		}
		if job.Name == "frontend-lint" {
			lintIndex = index
		}
	}

	if warningIndex == -1 {
		t.Fatal("lefthook.yml is missing pre-commit job frontend-filesize-warning")
	}
	if lintIndex == -1 {
		t.Fatal("lefthook.yml is missing pre-commit job frontend-lint")
	}
	if warningIndex > lintIndex {
		t.Fatalf("frontend-filesize-warning job index = %d, want before frontend-lint index = %d", warningIndex, lintIndex)
	}
}

func TestRepositoryPolicyDocsDescribeCrossCuttingGoFileSizeRule(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	checks := []struct {
		path     string
		snippets []string
	}{
		{
			path: "AGENTS.md",
			snippets: []string{
				"Go and frontend files share a warning threshold at 400 effective lines and a hard failure ceiling above 500 effective lines",
				"Existing oversized Go files may stay only when `tools/checkgofilesize/baseline.yaml` records a no-growth ceiling",
			},
		},
		{
			path: "CLAUDE.md",
			snippets: []string{
				"Go and frontend files share the same warning-at-400 and hard-fail-above-500 effective-line policy",
				"`go run ./tools/checkgofilesize` is part of the repo-owned pre-commit gate",
			},
		},
		{
			path: filepath.Join("docs", "architecture.md"),
			snippets: []string{
				"Go and frontend source files follow a shared warning threshold at 400 effective lines and a hard ceiling above 500 effective lines",
				"`tools/checkgofilesize/baseline.yaml` carries temporary no-growth ceilings for legacy Go debt",
			},
		},
	}

	for _, check := range checks {
		check := check
		t.Run(check.path, func(t *testing.T) {
			t.Parallel()

			requireFileContainsAll(t, readRepoFile(t, root, check.path), check.path, check.snippets...)
		})
	}
}

func TestRepositoryFrontendFileSizePolicyWiresWarningAndFailurePaths(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	requireFileContainsAll(t, readRepoFile(t, root, filepath.Join("frontend", "package.json")), "frontend/package.json", []string{
		"\"filesize:warning\": \"node ./scripts/check-file-size-warnings.mjs\"",
		"\"lint\": \"eslint .\"",
	}...)

	requireFileContainsAll(t, readRepoFile(t, root, filepath.Join("frontend", "eslint.config.js")), "frontend/eslint.config.js", []string{
		"'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }]",
	}...)
}

func TestRepositoryBaselineDocumentsMaintenanceRule(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	requireFileContainsAll(t, readRepoFile(t, root, filepath.Join("tools", "checkgofilesize", "baseline.yaml")), "tools/checkgofilesize/baseline.yaml", []string{
		"Baseline maintenance rules:",
		"Shrink ceilings in the same PR when a legacy file gets smaller.",
		"Remove the entry as soon as deterministic counting reaches 500 effective lines or fewer.",
	}...)
}

func TestRepositoryVerificationEvidenceCapturesDirectInspectionAndNegativeCases(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	content := readRepoFile(t, root, filepath.Join("docs", "verification", "global-go-file-size-policy-slice-2.md"))
	requireFileContainsAll(t, content, "docs/verification/global-go-file-size-policy-slice-2.md", []string{
		"# Verification Evidence — Global Go File Size Policy Slice 2",
		"Direct inspection is mandatory.",
		"go run ./tools/checkgofilesize",
		"new file over 500",
		"baseline growth",
		"app.go",
		"internal/anime/domain/anime_raw.go",
		"internal/download/service_test.go",
		"lefthook.yml",
	}...)

	if !strings.Contains(string(content), strconv.Quote("Go file size check failed:")) {
		t.Fatalf("verification evidence missing quoted negative validator output header")
	}
}

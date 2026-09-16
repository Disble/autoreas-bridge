package main

import (
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// The frontend-filesize-warning job was removed from the gate on 2026-08-11:
// dharness runs react-doctor, whose max-file-lines rule covers the staged
// change. What must not disappear is the hard-fail path, which is ESLint's
// max-lines rule reached through the frontend-lint job. The advisory script
// survives as a manual command and is asserted separately by
// TestRepositoryFrontendFileSizePolicyWiresWarningAndFailurePaths.
func TestRepositoryHookKeepsFrontendLintAsTheFileSizeFailurePath(t *testing.T) {
	t.Parallel()

	root := repoRootFromTest(t)
	content := readRepoFile(t, root, "lefthook.yml")

	var config lefthookConfig
	if err := yaml.Unmarshal(content, &config); err != nil {
		t.Fatalf("yaml.Unmarshal() error = %v", err)
	}

	jobs := flattenJobs(config.PreCommit.Jobs)
	lintIndex := -1
	for index, job := range jobs {
		if job.Name == "frontend-lint" {
			lintIndex = index
		}
	}

	if lintIndex == -1 {
		t.Fatal("lefthook.yml is missing pre-commit job frontend-lint")
	}
}

// TestRepositoryHookRunsStagedMutationAfterFrontendTests pins the frontend
// staged-mutation gate (SDD-71): `dharness mutate --staged` replaced the
// hand-rolled `test:mutation:staged` script, which silently skipped every
// production file from a linked worktree because its `--show-toplevel`
// resolved to `frontend/` rather than the repository root.
//
// The exclusions keep the scope the retired script had, `src/` only. dharness
// treats any JS or TS file under frontend/ as source, but the mutation runner's
// suite (frontend/vitest.mutation.mts) includes only `src/**` tests and
// excludes `scripts/**`, so a staged line outside `src/` can never have a
// related test there and fails with "No tests were found". 50 of the last 266
// frontend commits touched such a file, not counting the since-untracked
// wailsjs/ bindings (measured 2026-09-13). Each config file
// is named exactly: a broad prefix such as `vite` would silently exclude a
// future source directory with that prefix.
func TestRepositoryHookRunsStagedMutationAfterFrontendTests(t *testing.T) {
	t.Parallel()

	config := loadLefthookConfig(t)
	heavyJobs := groupJobs(t, config.PreCommit.Jobs, "frontend-heavy")

	wantRun := "dharness mutate --staged" +
		" --exclude-prefix src/test/" +
		" --exclude-prefix scripts/" +
		" --exclude-prefix eslint.config.js" +
		" --exclude-prefix vite.config.ts" +
		" --exclude-prefix vite.layout.config.ts" +
		" --exclude-prefix vitest.mutation.mts" +
		" --concurrency 4"

	if _, retired := jobIndex(heavyJobs, "test:mutation:staged"); retired {
		t.Fatal("lefthook.yml frontend-heavy still declares the retired test:mutation:staged job")
	}
	mutationIndex, found := jobIndex(heavyJobs, "frontend-mutation")
	if !found {
		t.Fatal("lefthook.yml frontend-heavy is missing job frontend-mutation")
	}
	testIndex, found := jobIndex(heavyJobs, "frontend-test")
	if !found {
		t.Fatal("lefthook.yml frontend-heavy is missing job frontend-test")
	}

	mutation := heavyJobs[mutationIndex]
	if mutation.Run != wantRun {
		t.Fatalf("frontend-mutation run = %q, want %q", mutation.Run, wantRun)
	}
	if mutation.Root != "frontend" {
		t.Fatalf("frontend-mutation root = %q, want %q", mutation.Root, "frontend")
	}
	if mutationIndex < testIndex {
		t.Fatalf("frontend-mutation index = %d, want after frontend-test index = %d", mutationIndex, testIndex)
	}

	if runs := countRunsContaining(flattenJobs(config.PreCommit.Jobs), "dharness mutate"); runs != 1 {
		t.Fatalf("pre-commit declares %d job(s) running %q, want exactly 1", runs, "dharness mutate")
	}
	for _, job := range parseMergeGate(t) {
		if strings.Contains(job.Run, "dharness mutate") {
			t.Fatalf("pre-merge-commit job %q runs %q; a merge has no staged-line scope", job.Name, job.Run)
		}
	}
}

// loadLefthookConfig parses the repository's lefthook.yml.
func loadLefthookConfig(t *testing.T) lefthookConfig {
	t.Helper()

	var config lefthookConfig
	if err := yaml.Unmarshal(readRepoFile(t, repoRootFromTest(t), "lefthook.yml"), &config); err != nil {
		t.Fatalf("yaml.Unmarshal() error = %v", err)
	}
	return config
}

// groupJobs returns the jobs of the named top-level group, failing the test
// when the group is missing.
func groupJobs(t *testing.T, jobs []lefthookJob, name string) []lefthookJob {
	t.Helper()

	index, found := jobIndex(jobs, name)
	if !found || jobs[index].Group == nil {
		t.Fatalf("lefthook.yml pre-commit is missing group %s", name)
	}
	return jobs[index].Group.Jobs
}

// jobIndex reports where the named job sits in jobs.
func jobIndex(jobs []lefthookJob, name string) (int, bool) {
	for index, job := range jobs {
		if job.Name == name {
			return index, true
		}
	}
	return -1, false
}

// countRunsContaining counts the jobs whose run line contains fragment.
func countRunsContaining(jobs []lefthookJob, fragment string) int {
	count := 0
	for _, job := range jobs {
		if strings.Contains(job.Run, fragment) {
			count++
		}
	}
	return count
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

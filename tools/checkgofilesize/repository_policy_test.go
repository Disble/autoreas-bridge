package main

import (
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestRepositoryHookUsesSingleStagedQualityEntry protects the single lint owner.
// dharness loads the repository ESLint config; a separate ESLint job pays twice.
func TestRepositoryHookUsesSingleStagedQualityEntry(t *testing.T) {
	t.Parallel()
	config := loadLefthookConfig(t)
	jobs := flattenJobs(config.PreCommit.Jobs)
	if _, found := jobIndex(jobs, "frontend-lint"); found {
		t.Fatal("standalone frontend-lint duplicates dharness ESLint")
	}
	heavy := groupJobs(t, config.PreCommit.Jobs, "frontend-heavy")
	index, found := jobIndex(heavy, "frontend-quality")
	if !found || heavy[index].Run != "bun --cwd=\"frontend\" run check:staged" {
		t.Fatal("frontend-heavy must invoke the guarded staged quality entry")
	}
	if countRunsContaining(jobs, "check:staged") != 1 {
		t.Fatal("staged quality must run exactly once")
	}
	typecheck, found := jobIndex(heavy, "frontend-typecheck")
	if !found || index >= typecheck {
		t.Fatal("quality must precede typecheck in the frontend lane")
	}
	var raw map[string]any
	if err := yaml.Unmarshal(readRepoFile(t, repoRootFromTest(t), "lefthook.yml"), &raw); err != nil {
		t.Fatal(err)
	}
	if raw["extends"] != nil {
		t.Fatal("automatic hook inheritance can reintroduce a second dharness check")
	}
}

// TestRepositoryHookOffloadsMutation keeps automatic mutation outside local hooks.
func TestRepositoryHookOffloadsMutation(t *testing.T) {
	t.Parallel()
	jobs := flattenJobs(loadLefthookConfig(t).PreCommit.Jobs)
	for _, job := range jobs {
		if strings.Contains(job.Run, "mutate") || strings.Contains(job.Name, "mutation") {
			t.Fatalf("local pre-commit still runs mutation: %s", job.Name)
		}
	}
	for _, job := range parseMergeGate(t) {
		if strings.Contains(job.Run, "mutate") || strings.Contains(job.Name, "mutation") {
			t.Fatalf("local pre-merge still runs mutation: %s", job.Name)
		}
	}
}

// TestRepositoryFrontendLanesSerializeTypecheckBeforeTests keeps both hooks alike:
// the dharness coverage-tiers run is the only Vitest run, after the typecheck.
// A plain `vitest run` beside it would run the same suite twice.
func TestRepositoryFrontendLanesSerializeTypecheckBeforeTests(t *testing.T) {
	t.Parallel()
	commit := groupJobs(t, loadLefthookConfig(t).PreCommit.Jobs, "frontend-heavy")
	typecheck, ok := jobIndex(commit, "frontend-typecheck")
	tests, found := jobIndex(commit, "frontend-coverage")
	if !ok || !found || typecheck >= tests {
		t.Fatal("pre-commit must typecheck before the coverage-tiers tests")
	}
	if _, duplicate := jobIndex(commit, "frontend-test"); duplicate {
		t.Fatal("pre-commit runs the Vitest suite twice: frontend-test duplicates frontend-coverage")
	}
	var merge mergeGateConfig
	if err := yaml.Unmarshal(readRepoFile(t, repoRootFromTest(t), "lefthook.yml"), &merge); err != nil {
		t.Fatal(err)
	}
	for _, lane := range merge.PreMergeCommit.Jobs {
		if lane.Name == "frontend-heavy" && lane.Group != nil {
			if len(lane.Group.Jobs) < 2 || lane.Group.Jobs[0].Name != "frontend-typecheck" || lane.Group.Jobs[1].Name != "frontend-coverage" {
				t.Fatal("pre-merge must serialize typecheck before the coverage-tiers tests in frontend-heavy")
			}
			return
		}
	}
	t.Fatal("pre-merge frontend-heavy is missing")
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
		// Keep these fragments short: AGENTS.md and CLAUDE.md are consolidated,
		// byte-identical mirrors whose prose may be reworded. Assert the documented
		// rule and gate name rather than pinning one sentence.
		{
			path: "AGENTS.md",
			snippets: []string{
				"400 lines is the warning threshold",
				"tools/checkgofilesize",
			},
		},
		{
			path: "CLAUDE.md",
			snippets: []string{
				"400 lines is the warning threshold",
				"tools/checkgofilesize",
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

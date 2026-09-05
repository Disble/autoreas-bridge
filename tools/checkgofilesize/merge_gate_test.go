package main

import (
	"testing"

	"gopkg.in/yaml.v3"
)

// mergeGateJob is one pre-merge-commit job. It carries Glob so the whole-tree
// assertion below can see a glob that should not be there; the shared
// lefthookJob deliberately does not model globs.
type mergeGateJob struct {
	Name  string         `yaml:"name"`
	Run   string         `yaml:"run"`
	Glob  any            `yaml:"glob"`
	Group *mergeGateJobs `yaml:"group"`
}

// mergeGateJobs is a `group:` container of merge-gate jobs.
type mergeGateJobs struct {
	Jobs []mergeGateJob `yaml:"jobs"`
}

// mergeGateConfig is the pre-merge-commit slice of the repository hook config.
type mergeGateConfig struct {
	PreMergeCommit struct {
		Jobs []mergeGateJob `yaml:"jobs"`
	} `yaml:"pre-merge-commit"`
}

// flattenMergeGateJobs returns the leaf jobs in declaration order, descending
// into `group:` containers.
func flattenMergeGateJobs(jobs []mergeGateJob) []mergeGateJob {
	flat := make([]mergeGateJob, 0, len(jobs))
	for _, job := range jobs {
		if job.Group != nil {
			flat = append(flat, flattenMergeGateJobs(job.Group.Jobs)...)
			continue
		}
		flat = append(flat, job)
	}
	return flat
}

// mergeGateWholeTreeJobs are the checks a merge commit must re-run. A merge
// introduces no file changes of its own, so nothing here may be globbed or
// scoped to the staged set: the question is whether the merged TREE still
// works, not whether a diff is clean.
//
// The two pre-commit jobs missing from this list are missing on purpose.
// frontend-lint lints {staged_files} because JSDoc adoption is incremental, so
// a whole-tree run would fail every merge; test:mutation:staged measures staged
// lines, of which a merge has none.
var mergeGateWholeTreeJobs = map[string]string{
	"gofmt":                 "go run ./tools/checkgofmt",
	"go-filesize":           "go run ./tools/checkgofilesize",
	"architecture":          "go run ./tools/checkarchitecture",
	"golangci-lint":         "powershell -ExecutionPolicy Bypass -File scripts/lint.ps1 -Profile all",
	"openapi":               "go run ./tools/checkopenapi",
	"app-icons":             "go run ./tools/genicons -check",
	"sdd-gate":              "go run ./tools/checksdd",
	"frontend-typecheck":    "bun --cwd=\"frontend\" run typecheck",
	"go-vet":                "go vet -p 4 ./...",
	"go-cover":              "go test ./... -cover -p 4 -parallel 4",
	"frontend-test":         "bun --cwd=\"frontend\" run test",
	"frontend-render-smoke": "bun --cwd=\"frontend\" run render:smoke",
	"frontend-layout-smoke": "bun --cwd=\"frontend\" run layout:smoke",
}

// parseMergeGate reads the pre-merge-commit hook out of lefthook.yml.
func parseMergeGate(t *testing.T) []mergeGateJob {
	t.Helper()
	root := repoRootFromTest(t)
	content := readRepoFile(t, root, "lefthook.yml")
	var config mergeGateConfig
	if err := yaml.Unmarshal(content, &config); err != nil {
		t.Fatalf("yaml.Unmarshal() error = %v", err)
	}
	return flattenMergeGateJobs(config.PreMergeCommit.Jobs)
}

// TestRepositoryHookGuardsMergeCommits pins the pre-merge-commit gate.
//
// Git does not run pre-commit for a merge; it runs pre-merge-commit, which is a
// hook lefthook supports natively (`lefthook install` syncs it by name and
// silently ignores an unrecognised one). Until 2026-09-02 nothing was installed
// there, so every merge landed unchecked -- and a merge is precisely where two
// independently green branches can produce a broken tree. This test exists
// because that gap is invisible: the repository looks fully gated right up
// until someone merges.
func TestRepositoryHookGuardsMergeCommits(t *testing.T) {
	t.Parallel()

	jobs := parseMergeGate(t)
	if len(jobs) == 0 {
		t.Fatal("lefthook.yml declares no pre-merge-commit jobs; a merge commit runs no gate at all")
	}

	byName := make(map[string]mergeGateJob, len(jobs))
	for _, job := range jobs {
		byName[job.Name] = job
	}
	for name, want := range mergeGateWholeTreeJobs {
		job, ok := byName[name]
		if !ok {
			t.Errorf("pre-merge-commit is missing whole-tree job %q", name)
			continue
		}
		// Asserted against the literal, not against the pre-commit entry: the
		// two hooks answer different questions and are allowed to drift, so
		// reading pre-commit's value here would pin nothing.
		if job.Run != want {
			t.Errorf("pre-merge-commit job %q run = %q, want %q", name, job.Run, want)
		}
	}
}

// TestRepositoryMergeGateStaysWholeTree keeps the merge gate free of the
// staged-file scoping pre-commit relies on. A `glob:` on a merge job compares
// against the merge's own (empty) file list and silently skips, which is the
// failure this whole hook exists to prevent.
func TestRepositoryMergeGateStaysWholeTree(t *testing.T) {
	t.Parallel()

	for _, job := range parseMergeGate(t) {
		if job.Glob != nil {
			t.Errorf("pre-merge-commit job %q declares a glob; merge jobs must be whole-tree or they skip", job.Name)
		}
	}
}

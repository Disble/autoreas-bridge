package main

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func TestRepositoryHookRunsGoFileSizeBeforeGolangCILint(t *testing.T) {
	t.Parallel()
	root := repoRootFromTest(t)
	content := readRepoFile(t, root, "lefthook.yml")
	var config lefthookConfig
	if err := yaml.Unmarshal(content, &config); err != nil {
		t.Fatalf("yaml.Unmarshal() error = %v", err)
	}
	goFileSizeIndex, golangciIndex := findGoHookOrder(t, config.PreCommit.Jobs)
	assertGoHookOrder(t, config.PreCommit.Jobs, goFileSizeIndex, golangciIndex)
}

// findGoHookOrder scans lefthook jobs and returns the indices of the
// go-file-size and golangci-lint hooks, or -1 for any not found.
func findGoHookOrder(t *testing.T, jobs []lefthookJob) (int, int) {
	t.Helper()
	goFileSizeIndex := -1
	golangciIndex := -1
	for index, job := range jobs {
		if job.Name == "go-filesize" {
			goFileSizeIndex = index
			if job.Run != "go run ./tools/checkgofilesize" {
				t.Fatalf("go-filesize run = %q, want %q", job.Run, "go run ./tools/checkgofilesize")
			}
		}
		if job.Name == "frontend-filesize-warning" && job.Run != "bun --cwd=\"frontend\" run filesize:warning" {
			t.Fatalf("frontend-filesize-warning run = %q, want %q", job.Run, "bun --cwd=\"frontend\" run filesize:warning")
		}
		if job.Name == "golangci-lint" {
			golangciIndex = index
		}
	}
	return goFileSizeIndex, golangciIndex
}

// assertGoHookOrder verifies the deterministic Go hook ordering.
func assertGoHookOrder(t *testing.T, jobs []lefthookJob, goFileSizeIndex int, golangciIndex int) {
	t.Helper()
	if goFileSizeIndex == -1 {
		t.Fatal("lefthook.yml is missing pre-commit job go-filesize")
	}
	if golangciIndex == -1 {
		t.Fatal("lefthook.yml is missing pre-commit job golangci-lint")
	}
	if goFileSizeIndex > golangciIndex {
		t.Fatalf("go-filesize job index = %d, want before golangci-lint index = %d", goFileSizeIndex, golangciIndex)
	}
	if goFileSizeIndex == 0 {
		t.Fatal("go-filesize should run after gofmt in the deterministic Go gate sequence")
	}
	if jobs[goFileSizeIndex-1].Name != "gofmt" {
		t.Fatalf("job before go-filesize = %q, want gofmt", jobs[goFileSizeIndex-1].Name)
	}
}

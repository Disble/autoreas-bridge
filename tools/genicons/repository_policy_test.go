package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// globList accepts lefthook's `glob:` in either of its shapes: a bare string
// or a list of patterns.
type globList []string

// UnmarshalYAML reads either scalar or sequence form into the same slice.
func (g *globList) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind == yaml.ScalarNode {
		*g = globList{node.Value}
		return nil
	}
	var patterns []string
	if err := node.Decode(&patterns); err != nil {
		return err
	}
	*g = patterns
	return nil
}

// lefthookJob is the subset of a lefthook job this tool asserts on.
type lefthookJob struct {
	Name  string        `yaml:"name"`
	Glob  globList      `yaml:"glob"`
	Run   string        `yaml:"run"`
	Group *lefthookHook `yaml:"group"`
}

// lefthookHook is one hook stage holding jobs, possibly nested in groups.
type lefthookHook struct {
	Jobs []lefthookJob `yaml:"jobs"`
}

// lefthookConfig is the parsed repository hook configuration.
type lefthookConfig struct {
	PreCommit lefthookHook `yaml:"pre-commit"`
}

// repoRoot walks up from the test's working directory to the module root.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("resolve working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("no go.mod found above the test working directory")
		}
		dir = parent
	}
}

// flattenJobs collects every job, including those nested inside groups.
func flattenJobs(jobs []lefthookJob) []lefthookJob {
	var out []lefthookJob
	for _, job := range jobs {
		if job.Group != nil {
			out = append(out, flattenJobs(job.Group.Jobs)...)
			continue
		}
		out = append(out, job)
	}
	return out
}

func TestRepositoryHookRunsTheIconGate(t *testing.T) {
	t.Parallel()
	root := repoRoot(t)

	content, err := os.ReadFile(filepath.Join(root, "lefthook.yml"))
	if err != nil {
		t.Fatalf("read lefthook.yml: %v", err)
	}
	var config lefthookConfig
	if err := yaml.Unmarshal(content, &config); err != nil {
		t.Fatalf("parse lefthook.yml: %v", err)
	}

	var job *lefthookJob
	for _, candidate := range flattenJobs(config.PreCommit.Jobs) {
		if candidate.Name == "app-icons" {
			job = &candidate
			break
		}
	}
	if job == nil {
		t.Fatal("lefthook.yml has no app-icons job; nothing stops a generated icon drifting")
	}
	if job.Run != "go run ./tools/genicons -check" {
		t.Fatalf("app-icons run = %q, want %q", job.Run, "go run ./tools/genicons -check")
	}

	// The gate has to fire when the master changes, not only when someone edits
	// a generated file: a new master with stale icons is the drift that matters.
	wantGlobs := []string{masterPath}
	for _, target := range targets {
		wantGlobs = append(wantGlobs, target.Path)
	}
	for _, want := range wantGlobs {
		if !containsGlob(job.Glob, want) {
			t.Fatalf("app-icons glob %v does not cover %s", job.Glob, want)
		}
	}
}

// containsGlob reports whether the patterns name the given path.
func containsGlob(patterns globList, path string) bool {
	for _, pattern := range patterns {
		if pattern == path || strings.HasPrefix(path, strings.TrimSuffix(pattern, "**")) && strings.HasSuffix(pattern, "**") {
			return true
		}
	}
	return false
}

func TestRepositoryIconsMatchTheMaster(t *testing.T) {
	t.Parallel()
	root := repoRoot(t)

	var out, errOut strings.Builder
	if err := run(root, true, &out, &errOut); err != nil {
		t.Fatalf("committed icons do not match %s: %v\n%s", masterPath, err, errOut.String())
	}
}

func TestRepositoryKeepsNoSecondCopyOfTheTrayIcon(t *testing.T) {
	t.Parallel()
	root := repoRoot(t)

	// resources/tray-icon.ico was an orphan carrying pre-rebrand artwork that no
	// code referenced. Nothing should reintroduce a hand-kept copy.
	if _, err := os.Stat(filepath.Join(root, "resources", "tray-icon.ico")); err == nil {
		t.Fatal("resources/tray-icon.ico is back; the tray icon is generated into internal/tray")
	}
}

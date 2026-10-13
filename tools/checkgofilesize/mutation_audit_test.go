package main

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// auditWorkflow models only the policy fields consumed by these contract tests.
type auditWorkflow struct {
	On          map[string]any      `yaml:"on"`
	Permissions map[string]string   `yaml:"permissions"`
	Jobs        map[string]auditJob `yaml:"jobs"`
}

// auditJob carries the runner and executable steps, without unrelated metadata.
type auditJob struct {
	RunsOn string      `yaml:"runs-on"`
	Steps  []auditStep `yaml:"steps"`
}

// auditStep carries invocation, scope and failed-run artifact behavior.
type auditStep struct {
	Run  string            `yaml:"run"`
	Uses string            `yaml:"uses"`
	If   string            `yaml:"if"`
	With map[string]string `yaml:"with"`
}

// TestRepositoryMutationAuditIsPeriodicAndNonBlocking pins the deliberate CI policy.
func TestRepositoryMutationAuditIsPeriodicAndNonBlocking(t *testing.T) {
	t.Parallel()
	var workflow auditWorkflow
	content := readRepoFile(t, repoRootFromTest(t), ".github/workflows/mutation-audit.yml")
	if err := yaml.Unmarshal(content, &workflow); err != nil {
		t.Fatal(err)
	}
	assertAuditEvents(t, workflow.On)
	if workflow.Permissions["contents"] != "read" || len(workflow.Permissions) != 1 {
		t.Fatal("audit permissions must stay read-only")
	}
	job, ok := workflow.Jobs["audit"]
	if !ok || job.RunsOn != "windows-latest" {
		t.Fatal("audit must use the verified platform shape")
	}
	assertAuditSteps(t, job.Steps)
}

// assertAuditEvents requires periodic/manual execution without merge-blocking events.
func assertAuditEvents(t *testing.T, events map[string]any) {
	t.Helper()
	if _, ok := events["schedule"]; !ok {
		t.Fatal("daily schedule is missing")
	}
	if _, ok := events["workflow_dispatch"]; !ok {
		t.Fatal("manual trigger is missing")
	}
	for _, event := range []string{"pull_request", "pull_request_target", "push", "merge_group"} {
		if _, ok := events[event]; ok {
			t.Fatalf("mutation audit unexpectedly gates %s", event)
		}
	}
}

// assertAuditSteps preserves source selection, actual audit execution and failure reports.
func assertAuditSteps(t *testing.T, steps []auditStep) {
	t.Helper()
	var checkout, run, upload bool
	for _, step := range steps {
		if strings.HasPrefix(step.Uses, "actions/checkout@") {
			checkout = step.With["ref"] == "dev"
		}
		if strings.Contains(step.Run, "run test:mutation:audit") {
			run = true
		}
		if strings.HasPrefix(step.Uses, "actions/upload-artifact@") {
			upload = step.If == "always()" && step.With["if-no-files-found"] == "error"
		}
	}
	if !checkout || !run || !upload {
		t.Fatal("dev checkout, audit execution or failure artifact is missing")
	}
}

// TestRepositoryMutationCommandsKeepStagedValidation pins local access independently of hooks.
func TestRepositoryMutationCommandsKeepStagedValidation(t *testing.T) {
	t.Parallel()
	content := readRepoFile(t, repoRootFromTest(t), "frontend/package.json")
	requireFileContainsAll(t, content, "frontend/package.json",
		"\"test:mutation:staged\": \"dharness mutate --staged",
		"--exclude-prefix scripts/",
		"\"test:mutation:audit\": \"stryker run stryker.audit.config.mjs --concurrency 2\"")
}

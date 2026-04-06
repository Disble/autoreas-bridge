package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var incompleteTaskPattern = regexp.MustCompile(`(?m)^\s*- \[ \]`)
var verdictPattern = regexp.MustCompile(`(?ms)^### Verdict\s*\r?\n\s*([A-Z ]+)`)

func main() {
	root, err := os.Getwd()
	if err != nil {
		fail("resolve working directory", err)
	}

	changeName, err := detectActiveChange(root)
	if err != nil {
		fail("detect active SDD change", err)
	}

	if changeName == "" {
		fmt.Println("No active SDD change detected; skipping SDD gate.")
		return
	}

	if err := validateChange(root, changeName); err != nil {
		fail("validate active SDD change", err)
	}

	fmt.Printf("SDD gate passed for %s.\n", changeName)
}

func detectActiveChange(root string) (string, error) {
	markerPath := filepath.Join(root, ".atl", "active-sdd-change")
	if content, err := os.ReadFile(markerPath); err == nil {
		marked := strings.TrimSpace(string(content))
		if marked != "" {
			return marked, nil
		}
	}

	changesRoot := filepath.Join(root, "openspec", "changes")
	entries, err := os.ReadDir(changesRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}

	active := make([]string, 0)
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == "archive" {
			continue
		}
		active = append(active, entry.Name())
	}

	switch len(active) {
	case 0:
		return "", nil
	case 1:
		return active[0], nil
	default:
		return "", fmt.Errorf("multiple active SDD changes detected (%s); set .atl/active-sdd-change", strings.Join(active, ", "))
	}
}

func validateChange(root string, changeName string) error {
	changeRoot := filepath.Join(root, "openspec", "changes", changeName)
	required := []string{
		filepath.Join(changeRoot, "proposal.md"),
		filepath.Join(changeRoot, "design.md"),
		filepath.Join(changeRoot, "tasks.md"),
		filepath.Join(changeRoot, "verify-report.md"),
	}

	for _, path := range required {
		if _, err := os.Stat(path); err != nil {
			return fmt.Errorf("missing required SDD artifact: %s", path)
		}
	}

	specsRoot := filepath.Join(changeRoot, "specs")
	var specCount int
	err := filepath.Walk(specsRoot, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !info.IsDir() && info.Name() == "spec.md" {
			specCount++
		}
		return nil
	})
	if err != nil {
		return err
	}
	if specCount == 0 {
		return fmt.Errorf("no spec.md files found for active change %q", changeName)
	}

	tasksContent, err := os.ReadFile(filepath.Join(changeRoot, "tasks.md"))
	if err != nil {
		return err
	}
	if incompleteTaskPattern.Match(tasksContent) {
		return fmt.Errorf("active change %q still has incomplete tasks in tasks.md", changeName)
	}

	verifyContent, err := os.ReadFile(filepath.Join(changeRoot, "verify-report.md"))
	if err != nil {
		return err
	}

	match := verdictPattern.FindSubmatch(verifyContent)
	if len(match) < 2 {
		return fmt.Errorf("unable to determine verification verdict for active change %q", changeName)
	}

	verdict := strings.TrimSpace(string(match[1]))
	if verdict != "PASS" && verdict != "PASS WITH WARNINGS" {
		return fmt.Errorf("active change %q is not verified; current verdict: %s", changeName, verdict)
	}

	return nil
}

func fail(context string, err error) {
	if err == nil {
		return
	}

	fmt.Fprintf(os.Stderr, "%s: %v\n", context, err)
	os.Exit(1)
}

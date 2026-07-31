package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Environment contract shared with internal/testsupport/mutation. Passing
// configuration by environment rather than generating a test file keeps the
// harness a normal, reviewable, compiled part of the tree instead of something
// this tool writes and deletes around every commit.
const (
	envIgnorePattern = "AUTOREAS_MUTATION_IGNORE"
	envTestCommand   = "AUTOREAS_MUTATION_TEST_CMD"
	envThreshold     = "AUTOREAS_MUTATION_THRESHOLD"
	envRepositoryDir = "AUTOREAS_MUTATION_ROOT"
)

// defaultThreshold matches frontend/stryker.dlinter.json's break: 80, so both
// sides of the repo hold staged code to the same bar.
const defaultThreshold = "0.80"

// harnessPackage is the tagged ooze entry point this tool drives.
const harnessPackage = "./internal/testsupport/mutation/"

// harnessTimeout bounds a run so a hook fails loudly instead of hanging a
// developer's terminal. ooze offers no per-mutant timeout of its own.
const harnessTimeout = "10m"

func main() {
	dry := flag.Bool("dry", false, "print the computed mutation scope and exit without running ooze")
	flag.Parse()
	if err := run(*dry); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// run resolves the staged Go production files, scopes ooze to exactly those,
// and gates the result on the configured threshold. With dry set it prints the
// computed scope and stops, which is the fast way to check what a run would
// cover without paying for one.
func run(dry bool) error {
	root, err := git("rev-parse", "--show-toplevel")
	if err != nil {
		return fmt.Errorf("resolve repository root: %w", err)
	}

	stagedOutput, err := git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
	if err != nil {
		return fmt.Errorf("list staged files: %w", err)
	}
	staged := selectMutableGoSources(strings.Split(stagedOutput, "\n"))
	if len(staged) == 0 {
		fmt.Println("go mutation guard: no staged production Go files.")
		return nil
	}

	if err := rejectPartiallyStaged(staged); err != nil {
		return err
	}

	trackedOutput, err := git("ls-files", "*.go")
	if err != nil {
		return fmt.Errorf("list tracked Go files: %w", err)
	}
	// Every tracked .go file, NOT just the mutable ones: the ignore list is an
	// exclusion set, so anything missing from it stays mutable. Filtering this
	// list the way the staged list is filtered would silently hand ooze the
	// whole of tools/ and every _test.go in the repository.
	tracked := normalizeTrackedPaths(strings.Split(trackedOutput, "\n"))

	fmt.Println(describeSelection(staged))

	ignorePattern := buildIgnorePattern(tracked, staged)
	testCommand := buildTestCommand(staged)
	if dry {
		fmt.Printf("  mutable files : %s\n", strings.Join(staged, " "))
		fmt.Printf("  test command  : %s\n", testCommand)
		fmt.Printf("  excluded files: %d (ignore pattern %d bytes)\n",
			len(tracked)-len(staged), len(ignorePattern))
		return nil
	}

	sandbox, cleanup, err := materializeIndex(root)
	if err != nil {
		return err
	}
	defer cleanup()

	// The harness compiles and runs from the real repository -- it is
	// untracked while under development and would be missing from a sandbox
	// built out of the index -- but ooze is pointed at the sandbox, so every
	// mutation and test run happens against the staged content.
	return runOoze(root, sandbox, ignorePattern, testCommand)
}

// rejectPartiallyStaged refuses a file that has unstaged changes on top of its
// staged ones. Mutation would then be judged against a tree state that is not
// what gets committed, so the result would be meaningless either way it went.
// The frontend guard makes the same refusal.
func rejectPartiallyStaged(staged []string) error {
	for _, file := range staged {
		cmd := exec.Command("git", "diff", "--quiet", "--", file)
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("go mutation guard: partial staging is unsupported for %s; stage or revert its remaining changes", file)
		}
	}
	return nil
}

// runOoze invokes the tagged harness with the computed scope. An empty ignore
// pattern is passed through as empty and the harness treats it as "exclude
// nothing" -- it must never be turned into a regexp, since an empty pattern
// matches every path and would silently mutate nothing.
func runOoze(root, sandbox, ignorePattern, testCommand string) error {
	threshold := os.Getenv(envThreshold)
	if threshold == "" {
		threshold = defaultThreshold
	}

	cmd := exec.Command("go", "test", "-tags=mutation", "-count=1", "-timeout="+harnessTimeout, harnessPackage)
	cmd.Dir = root
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(),
		envIgnorePattern+"="+ignorePattern,
		envTestCommand+"="+testCommand,
		envThreshold+"="+threshold,
		envRepositoryDir+"="+sandbox,
	)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("go mutation guard: staged mutation score below %s (or the run failed)", threshold)
	}
	return nil
}

// git runs a read-only Git command and returns its trimmed stdout.
func git(args ...string) (string, error) {
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

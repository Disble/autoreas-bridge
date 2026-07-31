//go:build mutation

// Package mutation is the ooze entry point for staged Go mutation testing.
//
// It is deliberately a normal, compiled, reviewable file rather than something
// tools/mutationstaged generates and deletes around every commit: a harness
// that only exists mid-hook cannot be read, linted, or reasoned about when it
// misbehaves. Its scope arrives by environment variable instead.
//
// The `mutation` build tag keeps it out of every ordinary `go test ./...`
// run, so the normal suite never pays for it.
package mutation

import (
	"os"
	"strconv"
	"testing"

	"github.com/gtramontina/ooze"
)

// Environment contract shared with tools/mutationstaged.
const (
	envIgnorePattern = "AUTOREAS_MUTATION_IGNORE"
	envTestCommand   = "AUTOREAS_MUTATION_TEST_CMD"
	envThreshold     = "AUTOREAS_MUTATION_THRESHOLD"
	envRepositoryDir = "AUTOREAS_MUTATION_ROOT"
	envParallel      = "AUTOREAS_MUTATION_PARALLEL"
)

// TestStagedMutation mutates exactly the files tools/mutationstaged selected
// and fails when the surviving-mutant ratio breaches the threshold.
//
// Run it through `go run ./tools/mutationstaged`, not directly: invoked bare
// it has no scope, and the guard below stops rather than mutating the whole
// module by accident.
func TestStagedMutation(t *testing.T) {
	testCommand := os.Getenv(envTestCommand)
	if testCommand == "" {
		t.Skip("no mutation scope in the environment; run via `go run ./tools/mutationstaged`")
	}

	root := os.Getenv(envRepositoryDir)
	if root == "" {
		root = "../../.."
	}

	options := []ooze.Option{
		ooze.WithRepositoryRoot(root),
		ooze.WithTestCommand(testCommand),
		ooze.WithMinimumThreshold(thresholdFromEnv(t)),
	}

	// ooze.Parallel() is OFF by default because it deadlocks here: its
	// laboratory calls t.Parallel() on every mutant subtest, and a 30-minute
	// run ended with goroutines still blocked in testing.(*T).Parallel after
	// 29 minutes. Opt in only when investigating whether a newer ooze fixed
	// it, and always with an explicit -parallel N.
	if os.Getenv(envParallel) == "true" {
		options = append(options, ooze.Parallel())
	}

	// An empty pattern is NOT passed to ooze: regexp treats it as matching
	// every path, which would ignore the whole repository and report a clean
	// run having mutated nothing.
	if ignore := os.Getenv(envIgnorePattern); ignore != "" {
		options = append(options, ooze.IgnoreSourceFiles(ignore))
	}

	ooze.Release(t, options...)
}

// thresholdFromEnv parses the configured minimum score, failing loudly on a
// malformed value rather than silently substituting a weaker gate.
func thresholdFromEnv(t *testing.T) float32 {
	raw := os.Getenv(envThreshold)
	if raw == "" {
		t.Fatalf("%s must be set by tools/mutationstaged", envThreshold)
	}
	parsed, err := strconv.ParseFloat(raw, 32)
	if err != nil {
		t.Fatalf("%s=%q is not a number; refusing to guess a threshold: %v", envThreshold, raw, err)
	}
	return float32(parsed)
}

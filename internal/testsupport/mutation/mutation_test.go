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
	"github.com/gtramontina/ooze/viruses"
	"github.com/gtramontina/ooze/viruses/arithmetic"
	"github.com/gtramontina/ooze/viruses/arithmeticassignment"
	"github.com/gtramontina/ooze/viruses/arithmeticassignmentinvert"
	"github.com/gtramontina/ooze/viruses/bitwise"
	"github.com/gtramontina/ooze/viruses/comparison"
	"github.com/gtramontina/ooze/viruses/comparisoninvert"
	"github.com/gtramontina/ooze/viruses/comparisonreplace"
	"github.com/gtramontina/ooze/viruses/floatdecrement"
	"github.com/gtramontina/ooze/viruses/floatincrement"
	"github.com/gtramontina/ooze/viruses/integerdecrement"
	"github.com/gtramontina/ooze/viruses/integerincrement"
	"github.com/gtramontina/ooze/viruses/loopbreak"
	"github.com/gtramontina/ooze/viruses/loopcondition"
	"github.com/gtramontina/ooze/viruses/rangebreak"
)

// Environment contract shared with tools/mutationstaged.
const (
	envIgnorePattern = "AUTOREAS_MUTATION_IGNORE"
	envTestCommand   = "AUTOREAS_MUTATION_TEST_CMD"
	envThreshold     = "AUTOREAS_MUTATION_THRESHOLD"
	envRepositoryDir = "AUTOREAS_MUTATION_ROOT"
	envParallel      = "AUTOREAS_MUTATION_PARALLEL"
	envScope         = "AUTOREAS_MUTATION_SCOPE"
)

// defaultViruses mirrors ooze's own default set. It has to be restated here
// because ooze exposes the list only as an unexported default: WithViruses
// REPLACES the set rather than decorating it, so wrapping the defaults means
// naming them. A virus added upstream will not appear until this list grows,
// which is the price of the line filter -- and cheaper than the whole-file runs
// it replaces.
func defaultViruses() []viruses.Virus {
	return []viruses.Virus{
		arithmetic.New(),
		arithmeticassignment.New(),
		arithmeticassignmentinvert.New(),
		bitwise.New(),
		comparison.New(),
		comparisoninvert.New(),
		comparisonreplace.New(),
		floatdecrement.New(),
		floatincrement.New(),
		integerdecrement.New(),
		integerincrement.New(),
		loopbreak.New(),
		loopcondition.New(),
		rangebreak.New(),
	}
}

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

	ranges, err := ParseOffsetRanges(os.Getenv(envScope))
	if err != nil {
		t.Fatalf("%s is malformed; refusing to guess a scope: %v", envScope, err)
	}
	counter := &ScopeCounter{}
	if len(ranges) > 0 {
		scoped := ScopeAll(defaultViruses(), ranges, counter)
		options = append(options, ooze.WithViruses(scoped[0], scoped[1:]...))
	}

	ooze.Release(t, options...)

	// A filter that kept nothing produces a spotless report over an empty run,
	// which reads exactly like success. The byte offsets rest on ooze parsing
	// each file with a fresh single-file FileSet; if that ever changes, this is
	// the assertion that says so instead of quietly passing.
	if len(ranges) > 0 {
		t.Logf("line scope: %d nodes mutated, %d skipped as unchanged", counter.Kept(), counter.Dropped())
		if counter.Kept() == 0 {
			t.Fatalf("line scope kept 0 of %d nodes: the staged byte ranges matched nothing, so this run proved nothing", counter.Dropped())
		}
	}
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

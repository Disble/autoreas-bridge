package main

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// TestExitCodeForBelowThresholdFails pins the whole point of the check: a
// measurable ratio under the bar must fail the process, or the number is a
// dashboard decoration nobody acts on.
func TestExitCodeForBelowThresholdFails(t *testing.T) {
	got := exitCodeFor(Coverage{CommittedWrites: 32, Covered: 0}, 0.8)
	if got != 1 {
		t.Fatalf("expected exit %d for coverage below threshold, got %d", 1, got)
	}
}

// TestExitCodeForAtThresholdPasses proves the bar is inclusive: exactly meeting
// the threshold is meeting it.
func TestExitCodeForAtThresholdPasses(t *testing.T) {
	got := exitCodeFor(Coverage{CommittedWrites: 10, Covered: 8}, 0.8)
	if got != 0 {
		t.Fatalf("expected exit %d for coverage at threshold, got %d", 0, got)
	}
}

// TestExitCodeForAboveThresholdPasses covers the ordinary healthy run.
func TestExitCodeForAboveThresholdPasses(t *testing.T) {
	got := exitCodeFor(Coverage{CommittedWrites: 10, Covered: 10}, 0.8)
	if got != 0 {
		t.Fatalf("expected exit %d for full coverage, got %d", 0, got)
	}
}

// TestExitCodeForUnmeasurableRunPasses is the inverse of the trap this family
// of checks exists to avoid. Nothing written means nothing to cover, and
// failing there would report a broken write path on a fresh install.
func TestExitCodeForUnmeasurableRunPasses(t *testing.T) {
	got := exitCodeFor(Coverage{}, 0.8)
	if got != 0 {
		t.Fatalf("expected exit %d when there is nothing to measure, got %d", 0, got)
	}
}

// TestReportNamesTheCountsBehindTheRatio proves the output carries its
// denominator. A ratio printed alone invites exactly the mistake this tool
// exists to prevent: reading a number without knowing what it measured.
func TestReportNamesTheCountsBehindTheRatio(t *testing.T) {
	out := &strings.Builder{}
	report(out, Coverage{CommittedWrites: 32, Covered: 8})

	rendered := out.String()
	for _, want := range []string{"0.25", "8", "32", "anime.write"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("expected the report to contain %q, got %q", want, rendered)
		}
	}
}

// TestReportSaysNothingToCoverRatherThanZero keeps an empty database from
// reading as a total failure.
func TestReportSaysNothingToCoverRatherThanZero(t *testing.T) {
	out := &strings.Builder{}
	report(out, Coverage{})

	rendered := out.String()
	if !strings.Contains(rendered, "nothing to cover") {
		t.Fatalf("expected an empty run to say so, got %q", rendered)
	}
	if strings.Contains(rendered, "0.00") {
		t.Fatalf("expected no ratio for an unmeasurable run, got %q", rendered)
	}
}

// TestResolveDBPathRequiresADatabase proves the tool refuses to guess.
func TestResolveDBPathRequiresADatabase(t *testing.T) {
	if _, err := run(""); err == nil {
		t.Fatal("expected an error when no database is named, got nil")
	}
}

// TestExitCodeContract pins the three exit codes as literals. They are the
// tool's interface to whoever runs it: 1 means it ran and the write path is
// under-observed, 2 means it could not run at all, and collapsing the two would
// make a broken database indistinguishable from a broken write path.
func TestExitCodeContract(t *testing.T) {
	if exitOK != 0 {
		t.Errorf("expected exitOK to be %d, got %d", 0, exitOK)
	}
	if exitBelowThreshold != 1 {
		t.Errorf("expected exitBelowThreshold to be %d, got %d", 1, exitBelowThreshold)
	}
	if exitFailedToRun != 2 {
		t.Errorf("expected exitFailedToRun to be %d, got %d", 2, exitFailedToRun)
	}
}

// TestRunMeasuresARealDatabase exercises the whole read path against a real
// SQLite file: both queries, both scan loops, and the composition into a ratio.
func TestRunMeasuresARealDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open temp database: %v", err)
	}
	defer func() { _ = db.Close() }()

	for _, ddl := range []string{
		`CREATE TABLE anime_write_operations (anime_id TEXT NOT NULL, status TEXT NOT NULL)`,
		`CREATE TABLE runtime_events (entity_id TEXT, event_type TEXT)`,
		`INSERT INTO anime_write_operations VALUES ('anime-1','committed'), ('anime-2','committed'), ('anime-3','staged')`,
		`INSERT INTO runtime_events VALUES ('anime-1','anime.write'), ('tracer-bullet-anime','tracer.step'), (NULL,'bus.publish')`,
	} {
		if _, err := db.Exec(ddl); err != nil {
			t.Fatalf("seed temp database (%s): %v", ddl, err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close before reading: %v", err)
	}

	coverage, err := run(path)
	if err != nil {
		t.Fatalf("run against the seeded database: %v", err)
	}
	// anime-3 is staged, not committed, so it is not a write path to cover.
	if coverage.CommittedWrites != 2 {
		t.Fatalf("expected 2 committed writes, got %d", coverage.CommittedWrites)
	}
	if coverage.Covered != 1 {
		t.Fatalf("expected 1 covered write, got %d", coverage.Covered)
	}
	if got := coverage.Ratio(); got != 0.5 {
		t.Fatalf("expected ratio %v, got %v", 0.5, got)
	}
}

// TestRunRejectsAMissingDatabase proves an unreadable database surfaces as an
// error rather than as a clean zero-coverage report.
func TestRunRejectsAMissingDatabase(t *testing.T) {
	if _, err := run(filepath.Join(t.TempDir(), "absent.db")); err == nil {
		t.Fatal("expected an error for a database that does not exist, got nil")
	}
}

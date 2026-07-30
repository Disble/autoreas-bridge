package eventlog

import (
	"strings"
	"testing"
)

// TestEventFiltersWhereClauseComposesConjunction asserts every populated
// filter field composes with the others via AND.
func TestEventFiltersWhereClauseComposesConjunction(t *testing.T) {
	t.Parallel()

	startMS := int64(100)
	endMS := int64(200)
	filters := EventFilters{
		Domain:        "sync",
		Level:         "error",
		EventType:     "reconcile",
		CorrelationID: "corr-1",
		EntityID:      "anime-1",
		StartMS:       &startMS,
		EndMS:         &endMS,
	}

	clause, args := filters.whereClause()
	if clause == "" {
		t.Fatal("expected a non-empty clause for a fully-populated filter set")
	}
	wantClauses := []string{"domain = ?", "level = ?", "event_type = ?", "correlation_id = ?", "entity_id = ?", "occurred_at_ms >= ?", "occurred_at_ms <= ?"}
	for _, want := range wantClauses {
		if !strings.Contains(clause, want) {
			t.Fatalf("expected clause to contain %q, got %q", want, clause)
		}
	}
	wantArgs := []any{"sync", "error", "reconcile", "corr-1", "anime-1", startMS, endMS}
	if len(args) != len(wantArgs) {
		t.Fatalf("expected %d bound args, got %d: %#v", len(wantArgs), len(args), args)
	}
}

// TestEventFiltersZeroValueReturnsEmptyClause asserts a zero-value filter set
// yields an empty clause and nil args, matching SearchFilters.whereClause.
func TestEventFiltersZeroValueReturnsEmptyClause(t *testing.T) {
	t.Parallel()

	clause, args := EventFilters{}.whereClause()
	if clause != "" {
		t.Fatalf("expected empty clause, got %q", clause)
	}
	if args != nil {
		t.Fatalf("expected nil args, got %#v", args)
	}
}

// TestEventFiltersTextExpandsToMessageDomainEventType asserts Text expands to
// a parenthesized OR clause over message, domain, and event_type, each bound
// with a %value% wildcard.
func TestEventFiltersTextExpandsToMessageDomainEventType(t *testing.T) {
	t.Parallel()

	clause, args := EventFilters{Text: "reconcile"}.whereClause()
	want := "(message LIKE ? OR domain LIKE ? OR event_type LIKE ?)"
	if clause != want {
		t.Fatalf("expected clause %q, got %q", want, clause)
	}
	if len(args) != 3 {
		t.Fatalf("expected 3 bound args, got %d: %#v", len(args), args)
	}
	for _, arg := range args {
		if arg != "%reconcile%" {
			t.Fatalf("expected every bound arg to be %%value%%, got %#v", args)
		}
	}
}

package requestcapture

import (
	"context"
	"testing"
)

// TestSearchFiltersTextWhereClausePinsEscape pins the literal LIKE clause text
// and the bound pattern for the three text filters, so the explicit
// ESCAPE '\\' SQLite needs cannot disappear while the package stays green:
// without it the backslashes sqltext.Contains inserts compare literally and a
// search containing % or _ silently stops matching. The expected values are
// pinned as literals on purpose, not computed with sqltext.Contains, so the
// test disagrees with whatever the helper does instead of mirroring it.
func TestSearchFiltersTextWhereClausePinsEscape(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		filters     SearchFilters
		wantClause  string
		wantPattern string
	}{
		{
			name:        "route wraps the value and pins the escape clause",
			filters:     SearchFilters{Route: "reconcile"},
			wantClause:  "route LIKE ? ESCAPE '\\'",
			wantPattern: "%reconcile%",
		},
		{
			name:        "outcome escapes the underscore in the bound pattern",
			filters:     SearchFilters{Outcome: "a_b"},
			wantClause:  "outcome LIKE ? ESCAPE '\\'",
			wantPattern: "%a\\_b%",
		},
		{
			name:        "kind escapes the percent in the bound pattern",
			filters:     SearchFilters{Kind: "50%"},
			wantClause:  "kind LIKE ? ESCAPE '\\'",
			wantPattern: "%50\\%%",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			clause, args := testCase.filters.whereClause()
			if clause != testCase.wantClause {
				t.Fatalf("expected clause %q, got %q", testCase.wantClause, clause)
			}
			if len(args) != 1 {
				t.Fatalf("expected 1 bound arg, got %d: %#v", len(args), args)
			}
			if args[0] != testCase.wantPattern {
				t.Fatalf("expected bound pattern %q, got %#v", testCase.wantPattern, args[0])
			}
		})
	}
}

// TestSearchTextFiltersMatchCaseInsensitiveSubstrings pins the shared sqltext
// substring rule for the text filters SearchFilters carries for both adapters
// (the desktop binding and the MCP search_requests tool): a partial fragment,
// a middle fragment, and a differently-cased fragment all match, while an
// empty filter set adds no predicate at all and a literal % matches nothing
// rather than acting as a match-everything wildcard.
func TestSearchTextFiltersMatchCaseInsensitiveSubstrings(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		filters   SearchFilters
		wantCount int
	}{
		{name: "a partial route fragment matches", filters: SearchFilters{Route: "reconcile"}, wantCount: 2},
		{name: "a middle route fragment matches", filters: SearchFilters{Route: "sync"}, wantCount: 2},
		{name: "a differently-cased route fragment matches", filters: SearchFilters{Route: "RECONCILE"}, wantCount: 2},
		{name: "a partial outcome fragment matches", filters: SearchFilters{Outcome: "ccept"}, wantCount: 1},
		{name: "a partial kind fragment matches", filters: SearchFilters{Kind: "econ"}, wantCount: 2},
		{name: "an empty filter set adds no predicate", filters: SearchFilters{}, wantCount: 3},
		{name: "a literal percent matches nothing rather than everything", filters: SearchFilters{Route: "%"}, wantCount: 0},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			db := openCaptureTestDB(t)
			store := NewStore(db, StoreConfig{})
			seedSearchFixtures(t, store)

			reader := NewReader(db)
			page, err := reader.Search(context.Background(), SearchParams{Filters: testCase.filters})
			if err != nil {
				t.Fatalf("search: %v", err)
			}
			if len(page.Items) != testCase.wantCount {
				t.Fatalf("expected %d matches for filters %#v, got %d: %#v", testCase.wantCount, testCase.filters, len(page.Items), page.Items)
			}
		})
	}
}

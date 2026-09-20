// Package sqltext holds the one shared rule for building safe SQL literal
// patterns for SQLite's LIKE operator, so every text filter in the
// observability readers escapes metacharacters the same way instead of each
// package keeping a private copy.
//
// The substring rule scans by design: a LIKE '%value%' predicate cannot use
// a B-tree index, and the decision not to add an FTS5 shadow table or a
// Go-side index was taken on measurement, not preference. The measured
// record (EXPLAIN QUERY PLAN shows SCAN, not an index search):
//
//   - An unindexed scan of request_captures over 3 043 rows costs 0.13 to
//     1.70 ms for a substring predicate.
//   - Both scanned tables are bounded by retention caps (5 000 captures,
//     20 000 runtime events, wired with defaults in
//     internal/desktop/app_defaults.go), so the worst case stays in the
//     low tens of milliseconds.
//
// The measured alternatives were rejected:
//
//   - An FTS5 trigram shadow table adds write amplification per capture,
//     plus a rebuild obligation and the desync class the name_key
//     generated-column incident already produced.
//   - A Go-side index goes stale across processes against the read-only
//     sidecar.
//
// The trigger that reopens this decision: a retention cap raised by an
// order of magnitude, or a substring predicate asked over a table with no
// bound at all. Re-measure before deciding.
package sqltext

import "strings"

// Contains returns the parameterized-LIKE pattern that matches raw as a
// literal substring: the input wrapped in % wildcards with %, _ and the
// backslash itself escaped, so a user-typed "%" or "_" never acts as a
// wildcard.
//
// Every caller MUST pair the returned value with
//
//	column LIKE ? ESCAPE '\'
//
// because SQLite's LIKE has no escape character by default: without the
// explicit ESCAPE clause the backslashes introduced here would compare
// literally and the escaping would not work.
func Contains(raw string) string {
	replacer := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`)
	return "%" + replacer.Replace(raw) + "%"
}

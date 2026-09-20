// Package sqltext holds the one shared rule for building safe SQL literal
// patterns for SQLite's LIKE operator, so every text filter in the
// observability readers escapes metacharacters the same way instead of each
// package keeping a private copy.
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

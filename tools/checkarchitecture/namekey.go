package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// animeSnapshotWritePattern matches a SQL statement that writes rows of
// anime_snapshots: an INSERT (any conflict clause) or an UPDATE.
var animeSnapshotWritePattern = regexp.MustCompile(`(?is)\b(insert(\s+or\s+\w+)?\s+into|replace\s+into|update)\s+anime_snapshots\b`)

// nameKeyWriterViolations reports every production SQL string literal that
// writes anime_snapshots.snapshot_json without also writing name_key. The key
// is plain data the writer computes with internal/sync animeNameKey; a writer
// that forgets it stores a NULL key, which the unique index silently accepts.
//
// It inspects string literals of the parsed file, so comments never match, and
// each literal on its own: a statement assembled from several literals is not
// recognised. Test files are out of scope, because a test seeds old shapes on
// purpose.
func nameKeyWriterViolations(path, text string) []string {
	if !isNameKeyWriterScope(path) {
		return nil
	}
	file, err := parser.ParseFile(token.NewFileSet(), path, text, parser.SkipObjectResolution)
	if err != nil {
		return []string{fmt.Sprintf("%s cannot be parsed to check anime_snapshots writers: %v", path, err)}
	}
	var violations []string
	ast.Inspect(file, func(node ast.Node) bool {
		literal, ok := node.(*ast.BasicLit)
		if !ok || literal.Kind != token.STRING {
			return true
		}
		if value, err := strconv.Unquote(literal.Value); err == nil && writesSnapshotWithoutNameKey(value) {
			violations = append(violations, fmt.Sprintf(
				"%s writes anime_snapshots.snapshot_json without name_key; set it from animeNameKey", path))
		}
		return true
	})
	return violations
}

// writesSnapshotWithoutNameKey reports whether one SQL text writes
// anime_snapshots with snapshot_json but never names name_key.
func writesSnapshotWithoutNameKey(sql string) bool {
	return animeSnapshotWritePattern.MatchString(sql) &&
		strings.Contains(sql, "snapshot_json") &&
		!strings.Contains(sql, "name_key")
}

// isNameKeyWriterScope reports whether path is production Go source the rule
// scans: not a test, not a fixture, not under a dot directory (the gitignored
// .ignore/ scratch area holds throwaway programs, not shipped code), and not
// this checker, which spells the statements it rejects.
func isNameKeyWriterScope(path string) bool {
	slashed := "/" + filepath.ToSlash(path)
	return filepath.Ext(path) == ".go" &&
		!strings.HasSuffix(path, "_test.go") &&
		!strings.Contains(slashed, "/testdata/") &&
		!strings.Contains(slashed, "/.") &&
		!strings.Contains(slashed, "/tools/checkarchitecture/")
}

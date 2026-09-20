package sqltext

import (
	"database/sql"
	"slices"
	"testing"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// TestContainsReturnsEscapedLiteralPattern pins the exact pattern shape: the
// raw input wrapped in % wildcards with %, _ and the backslash itself escaped,
// so the value only ever pairs with LIKE ? ESCAPE '\'.
func TestContainsReturnsEscapedLiteralPattern(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  string
		want string
	}{
		{name: "an empty raw yields a bare wildcard wrapper", raw: "", want: "%%"},
		{name: "plain text is only wrapped", raw: "plain", want: "%plain%"},
		{name: "a percent is escaped", raw: "100%", want: `%100\%%`},
		{name: "an underscore is escaped", raw: "a_b", want: `%a\_b%`},
		{name: "a backslash is doubled", raw: `a\b`, want: `%a\\b%`},
		{name: "mixed metacharacters all escape", raw: `%_%`, want: `%\%\_\%%`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := Contains(testCase.raw); got != testCase.want {
				t.Fatalf("Contains(%q) = %q, want %q", testCase.raw, got, testCase.want)
			}
		})
	}
}

// TestContainsAgainstRealSqliteEngine proves the escaping is real and not
// just string shaping: against the modernc.org/sqlite engine the repo pins,
// WHERE note LIKE ? ESCAPE '\' with Contains("100%") matches ONLY the row
// containing a literal percent sign, while the unescaped equivalent pattern
// would have matched the plain-number row too.
func TestContainsAgainstRealSqliteEngine(t *testing.T) {
	t.Parallel()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	defer func() { _ = db.Close() }()
	if _, err := db.Exec(`CREATE TABLE notes (id INTEGER PRIMARY KEY, note TEXT NOT NULL)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	notes := map[string]string{
		"1": "the total is 100% today",
		"2": "the total is 1000 today",
	}
	for id, note := range notes {
		if _, err := db.Exec(`INSERT INTO notes (id, note) VALUES (?, ?)`, id, note); err != nil {
			t.Fatalf("seed note %s: %v", id, err)
		}
	}

	literalIDs, err := queryIDs(t, db, `SELECT id FROM notes WHERE note LIKE ? ESCAPE '\' ORDER BY id`, Contains("100%"))
	if err != nil {
		t.Fatalf("query with Contains pattern: %v", err)
	}
	if !slices.Equal(literalIDs, []string{"1"}) {
		t.Fatalf("expected Contains(\"100%%\") with ESCAPE to match only the literal-percent row, got %v", literalIDs)
	}

	unescapedIDs, err := queryIDs(t, db, `SELECT id FROM notes WHERE note LIKE ? ORDER BY id`, "%100%%")
	if err != nil {
		t.Fatalf("query with unescaped pattern: %v", err)
	}
	if !slices.Equal(unescapedIDs, []string{"1", "2"}) {
		t.Fatalf("expected the unescaped pattern to prove the contrast by matching both rows, got %v", unescapedIDs)
	}
}

// queryIDs runs the query and collects the string ids in row order. It is the
// one helper this package needs for the engine-backed assertions.
func queryIDs(t *testing.T, db *sql.DB, query string, arg string) ([]string, error) {
	t.Helper()

	rows, err := db.Query(query, arg)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

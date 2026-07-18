package download

import (
	"database/sql"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// openTestBridgeDB opens an isolated bridge database for download store tests.
func openTestBridgeDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open test bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// containsBytes reports whether needle occurs in haystack.
func containsBytes(haystack, needle []byte) bool {
	if len(needle) == 0 || len(haystack) < len(needle) {
		return false
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := range needle {
			if haystack[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

// runIDForIndex returns the deterministic run ID used by a fixture row.
func runIDForIndex(i int) string {
	return "run-" + itoa(i)
}

// itoa formats an integer for test fixture identifiers.
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	digits := []byte{}
	neg := i < 0
	if neg {
		i = -i
	}
	for i > 0 {
		digits = append([]byte{byte('0' + i%10)}, digits...)
		i /= 10
	}
	if neg {
		return "-" + string(digits)
	}
	return string(digits)
}

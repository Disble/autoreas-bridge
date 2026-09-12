package settings_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
)

// openKeymapImportTestDB opens a fresh bridge DB for backup_import.go's
// keymap tests, mirroring backup_export_test.go's inline db-open shape.
func openKeymapImportTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// buildKeymapRecordLine JSON-encodes one keyboard_keymap group record for
// document, as a single JSONL line -- built via encoding/json rather than a
// hand-escaped literal, so an opaque document (not valid JSON itself) is
// encoded correctly regardless of its own escaping needs.
func buildKeymapRecordLine(t *testing.T, document string) string {
	t.Helper()

	raw, err := json.Marshal(struct {
		Document string `json:"document"`
	}{Document: document})
	if err != nil {
		t.Fatalf("marshal keymap record: %v", err)
	}
	return string(raw) + "\n"
}

// TestValidateKeymapAcceptsZeroOrOneRecordAndRejectsASecond closes the
// envelope-cardinality half of "Import Writes Only Its Own Key": the
// validator decodes 0 or 1 keymap records without touching a database, and
// refuses a stream carrying a second one -- before any import could run.
func TestValidateKeymapAcceptsZeroOrOneRecordAndRejectsASecond(t *testing.T) {
	tests := []struct {
		name      string
		stream    string
		wantCount int
		wantErr   bool
	}{
		{name: "zero records", stream: "", wantCount: 0, wantErr: false},
		{name: "one record", stream: `{"document":"{\"version\":1,\"overrides\":{}}"}` + "\n", wantCount: 1, wantErr: false},
		{name: "two records is rejected", stream: `{"document":"a"}` + "\n" + `{"document":"b"}` + "\n", wantCount: 2, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			validateFn := settings.ValidateKeymap()
			count, err := validateFn(context.Background(), strings.NewReader(tt.stream))
			if tt.wantErr && err == nil {
				t.Fatalf("expected an error for stream %q", tt.stream)
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if count != tt.wantCount {
				t.Fatalf("expected count %d, got %d", tt.wantCount, count)
			}
		})
	}
}

// TestImportKeymapUpsertsTheSoleRecordsDocument closes "Import Writes Only
// Its Own Key"'s import half: a stream carrying one record upserts its
// document via SetKeymap, verbatim.
func TestImportKeymapUpsertsTheSoleRecordsDocument(t *testing.T) {
	db := openKeymapImportTestDB(t)
	document := `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`

	importFn := settings.ImportKeymap(db)
	count, err := importFn(context.Background(), strings.NewReader(buildKeymapRecordLine(t, document)))
	if err != nil {
		t.Fatalf("import keymap: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}

	got, err := settings.NewSQLiteStore(db).Keymap(context.Background())
	if err != nil {
		t.Fatalf("read back keymap: %v", err)
	}
	if got != document {
		t.Fatalf("keymap = %q, want %q", got, document)
	}
}

// TestImportKeymapWithZeroRecordsResetsToDefaults closes "A Present-But-Empty
// Group Resets The Keymap To Defaults": a carried group with zero records
// calls SetKeymap("") explicitly, clearing a previously rebound keymap.
func TestImportKeymapWithZeroRecordsResetsToDefaults(t *testing.T) {
	db := openKeymapImportTestDB(t)
	if err := settings.NewSQLiteStore(db).SetKeymap(context.Background(), `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`); err != nil {
		t.Fatalf("seed keymap: %v", err)
	}

	importFn := settings.ImportKeymap(db)
	count, err := importFn(context.Background(), strings.NewReader(""))
	if err != nil {
		t.Fatalf("import keymap: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected count 0 for an empty carried group, got %d", count)
	}

	got, err := settings.NewSQLiteStore(db).Keymap(context.Background())
	if err != nil {
		t.Fatalf("read back keymap: %v", err)
	}
	if got != "" {
		t.Fatalf("expected the keymap reset to defaults (empty), got %q", got)
	}
}

// TestImportKeymapPreservesOpaqueBytesByteForByte is the import-side mirror
// of keymap_test.go's TestKeymapRoundTripsOpaqueBytesUnchanged: a document
// that is neither valid JSON nor a valid chord survives an import
// byte-for-byte, because ImportKeymap never parses or validates it.
func TestImportKeymapPreservesOpaqueBytesByteForByte(t *testing.T) {
	db := openKeymapImportTestDB(t)
	garbage := `{not json: alt++`

	importFn := settings.ImportKeymap(db)
	if _, err := importFn(context.Background(), strings.NewReader(buildKeymapRecordLine(t, garbage))); err != nil {
		t.Fatalf("import keymap: %v", err)
	}

	got, err := settings.NewSQLiteStore(db).Keymap(context.Background())
	if err != nil {
		t.Fatalf("read back keymap: %v", err)
	}
	if got != garbage {
		t.Fatalf("keymap = %q, want byte-identical %q", got, garbage)
	}
}

// TestImportKeymapRejectsASecondRecordAndWritesNothing pins that a rejected
// stream never reaches SetKeymap: the decode error surfaces before any
// write, so the store keeps its untouched (unset) value.
func TestImportKeymapRejectsASecondRecordAndWritesNothing(t *testing.T) {
	db := openKeymapImportTestDB(t)
	stream := buildKeymapRecordLine(t, "a") + buildKeymapRecordLine(t, "b")

	importFn := settings.ImportKeymap(db)
	if _, err := importFn(context.Background(), strings.NewReader(stream)); err == nil {
		t.Fatal("expected an error importing a stream carrying two keymap records")
	}

	got, err := settings.NewSQLiteStore(db).Keymap(context.Background())
	if err != nil {
		t.Fatalf("read back keymap: %v", err)
	}
	if got != "" {
		t.Fatalf("expected no write on a rejected stream, got %q", got)
	}
}

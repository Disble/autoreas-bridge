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

// importKeymapCase is one row of TestImportKeymapHandlesUpsertResetOpaqueBytesAndRejection.
type importKeymapCase struct {
	name         string
	seedDocument string
	stream       string
	wantErr      bool
	wantCount    int
	wantStored   string
}

// TestImportKeymapHandlesUpsertResetOpaqueBytesAndRejection closes "Import
// Writes Only Its Own Key" and "A Present-But-Empty Group Resets The Keymap
// To Defaults": its four rows share one shape -- optionally seed a keymap,
// run the import over a stream, then compare the count, the error, and the
// keymap read back afterward.
func TestImportKeymapHandlesUpsertResetOpaqueBytesAndRejection(t *testing.T) {
	tests := []importKeymapCase{
		{
			name:       "upserts the sole record's document verbatim",
			stream:     buildKeymapRecordLine(t, `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`),
			wantCount:  1,
			wantStored: `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`,
		},
		{
			name:         "zero records resets a previously seeded keymap to defaults",
			seedDocument: `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`,
			wantCount:    0,
			wantStored:   "",
		},
		{
			name:       "preserves opaque bytes byte-for-byte",
			stream:     buildKeymapRecordLine(t, `{not json: alt++`),
			wantCount:  1,
			wantStored: `{not json: alt++`,
		},
		{
			name:       "rejects a second record and writes nothing",
			stream:     buildKeymapRecordLine(t, "a") + buildKeymapRecordLine(t, "b"),
			wantErr:    true,
			wantCount:  2,
			wantStored: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertImportKeymapOutcome(t, tt)
		})
	}
}

// assertImportKeymapOutcome seeds an optional keymap, runs ImportKeymap over
// tt.stream, and checks the count, the error, and the keymap read back
// afterward against tt.
func assertImportKeymapOutcome(t *testing.T, tt importKeymapCase) {
	t.Helper()

	db := openKeymapImportTestDB(t)
	store := settings.NewSQLiteStore(db)
	if tt.seedDocument != "" {
		if err := store.SetKeymap(context.Background(), tt.seedDocument); err != nil {
			t.Fatalf("seed keymap: %v", err)
		}
	}

	importFn := settings.ImportKeymap(db)
	count, err := importFn(context.Background(), strings.NewReader(tt.stream))
	if tt.wantErr && err == nil {
		t.Fatalf("expected an error importing stream %q", tt.stream)
	}
	if !tt.wantErr && err != nil {
		t.Fatalf("import keymap: %v", err)
	}
	if count != tt.wantCount {
		t.Fatalf("expected count %d, got %d", tt.wantCount, count)
	}

	got, err := store.Keymap(context.Background())
	if err != nil {
		t.Fatalf("read back keymap: %v", err)
	}
	if got != tt.wantStored {
		t.Fatalf("keymap = %q, want %q", got, tt.wantStored)
	}
}

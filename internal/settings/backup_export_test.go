package settings_test

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestExportKeymapEmitsPersistedDocumentVerbatim closes the "Export Carries
// The Keymap Document Verbatim" requirement: a persisted keymap exports as
// exactly one JSONL line equal to {"document":"<doc>"}, byte for byte; an
// unset keymap exports a present-but-empty group (zero lines, count 0).
func TestExportKeymapEmitsPersistedDocumentVerbatim(t *testing.T) {
	tests := []struct {
		name      string
		document  string
		wantCount int
		wantLine  string
	}{
		{
			name:      "persisted non-empty keymap exports one verbatim record",
			document:  `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`,
			wantCount: 1,
			wantLine:  `{"document":"{\"version\":1,\"overrides\":{\"nav.today\":\"ctrl+1\"}}"}`,
		},
		{
			name:      "unset keymap exports zero lines",
			document:  "",
			wantCount: 0,
			wantLine:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertExportKeymapCase(t, tt.document, tt.wantCount, tt.wantLine)
		})
	}
}

// assertExportKeymapCase runs one export-keymap scenario against a fresh
// bridge DB. Kept as a top-level function rather than the subtest's own
// closure body, so its branches sit at nesting level 0 instead of inside a
// for-loop-plus-closure -- real decomposition, not relocation, per this
// repo's own gocognit calibration note (.golangci.dlinter.yml).
func assertExportKeymapCase(t *testing.T, document string, wantCount int, wantLine string) {
	t.Helper()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if document != "" {
		if err := settings.NewSQLiteStore(db).SetKeymap(context.Background(), document); err != nil {
			t.Fatalf("seed keymap: %v", err)
		}
	}

	exportFn := settings.ExportKeymap(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("export keymap: %v", err)
	}
	if count != wantCount {
		t.Fatalf("expected %d exported record(s), got %d", wantCount, count)
	}

	if wantCount == 0 {
		if buf.Len() != 0 {
			t.Fatalf("expected zero JSONL bytes for an unset keymap, got %d: %s", buf.Len(), buf.String())
		}
		return
	}

	lines := bytes.Split(bytes.TrimRight(buf.Bytes(), "\n"), []byte("\n"))
	if len(lines) != 1 {
		t.Fatalf("expected exactly one JSONL line, got %d: %s", len(lines), buf.String())
	}
	if string(lines[0]) != wantLine {
		t.Fatalf("exported line = %s, want byte-identical %s", lines[0], wantLine)
	}
}

// failingWriter always fails its Write call, letting
// TestExportKeymapReportsZeroRecordsOnAnEncodeError trigger the encode-error
// branch without depending on json's own edge cases.
type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) {
	return 0, errors.New("simulated write failure")
}

// TestExportKeymapReportsZeroRecordsOnAQueryError pins the error-path return
// value: a failed keymap read MUST report 0 records alongside the error, not
// merely a non-nil error, since callers propagate this count on failure too.
func TestExportKeymapReportsZeroRecordsOnAQueryError(t *testing.T) {
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close bridge db: %v", err)
	}

	exportFn := settings.ExportKeymap(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err == nil {
		t.Fatal("expected an error when the underlying keymap read fails against a closed database")
	}
	if count != 0 {
		t.Fatalf("expected 0 records reported on a query error, got %d", count)
	}
}

// TestExportKeymapReportsZeroRecordsOnAnEncodeError pins the same
// error-path invariant for the encode branch: a failed write MUST report 0
// records alongside the error.
func TestExportKeymapReportsZeroRecordsOnAnEncodeError(t *testing.T) {
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := settings.NewSQLiteStore(db).SetKeymap(context.Background(), `{"a":1}`); err != nil {
		t.Fatalf("seed keymap: %v", err)
	}

	exportFn := settings.ExportKeymap(db)
	count, err := exportFn(context.Background(), failingWriter{})
	if err == nil {
		t.Fatal("expected an error when the destination writer fails")
	}
	if count != 0 {
		t.Fatalf("expected 0 records reported on an encode error, got %d", count)
	}
}

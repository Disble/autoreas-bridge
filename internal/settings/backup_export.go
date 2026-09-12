package settings

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
)

// keymapRecord is the JSONL wire shape for the keyboard_keymap backup group:
// one field mirroring the setting itself, not the app_settings row it lives
// in (design.md D1). The group name already fixes which key this record
// applies to, so no key field is carried.
type keymapRecord struct {
	Document string `json:"document"`
}

// ExportKeymap returns a backup export function that writes the persisted
// keyboard.keymap document as a single JSONL record. An unset keymap ("",
// never rebound or already reset to defaults) writes nothing -- the group
// stays present in the bundle with recordCount 0, per design.md D1's
// present-but-empty semantics. The document is carried verbatim: this
// package never parses, validates, or normalizes it (store.go's SetKeymap
// doc, design.md D1).
func ExportKeymap(db *sql.DB) func(context.Context, io.Writer) (int, error) {
	return func(ctx context.Context, w io.Writer) (int, error) {
		document, err := NewSQLiteStore(db).Keymap(ctx)
		if err != nil {
			return 0, fmt.Errorf("read keymap for export: %w", err)
		}
		if document == "" {
			return 0, nil
		}

		if err := json.NewEncoder(w).Encode(keymapRecord{Document: document}); err != nil {
			return 0, fmt.Errorf("encode keymap for export: %w", err)
		}
		return 1, nil
	}
}

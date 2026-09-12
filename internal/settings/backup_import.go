package settings

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// errKeymapGroupCarriesMoreThanOneRecord is returned when a keyboard_keymap
// group's stream carries a second record. The group's own record shape
// mirrors the setting, not a table row (design.md D1): there is exactly one
// value to carry, so a second record can never be a legitimate continuation.
var errKeymapGroupCarriesMoreThanOneRecord = errors.New("keyboard_keymap group carries more than one record")

// decodeKeymapEnvelope decodes the keyboard_keymap group's stream -- 0 or 1
// keymapRecord values -- and reports the sole record's Document alongside
// the record count. A 2nd record fails immediately, before a 3rd could ever
// be read. This is the shared decode core behind both ValidateKeymap and
// ImportKeymap (design.md D1): it decodes the envelope only and never
// inspects Document's contents, which is what "envelope only" means here --
// ADR-020 and keymap_test.go prohibit any Go-side chord grammar.
func decodeKeymapEnvelope(r io.Reader) (document string, count int, err error) {
	dec := json.NewDecoder(r)
	for {
		var rec keymapRecord
		if decErr := dec.Decode(&rec); decErr != nil {
			if errors.Is(decErr, io.EOF) {
				return document, count, nil
			}
			return document, count, fmt.Errorf("decode keymap record %d: %w", count, decErr)
		}
		count++
		if count > 1 {
			return document, count, errKeymapGroupCarriesMoreThanOneRecord
		}
		document = rec.Document
	}
}

// ValidateKeymap returns a backup validate function that decodes the
// keyboard_keymap group's envelope -- cardinality and decodability only --
// touching no database. It never inspects the record's Document field
// beyond decoding it as part of the envelope (design.md D1, ADR-020).
func ValidateKeymap() func(context.Context, io.Reader) (int, error) {
	return func(_ context.Context, r io.Reader) (int, error) {
		_, count, err := decodeKeymapEnvelope(r)
		return count, err
	}
}

// ImportKeymap returns a backup import function that upserts the keymap
// document via SetKeymap -- a single-key upsert (store.go) that can never
// reach another app_settings key. Zero records is a present-but-empty
// group, which is an explicit instruction to reset the keymap to defaults
// (design.md D1): SetKeymap(ctx, "") is called just like any other document,
// never skipped. A malformed or oversized (2+ records) stream is rejected
// before SetKeymap is ever called, so a rejected import writes nothing. The
// document is written verbatim -- never parsed, validated, or normalized
// (store.go's SetKeymap doc).
func ImportKeymap(db *sql.DB) func(context.Context, io.Reader) (int, error) {
	return func(ctx context.Context, r io.Reader) (int, error) {
		document, count, err := decodeKeymapEnvelope(r)
		if err != nil {
			return count, err
		}
		if setErr := NewSQLiteStore(db).SetKeymap(ctx, document); setErr != nil {
			return count, fmt.Errorf("import keymap: %w", setErr)
		}
		return count, nil
	}
}

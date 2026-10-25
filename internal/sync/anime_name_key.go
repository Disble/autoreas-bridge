package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"autoreas-bridge/internal/persistence"
)

// animeNameKey is the anime identity the catalogue already assumes
// everywhere: the search rails filter by name, and the download destination is
// derived from it (internal/download/destination.go), so two animes sharing a
// name are indistinguishable in the UI and collide on disk. Case and
// surrounding spaces never distinguish two animes, so the key folds both away.
//
// The rule is exactly what SQLite's built-in lower(trim(...)) produced when the
// key was a generated column: trim strips U+0020 only, and lower folds ASCII
// A-Z only, leaving every other rune untouched ("Date a Live Ⅲ" keys as
// "date a live Ⅲ"). It lives in Go because a generated column re-evaluates the
// expression with whatever SQLite reads the file: an ICU build folds "Ⅲ" to
// "ⅲ", and a REINDEX from such a tool once desynced the unique index from the
// rows the app wrote.
//
// A snapshot with no readable name -- invalid JSON (the backup import defaults
// an absent snapshot_json to ""), an absent name, or a name that is not a JSON
// string -- keys as NULL. SQLite treats NULLs as distinct in a unique index, and
// a record with no readable name has no name to be unique about.
func animeNameKey(snapshotJSON string) sql.NullString {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(snapshotJSON), &fields); err != nil {
		return sql.NullString{}
	}
	var value any
	if err := json.Unmarshal(fields["name"], &value); err != nil {
		return sql.NullString{}
	}
	name, isString := value.(string)
	if !isString {
		return sql.NullString{}
	}
	key := []byte(strings.Trim(name, " "))
	for index, char := range key {
		if 'A' <= char && char <= 'Z' {
			key[index] = char + ('a' - 'A')
		}
	}
	return sql.NullString{String: string(key), Valid: true}
}

// nameKeyColumnState is how the name_key column exists on anime_snapshots.
type nameKeyColumnState int

const (
	nameKeyColumnAbsent nameKeyColumnState = iota
	nameKeyColumnGenerated
	nameKeyColumnPlain
)

// ensureAnimeNameKeyColumn turns name_key into plain data the app writes, in
// one transaction: it drops the generated column of an older database (and the
// index over it), adds the plain column, backfills every row through
// animeNameKey, and rebuilds the unique index. Rebuilding the index from Go keys
// also repairs one an external tool desynced from its rows.
//
// It refuses, loudly and with the database left unchanged, any catalogue the
// unique index could not cover: a silent skip would leave the guard absent on
// exactly the databases that already proved they need it. The message names
// each duplicate key and the animes holding it, so they can be fixed from the
// Editor.
func ensureAnimeNameKeyColumn(db *sql.DB) error {
	state, err := readNameKeyColumnState(db)
	if err != nil || state == nameKeyColumnPlain {
		return err
	}
	return persistence.InTx(context.Background(), db, func(tx *sql.Tx) error {
		return rebuildAnimeNameKey(tx, state)
	})
}

// rebuildAnimeNameKey replaces whatever name_key the table has with the plain,
// backfilled column and its unique index.
func rebuildAnimeNameKey(tx *sql.Tx, state nameKeyColumnState) error {
	if state == nameKeyColumnGenerated {
		if _, err := tx.Exec(`DROP INDEX IF EXISTS idx_anime_snapshots_name_key`); err != nil {
			return fmt.Errorf("drop anime_snapshots name key index: %w", err)
		}
		if _, err := tx.Exec(`ALTER TABLE anime_snapshots DROP COLUMN name_key`); err != nil {
			return fmt.Errorf("drop generated anime_snapshots name key: %w", err)
		}
	}
	if _, err := tx.Exec(`ALTER TABLE anime_snapshots ADD COLUMN name_key TEXT`); err != nil {
		return fmt.Errorf("add anime_snapshots name key: %w", err)
	}
	if err := backfillAnimeNameKeys(tx); err != nil {
		return err
	}
	if _, err := tx.Exec(animeSnapshotsNameKeyIndexDDL); err != nil {
		return fmt.Errorf("create anime_snapshots name key index: %w", err)
	}
	return nil
}

// readNameKeyColumnState inspects name_key with PRAGMA table_xinfo, the one
// pragma that reports a generated column: table_info and the column list
// persistence hands the migration hook both hide it. hidden is 2 for a VIRTUAL
// generated column, the only generated shape this app ever created.
func readNameKeyColumnState(db *sql.DB) (nameKeyColumnState, error) {
	var hidden int
	err := db.QueryRow(`SELECT hidden FROM pragma_table_xinfo('anime_snapshots') WHERE name = 'name_key'`).Scan(&hidden)
	switch {
	case err == sql.ErrNoRows:
		return nameKeyColumnAbsent, nil
	case err != nil:
		return nameKeyColumnAbsent, fmt.Errorf("inspect anime_snapshots name key: %w", err)
	case hidden == 2:
		return nameKeyColumnGenerated, nil
	default:
		return nameKeyColumnPlain, nil
	}
}

// backfillAnimeNameKeys computes every row's key in Go and stores it, after
// refusing any key more than one anime holds. Rows are buffered before the
// updates because the bridge runs on a single connection the open cursor would
// otherwise hold.
func backfillAnimeNameKeys(tx *sql.Tx) error {
	keys, err := readAnimeNameKeys(tx)
	if err != nil {
		return err
	}
	if err := refuseDuplicateAnimeNameKeys(keys); err != nil {
		return err
	}
	for animeID, key := range keys {
		if _, err := tx.Exec(`UPDATE anime_snapshots SET name_key = ? WHERE anime_id = ?`, key, animeID); err != nil {
			return fmt.Errorf("backfill anime_snapshots name key %q: %w", animeID, err)
		}
	}
	return nil
}

// readAnimeNameKeys returns the Go-computed key of every stored anime.
func readAnimeNameKeys(tx *sql.Tx) (keys map[string]sql.NullString, err error) {
	rows, err := tx.Query(`SELECT anime_id, snapshot_json FROM anime_snapshots`)
	if err != nil {
		return nil, fmt.Errorf("read anime_snapshots for name keys: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			keys, err = nil, closeErr
		}
	}()

	keys = map[string]sql.NullString{}
	for rows.Next() {
		var animeID, snapshotJSON string
		if scanErr := rows.Scan(&animeID, &snapshotJSON); scanErr != nil {
			return nil, fmt.Errorf("scan anime_snapshots for name keys: %w", scanErr)
		}
		keys[animeID] = animeNameKey(snapshotJSON)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, rowsErr
	}
	return keys, nil
}

// refuseDuplicateAnimeNameKeys fails when a non-NULL key is held by more than
// one anime, naming every such key with its animes in a stable order so the
// failure reads the same on every run.
func refuseDuplicateAnimeNameKeys(keys map[string]sql.NullString) error {
	holders := map[string][]string{}
	for animeID, key := range keys {
		if key.Valid {
			holders[key.String] = append(holders[key.String], animeID)
		}
	}
	var duplicates []string
	for key, animeIDs := range holders {
		if len(animeIDs) > 1 {
			sort.Strings(animeIDs)
			duplicates = append(duplicates, fmt.Sprintf("%q held by %s", key, strings.Join(animeIDs, ", ")))
		}
	}
	if len(duplicates) == 0 {
		return nil
	}
	sort.Strings(duplicates)
	return fmt.Errorf(
		"cannot enforce unique anime names: %d name(s) are held by more than one anime (%s); "+
			"rename or remove the extra records, then start again",
		len(duplicates), strings.Join(duplicates, "; "))
}

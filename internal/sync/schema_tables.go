package sync

import (
	"database/sql"
	"fmt"
	"strings"

	"autoreas-bridge/internal/persistence"
)

// schemaTables returns the TableSchema descriptors for all sync-owned bridge tables.
// The composition root in initializeBridgeDB assembles this set with download.SchemaTables()
// to form the complete bridge schema without either context importing the other's definitions.
func schemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		createOnlyTable("pairing_tokens", pairingTokensDDL),
		createOnlyTable("devices", devicesDDL),
		createOnlyTable("conflicts", conflictsDDL),
		changelogTable(),
		createOnlyTable("app_settings", appSettingsDDL),
		createOnlyTable("device_sync_state", deviceSyncStateDDL),
		animeWriteOperationsTable(),
		animeChangedOutboxTable(),
		requestCapturesTable(),
		createOnlyTable("request_capture_metadata", requestCaptureMetadataDDL),
		createOnlyTable("schema_migration_markers", schemaMigrationMarkersDDL),
		// animeSnapshotsTable is last: its Migrate hook drives the SDD-56
		// cross-table vocabulary migration (ensureVocabularyMigration), which
		// reads/writes conflicts, changelog, anime_write_operations, and
		// anime_changed_outbox -- all of which must already exist by the time
		// it runs, including on a truly fresh install.
		animeSnapshotsTable(),
	}
}

// createOnlyTable builds a table descriptor without migration logic.
func createOnlyTable(name, ddl string) persistence.TableSchema {
	return persistence.TableSchema{Name: name, CreateDDL: ddl}
}

// animeChangedOutboxTable builds the outbox descriptor. It carries a migration
// rather than being create-only because the derived changed-field list was
// added after the table shipped.
func animeChangedOutboxTable() persistence.TableSchema {
	return persistence.TableSchema{
		Name:      "anime_changed_outbox",
		CreateDDL: animeChangedOutboxDDL,
		Indexes:   []string{animeChangedOutboxPendingIndexDDL},
		Migrate:   migrateAnimeChangedOutboxSchema,
	}
}

// migrateAnimeChangedOutboxSchema adds the derived changed-field column
// (ADD COLUMN only -- non-destructive). It is nullable on purpose: rows written
// before this change carry no derivation, and the reader treats NULL as an
// empty list, which is exactly the behaviour they already had.
func migrateAnimeChangedOutboxSchema(db *sql.DB, cols []string) error {
	if containsSchemaColumn(cols, "changed_fields_json") {
		return nil
	}
	if _, err := db.Exec(`ALTER TABLE anime_changed_outbox ADD COLUMN changed_fields_json TEXT`); err != nil {
		return fmt.Errorf("add anime_changed_outbox changed_fields_json: %w", err)
	}
	return nil
}

// animeSnapshotsTable builds the anime snapshot table descriptor.
func animeSnapshotsTable() persistence.TableSchema {
	return persistence.TableSchema{
		Name:      "anime_snapshots",
		CreateDDL: animeSnapshotsDDL,
		Indexes:   []string{animeSnapshotsNameKeyIndexDDL},
		Migrate:   migrateAnimeSnapshotsSchema,
	}
}

// migrateAnimeSnapshotsSchema upgrades a legacy anime snapshot schema.
func migrateAnimeSnapshotsSchema(db *sql.DB, cols []string) error {
	if !containsSchemaColumn(cols, "modified_at") {
		if !isLegacyAnimeSnapshotsSchema(cols) {
			return fmt.Errorf("unsupported anime_snapshots schema columns: %v", cols)
		}
		if _, err := db.Exec(`ALTER TABLE anime_snapshots ADD COLUMN modified_at INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("migrate legacy anime_snapshots schema: %w", err)
		}
	}
	if err := ensureScheduleDayMigrationColumn(db, cols); err != nil {
		return err
	}
	if !containsSchemaColumn(cols, "vocabulary_migrated_at") {
		if _, err := db.Exec(`ALTER TABLE anime_snapshots ADD COLUMN vocabulary_migrated_at INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("add anime_snapshots vocabulary migration marker: %w", err)
		}
	}
	if err := ensureAnimeNameKeyColumn(db); err != nil {
		return err
	}
	// The SDD-56 content migration itself is NOT run from here: EnsureTableSchema
	// never calls Migrate for a table it just created via CreateDDL (cols == 0),
	// so a call here would miss the fresh-install case and only ever fire on the
	// *second* bootstrap of a brand-new database -- by which point real,
	// already-English rows created by normal app use in between would be
	// wrongly reprocessed. initializeBridgeDB calls ensureVocabularyMigration
	// once, unconditionally, after every table in schemaTables() is ensured
	// (fresh-created or pre-existing), so the ordering is correct either way.
	return nil
}

// ensureScheduleDayMigrationColumn adds the additive, idempotent SDD-55 schedule-day
// English-domain migration marker column when absent (ADR-55-4, decision 0.2: the
// weekday-comparison English representation is read-time-mapped in the download-selection
// domain, so this column carries no comparison data itself; it exists solely as the
// migration-registry entry the idempotence scenario targets). Existing snapshot_json rows
// and their Spanish "dias" values are never touched.
func ensureScheduleDayMigrationColumn(db *sql.DB, cols []string) error {
	if containsSchemaColumn(cols, "schedule_day_migrated_at") {
		return nil
	}
	if _, err := db.Exec(`ALTER TABLE anime_snapshots ADD COLUMN schedule_day_migrated_at INTEGER NOT NULL DEFAULT 0`); err != nil {
		return fmt.Errorf("add anime_snapshots schedule-day migration marker: %w", err)
	}
	return nil
}

// ensureAnimeNameKeyColumn adds the generated anime-identity column to a
// database that predates it, after refusing any catalogue the unique index
// could not cover.
//
// The refusal is deliberate and loud: a silent skip would leave the guard
// absent on exactly the databases that already proved they need it. The message
// names each duplicate so it can be fixed from the Editor, because the index is
// the only thing standing between the catalogue and a second anime sharing a
// name -- and a name is what the search rails and the download folder are
// derived from.
func ensureAnimeNameKeyColumn(db *sql.DB) error {
	present, err := hasGeneratedNameKeyColumn(db)
	if err != nil {
		return err
	}
	if present {
		return nil
	}
	duplicates, err := duplicateAnimeNameKeys(db)
	if err != nil {
		return err
	}
	if len(duplicates) > 0 {
		return fmt.Errorf(
			"cannot enforce unique anime names: %d name(s) are held by more than one anime (%s); "+
				"rename or remove the extra records, then start again",
			len(duplicates), strings.Join(duplicates, ", "))
	}
	alter := `ALTER TABLE anime_snapshots ADD COLUMN name_key TEXT GENERATED ALWAYS AS (` +
		animeSnapshotsNameKeyExpr + `) VIRTUAL`
	if _, err := db.Exec(alter); err != nil {
		return fmt.Errorf("add anime_snapshots name key: %w", err)
	}
	return nil
}

// hasGeneratedNameKeyColumn reports whether the generated identity column is
// already on the table.
//
// It deliberately does NOT use the column list persistence hands the migration
// hook, nor PRAGMA table_info, because neither reports a GENERATED ... VIRTUAL
// column: SQLite treats it as hidden. Probing with table_info makes the ALTER
// re-run on every boot and fail with "duplicate column name". PRAGMA
// table_xinfo is the one that lists hidden columns.
func hasGeneratedNameKeyColumn(db *sql.DB) (present bool, err error) {
	rows, err := db.Query(`SELECT name FROM pragma_table_xinfo('anime_snapshots')`)
	if err != nil {
		return false, fmt.Errorf("inspect anime_snapshots columns: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			present, err = false, closeErr
		}
	}()

	for rows.Next() {
		var name string
		if scanErr := rows.Scan(&name); scanErr != nil {
			return false, fmt.Errorf("scan anime_snapshots column: %w", scanErr)
		}
		if name == "name_key" {
			present = true
		}
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return false, rowsErr
	}
	return present, nil
}

// duplicateAnimeNameKeys returns every normalised name held by more than one
// stored anime, in a stable order so the failure reads the same on every run.
func duplicateAnimeNameKeys(db *sql.DB) (names []string, err error) {
	rows, err := db.Query(`
		SELECT ` + animeSnapshotsNameKeyExpr + ` AS name_key
		FROM anime_snapshots
		GROUP BY name_key HAVING COUNT(*) > 1
		ORDER BY name_key`)
	if err != nil {
		return nil, fmt.Errorf("inspect anime names for duplicates: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			names, err = nil, closeErr
		}
	}()

	for rows.Next() {
		var name sql.NullString
		if scanErr := rows.Scan(&name); scanErr != nil {
			return nil, fmt.Errorf("scan duplicate anime name: %w", scanErr)
		}
		names = append(names, name.String)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, rowsErr
	}
	return names, nil
}

// changelogTable builds the changelog table descriptor.
func changelogTable() persistence.TableSchema {
	return persistence.TableSchema{
		Name:      "changelog",
		CreateDDL: changelogDDL,
		Indexes:   []string{changelogSourceEventIndexDDL},
		Migrate:   migrateChangelogSchema,
	}
}

// migrateChangelogSchema upgrades a recognized changelog schema.
func migrateChangelogSchema(db *sql.DB, cols []string) error {
	if isCurrentChangelogSchema(cols) {
		return ensureSourceEventIdentityColumn(db, cols)
	}
	if isLegacyPayloadOnlyChangelogSchema(cols) {
		return migrateLegacyChangelogSchema(db)
	}
	return fmt.Errorf("unsupported changelog schema columns: %v", cols)
}

// ensureSourceEventIdentityColumn adds the source event identity when absent.
func ensureSourceEventIdentityColumn(db *sql.DB, cols []string) error {
	if containsSchemaColumn(cols, "source_event_id") {
		return nil
	}
	if _, err := db.Exec(`ALTER TABLE changelog ADD COLUMN source_event_id TEXT`); err != nil {
		return fmt.Errorf("add changelog source event identity: %w", err)
	}
	return nil
}

// animeWriteOperationsTable builds the write operations table descriptor.
func animeWriteOperationsTable() persistence.TableSchema {
	return persistence.TableSchema{
		Name:      "anime_write_operations",
		CreateDDL: animeWriteOperationsDDL,
		Indexes: []string{
			animeWriteOperationsAnimeTokenIndexDDL,
			animeWriteOperationsRecoveryIndexDDL,
			animeWriteOperationsLiveReservationIndexDDL,
		},
		Migrate: migrateAnimeWriteOperationsSchema,
	}
}

// requestCapturesTable builds the request capture table descriptor.
func requestCapturesTable() persistence.TableSchema {
	return persistence.TableSchema{
		Name:      "request_captures",
		CreateDDL: requestCapturesDDL,
		Indexes: []string{
			requestCapturesTimeIndexDDL,
			requestCapturesDeviceTimeIndexDDL,
			requestCapturesAnimeTimeIndexDDL,
			requestCapturesRouteTimeIndexDDL,
			requestCapturesStatusTimeIndexDDL,
		},
		Migrate: migrateRequestCapturesSchema,
	}
}

// migrateRequestCapturesSchema adds the additive request/response/header/duration
// telemetry columns plus explicit body-capture-state markers (ADD COLUMN only
// -- non-destructive).
func migrateRequestCapturesSchema(db *sql.DB, cols []string) error {
	for _, column := range []struct {
		name string
		ddl  string
	}{
		{name: "request_body", ddl: `ALTER TABLE request_captures ADD COLUMN request_body TEXT`},
		{name: "request_body_state", ddl: `ALTER TABLE request_captures ADD COLUMN request_body_state TEXT NOT NULL DEFAULT ''`},
		{name: "response_body", ddl: `ALTER TABLE request_captures ADD COLUMN response_body TEXT`},
		{name: "response_body_state", ddl: `ALTER TABLE request_captures ADD COLUMN response_body_state TEXT NOT NULL DEFAULT ''`},
		{name: "request_headers", ddl: `ALTER TABLE request_captures ADD COLUMN request_headers TEXT`},
		{name: "response_headers", ddl: `ALTER TABLE request_captures ADD COLUMN response_headers TEXT`},
		{name: "duration_ms", ddl: `ALTER TABLE request_captures ADD COLUMN duration_ms INTEGER`},
	} {
		if containsSchemaColumn(cols, column.name) {
			continue
		}
		if _, err := db.Exec(column.ddl); err != nil {
			return fmt.Errorf("add request_captures %s: %w", column.name, err)
		}
	}
	return nil
}

// migrateAnimeWriteOperationsSchema adds missing write operation columns.
func migrateAnimeWriteOperationsSchema(db *sql.DB, cols []string) error {
	for _, column := range []struct {
		name string
		ddl  string
	}{
		{name: "batch_id", ddl: `ALTER TABLE anime_write_operations ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''`},
		{name: "batch_order", ddl: `ALTER TABLE anime_write_operations ADD COLUMN batch_order INTEGER NOT NULL DEFAULT 0`},
		{name: "batch_size", ddl: `ALTER TABLE anime_write_operations ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 1`},
	} {
		if containsSchemaColumn(cols, column.name) {
			continue
		}
		if _, err := db.Exec(column.ddl); err != nil {
			return fmt.Errorf("add anime_write_operations %s: %w", column.name, err)
		}
	}
	return nil
}

package sync

import (
	"database/sql"
	"fmt"

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
		{Name: "app_settings", CreateDDL: appSettingsDDL, Migrate: migrateAppSettings},
		createOnlyTable("device_sync_state", deviceSyncStateDDL),
		requestCapturesTable(),
		createOnlyTable("request_capture_metadata", requestCaptureMetadataDDL),
		createOnlyTable("request_rollup_hourly", requestRollupHourlyDDL),
		createOnlyTable("response_versions", responseVersionsDDL),
		createOnlyTable("schema_migration_markers", schemaMigrationMarkersDDL),
		createOnlyTable("season_projection_published", seasonProjectionPublishedDDL),
		// animeSnapshotsTable is last: its Migrate hook drives the SDD-56
		// cross-table vocabulary migration (ensureVocabularyMigration), which
		// reads/writes conflicts and changelog, which must already exist by the
		// time it runs, including on a truly fresh install.
		animeSnapshotsTable(),
	}
}

// createOnlyTable builds a table descriptor without migration logic.
func createOnlyTable(name, ddl string) persistence.TableSchema {
	return persistence.TableSchema{Name: name, CreateDDL: ddl}
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
			requestCapturesClientIDIndexDDL,
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
		{name: "error_message", ddl: `ALTER TABLE request_captures ADD COLUMN error_message TEXT NOT NULL DEFAULT ''`},
		{name: "client_request_id", ddl: `ALTER TABLE request_captures ADD COLUMN client_request_id TEXT NOT NULL DEFAULT ''`},
		// response_hash names the row's response_versions entry; '' for rows
		// written before it existed.
		{name: "response_hash", ddl: `ALTER TABLE request_captures ADD COLUMN response_hash TEXT NOT NULL DEFAULT ''`},
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

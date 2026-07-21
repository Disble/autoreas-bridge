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
		animeSnapshotsTable(),
		changelogTable(),
		createOnlyTable("app_settings", appSettingsDDL),
		createOnlyTable("device_sync_state", deviceSyncStateDDL),
		animeWriteOperationsTable(),
		indexedCreateOnlyTable("anime_changed_outbox", animeChangedOutboxDDL, animeChangedOutboxPendingIndexDDL),
	}
}

// createOnlyTable builds a table descriptor without migration logic.
func createOnlyTable(name string, ddl string) persistence.TableSchema {
	return persistence.TableSchema{Name: name, CreateDDL: ddl}
}

// indexedCreateOnlyTable builds a table descriptor with its indexes.
func indexedCreateOnlyTable(name string, ddl string, indexes ...string) persistence.TableSchema {
	return persistence.TableSchema{Name: name, CreateDDL: ddl, Indexes: indexes}
}

// animeSnapshotsTable builds the anime snapshot table descriptor.
func animeSnapshotsTable() persistence.TableSchema {
	return persistence.TableSchema{
		Name:      "anime_snapshots",
		CreateDDL: animeSnapshotsDDL,
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
	return ensureScheduleDayMigrationColumn(db, cols)
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

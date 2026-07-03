# Persistence Schema Registry Specification

## Purpose
Defines the data-driven schema-bootstrap contract that replaces the hand-wired
`initializeBridgeDB` sequence: a generic driver that ensures each table from a declarative
descriptor, per-bounded-context ownership of those descriptors, and preservation of the existing
introspection-based idempotency so DBs in the wild migrate without a version stamp.

## Requirements

### Requirement: Data-Driven Table Schema Driver

The system MUST ensure each table's schema from a declarative `TableSchema` descriptor via a single
generic driver, rather than a per-table bespoke function. The descriptor MUST express: the table
name, the create-table DDL, an ordered list of additive column migrations (each a column name plus
its `ALTER TABLE ... ADD COLUMN` DDL), optional index DDLs, and an optional custom-migration hook.

#### Scenario: Missing table is created fresh
- GIVEN a bridge DB where a descriptor's table does not yet exist
- WHEN the driver ensures that descriptor
- THEN the driver MUST execute the create-table DDL (which already includes every current column)
- AND MUST execute each of the descriptor's index DDLs

#### Scenario: Existing table gains only its missing columns
- GIVEN a bridge DB where the descriptor's table exists but is missing one or more of the
  descriptor's declared columns
- WHEN the driver ensures that descriptor
- THEN the driver MUST execute the `ALTER TABLE ... ADD COLUMN` DDL for each missing column, in
  declared order
- AND MUST NOT re-run the create-table DDL
- AND MUST NOT alter columns that already exist

#### Scenario: Already-current table is a no-op
- GIVEN a bridge DB whose table already has every column the descriptor declares
- WHEN the driver ensures that descriptor
- THEN the driver MUST make no schema change for that table

### Requirement: Introspection-Based Idempotency Preserved

The driver MUST determine what to apply by introspecting the live table's columns (as the current
`ensure*Schema` functions do), NOT by a persisted schema-version stamp. Bootstrap MUST remain safe to
run on every application start and MUST NOT require any pre-existing version marker in DBs created
before this change.

#### Scenario: Legacy DB without a version stamp migrates additively
- GIVEN a DB created before this change (no schema-version marker) whose table is missing a
  recently-added column
- WHEN bootstrap runs at startup
- THEN the missing column MUST be added via additive ALTER
- AND pre-existing rows MUST read back the column's declared default with zero data rewrite

### Requirement: Bounded-Context Schema Ownership

Each bounded context MUST own the descriptors for its own tables, and the central bootstrap MUST NOT
hard-code another context's table definitions. The combined descriptor set MUST be assembled at the
composition root so that no bounded context imports another solely to bootstrap schema.

#### Scenario: Download tables are owned by the download context
- GIVEN the download context's tables (`download_hoster_priority`, `download_jd_config`,
  `download_schedule_config`, `download_runs`)
- WHEN their descriptors are declared
- THEN they MUST be declared by the download context, not by the sync bootstrap file
- AND the composition root MUST include them in the set passed to the bootstrap driver

#### Scenario: Full bridge schema is still created on a fresh DB
- GIVEN a brand-new empty bridge DB
- WHEN bootstrap runs with the composition-root-assembled descriptor set
- THEN every table that existed before this change MUST exist after bootstrap
- AND each table's indexes MUST exist

### Requirement: Custom Migration Escape Hatch

A descriptor whose evolution cannot be expressed as additive column adds (e.g. a rename+rebuild) MUST
be able to supply a custom migration hook, which the driver invokes for the legacy shape instead of
the additive-ALTER path. Additive-only descriptors MUST NOT be required to supply one.

#### Scenario: Legacy changelog schema is migrated via its custom hook
- GIVEN a DB with the legacy payload-only `changelog` table shape
- WHEN bootstrap ensures the changelog descriptor
- THEN the descriptor's custom migration hook MUST run and produce the current changelog columns
  (`change_type`, `changed_fields_json`, `snapshot_json`, `changed_at_ms`)
- AND a pre-existing legacy row MUST be preserved with its derived fields populated

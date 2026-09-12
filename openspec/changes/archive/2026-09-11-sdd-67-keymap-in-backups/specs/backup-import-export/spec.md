# Delta for Backup Import Export

## MODIFIED Requirements

### Requirement: Export Scope Is Exactly Four Groups

The system MUST export `anime_snapshots`, `seasons`, `season_animes`, and the `keyboard_keymap`
group — the single `app_settings["keyboard.keymap"]` value — and nothing else. There MUST be no
flag, option, setting, or configuration value that adds any other table, or any other `app_settings`
key, to an export.

(Previously: exactly three table groups — `anime_snapshots`, `seasons`, `season_animes` — with
`app_settings` wholly excluded.)

#### Scenario: Exactly the four in-scope groups are present

- GIVEN a bridge DB with rows in `anime_snapshots`, `seasons`, and `season_animes`, and a non-empty
  keymap persisted at `app_settings["keyboard.keymap"]`
- WHEN an export runs
- THEN `manifest.json`'s `contexts[]` MUST name exactly those three table groups plus
  `keyboard_keymap`, and no other entry
- AND each entry's `recordCount` MUST equal the number of JSONL lines in its `data/{name}.jsonl` file

#### Scenario: Secret tables contribute zero rows to the bundle

- GIVEN a bridge DB seeded with rows in `pairing_tokens`, `devices`, and `device_sync_state`, each
  row carrying a distinctive marker value
- WHEN an export runs, with no opt-in flag available to include those tables
- THEN no `contexts[]` entry MUST be named for any of those tables
- AND scanning the decompressed bytes of every `data/{name}.jsonl` file MUST find zero occurrences
  of any seeded marker value
- AND the total number of records across all `data/{name}.jsonl` files MUST equal the combined row
  count of `anime_snapshots`, `seasons`, and `season_animes`, plus the `keyboard_keymap` group's own
  record count, and no more

#### Scenario: Machine-bound secrets contribute zero rows to the bundle

- GIVEN a bridge DB seeded with rows in `download_jd_config` (including a non-empty
  `myjd_password_encrypted`) and `download_hoster_priority`, each carrying a distinctive marker
  value
- WHEN an export runs
- THEN no `contexts[]` entry MUST be named for either of those tables
- AND scanning the decompressed bytes of every `data/{name}.jsonl` file MUST find zero occurrences
  of any seeded marker value

#### Scenario: Every app_settings key other than keyboard.keymap contributes zero bytes

- GIVEN a bridge DB with `app_settings["downloads.root"]` set to a distinctive marker value, and no
  other `app_settings` key carrying that marker
- WHEN an export runs
- THEN no `contexts[]` entry MUST be named `app_settings`
- AND scanning the decompressed bytes of every `data/{name}.jsonl` file, including
  `data/keyboard_keymap.jsonl`, MUST find zero occurrences of the seeded marker value

#### Scenario: Observability and bookkeeping tables contribute zero rows to the bundle

- GIVEN a bridge DB seeded with rows in `runtime_events`, `request_captures`,
  `request_capture_metadata`, `activity_log`, `changelog`, `anime_changed_outbox`,
  `anime_write_operations`, `schema_migration_markers`, `conflicts`, and `download_runs`, each
  carrying a distinctive marker value
- WHEN an export runs
- THEN no `contexts[]` entry MUST be named for any of those tables
- AND scanning the decompressed bytes of every `data/{name}.jsonl` file MUST find zero occurrences
  of any seeded marker value

## RENAMED Requirements

### Requirement: Export Scope Is Exactly Three Table Groups → Export Scope Is Exactly Four Groups

(Reason: the requirement's own heading named "three" groups; this change adds a fourth,
`keyboard_keymap`, so the heading must match the count it describes.)
(Migration: None — the same requirement continues to govern export scope under its new name.)

# Download Config Specification

## Purpose

Defines persisted configuration for hoster priority and JDownloader credentials, including the security and graceful-degradation requirements for each. There is intentionally NO persisted per-site scraper configuration table: the site/scraper registry lives in code (a static registry of site adapters), because adding a site requires writing its adapter code anyway. Only runtime-tunable data with no code change (hoster priority, JD credentials/config) is persisted.

## Requirements

### Requirement: Hoster Priority Is User-Orderable and Persisted

The system MUST persist a per-site hoster priority ordering that the user can read and reorder, and MUST seed sensible defaults on first run.

#### Scenario: User reorders hoster priority
- GIVEN an existing hoster priority list for site `jkanime`
- WHEN the user submits a new ordering via the config API
- THEN the system MUST persist the new ordering
- AND subsequent runs MUST use the new ordering

#### Scenario: First run seeds defaults
- GIVEN no hoster priority rows exist for a site
- WHEN the system needs hoster priority for that site
- THEN the system MUST seed default priorities (matching the validated PoC defaults) rather than starting empty

#### Scenario: Empty hoster priority table degrades gracefully
- GIVEN the hoster priority table is empty for a site (seeding failed or was skipped)
- WHEN the orchestrator needs to order hosters for that site
- THEN the system MUST fall back to alphabetical ordering
- AND MUST NOT crash or abort the run

#### Scenario: Equal-priority hosters resolve deterministically
- GIVEN two configured hosters for a site that share the same `priority` value
- WHEN the system orders hosters for that site
- THEN the system MUST break the tie deterministically by hoster name (case-insensitive alphabetical), producing a stable, repeatable order
- AND the system MUST NOT depend on table row order or map iteration order

#### Scenario: Unknown hoster is placed after all configured hosters
- GIVEN a hoster present in the scraped links but absent from `download_hoster_priority` for that site
- WHEN the system orders hosters for that site
- THEN the system MUST place that hoster AFTER all configured hosters
- AND MUST order multiple unconfigured hosters alphabetically among themselves (matching the PoC "everything else alphabetical" behavior)

### Requirement: Site Registry Is Code-Resident (No Persisted Site Config)

The system MUST resolve the scraper for an anime page through an in-code site registry (a static registry of site adapters), and MUST NOT depend on a persisted per-site scraper configuration table. Adding a site is a code change (writing its adapter), so no DB-level site config is required.

#### Scenario: Unsupported site is surfaced, not silently dropped
- GIVEN an anime whose page URL matches no registered site adapter
- WHEN the orchestrator evaluates that anime
- THEN the system MUST record an observable skip with an "unsupported site" reason
- AND MUST NOT silently omit the anime from the run

### Requirement: JD Credentials Stored Encrypted At Rest

The system MUST encrypt the MyJDownloader password at rest using DPAPI (`CryptProtectData`/`CryptUnprotectData`) scoped to the CURRENT WINDOWS USER (`CRYPTPROTECT_LOCAL_MACHINE` MUST NOT be set), so the OS derives the encryption key from the logged-in Windows session. The system MUST NOT persist the password in plaintext anywhere, and MUST NOT introduce any application-level user/login/master-password system — "single user" means the logged-in Windows user, and DPAPI binds the secret to that Windows identity automatically.

#### Scenario: Credentials are saved
- GIVEN a user submits MyJD email and password via the config API
- WHEN the system persists the JD config
- THEN the password MUST be stored as a DPAPI-encrypted blob, never as plaintext

#### Scenario: Password is write-only from the UI
- GIVEN JD config has been previously saved
- WHEN the config is read back for display (e.g. via a "get config" call)
- THEN the response MUST NOT include the password in cleartext or in any reversible form

#### Scenario: Decryption failure is observable, not fatal
- GIVEN a stored encrypted password blob that fails to decrypt (e.g. profile/user mismatch)
- WHEN the system attempts to use the JD credentials
- THEN the system MUST record the failure in the `download_jd_config.last_decrypt_error` field (the concrete observability sink)
- AND MUST surface it as a `download.jd_status` configuration error to the UI/observability stack
- AND MUST treat the failure as non-fatal (degrade to a JD config error, never crash the run, never silently proceed with empty credentials)
- AND MUST NOT log, return, or persist the plaintext under any code path, including this failure path

### Requirement: DPAPI Security Invariants Are Windows-Gated

The "never persist plaintext" / DPAPI round-trip security assertions MUST run against the real DPAPI implementation on the Windows build. The non-Windows build provides a clearly-labeled, non-secure fake `Protect`/`Unprotect` behind the `crypto.Protect`/`crypto.Unprotect` interface seam solely so the non-Windows CI build compiles; that fake MUST NOT be allowed to satisfy any security scenario.

#### Scenario: Security assertions run on the Windows build only
- GIVEN the security scenarios that assert the password is never persisted in plaintext
- WHEN the test suite runs on a non-Windows build using the fake `crypto` implementation
- THEN those security scenarios MUST be skipped/gated (not evaluated against the fake)
- AND on the Windows build they MUST run against the real DPAPI `Protect`/`Unprotect`

#### Scenario: Non-Windows fake never counts as secure storage
- GIVEN the non-secure fake `Protect`/`Unprotect` used on non-Windows builds
- WHEN any test or code path encrypts credentials with it
- THEN the system MUST NOT treat the fake's output as satisfying the encrypted-at-rest requirement

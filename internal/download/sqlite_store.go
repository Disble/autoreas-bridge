package download

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/download/crypto"
)

// downloadRunRetentionLimit mirrors config.RunRetentionLimit (design.md §4.5/§8,
// ADR-RETENTION) -- kept as a local alias so the prune query reads clearly.
const downloadRunRetentionLimit = config.RunRetentionLimit

// SQLiteStore implements DownloadStore on top of the shared bridge.db connection (design.md
// §3.6/§4; mirrors internal/device.SQLiteStore exactly: constructor injection over an already
// bootstrapped *sql.DB, no parallel connection/migration layer of its own).
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore wraps an already-bootstrapped bridge.db connection (internal/sync.OpenBridgeDB
// / BootstrapBridgeDB has already run the DDL + SetMaxOpenConns(1) + WAL pragmas).
func NewSQLiteStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
}

// --- Hoster priority (download_hoster_priority) ---

func (s *SQLiteStore) ListHosterPriority(ctx context.Context, site string) ([]HosterPriorityEntry, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT hoster, priority, enabled
		FROM download_hoster_priority
		WHERE site = ?
		ORDER BY priority ASC, hoster ASC
	`, site)
	if err != nil {
		return nil, fmt.Errorf("list hoster priority for site %q: %w", site, err)
	}
	defer rows.Close()

	entries := []HosterPriorityEntry{}
	for rows.Next() {
		var entry HosterPriorityEntry
		var enabled int
		if err := rows.Scan(&entry.Hoster, &entry.Priority, &enabled); err != nil {
			return nil, fmt.Errorf("scan hoster priority row: %w", err)
		}
		entry.Enabled = enabled != 0
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate hoster priority rows: %w", err)
	}
	return entries, nil
}

// SetHosterPriority replaces the entire ordering for site with entries, inside a transaction
// so a partial write can never leave a half-replaced ordering.
func (s *SQLiteStore) SetHosterPriority(ctx context.Context, site string, entries []HosterPriorityEntry) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin set hoster priority tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM download_hoster_priority WHERE site = ?`, site); err != nil {
		return fmt.Errorf("clear hoster priority for site %q: %w", site, err)
	}

	for _, entry := range entries {
		enabled := 0
		if entry.Enabled {
			enabled = 1
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO download_hoster_priority (site, hoster, priority, enabled)
			VALUES (?, ?, ?, ?)
		`, site, entry.Hoster, entry.Priority, enabled); err != nil {
			return fmt.Errorf("insert hoster priority %q for site %q: %w", entry.Hoster, site, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit set hoster priority tx: %w", err)
	}
	return nil
}

// SeedHosterPriorityIfEmpty seeds entries for site ONLY if no rows currently exist for that
// site -- it MUST NOT overwrite a user-configured ordering (download-config spec "First run
// seeds defaults"; mirrors internal/sync/sqlite_bootstrap.go seedDefaultHosterPriorityIfEmpty,
// generalized to any site rather than hardcoding "jkanime").
func (s *SQLiteStore) SeedHosterPriorityIfEmpty(ctx context.Context, site string, entries []HosterPriorityEntry) error {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM download_hoster_priority WHERE site = ?`, site).Scan(&count); err != nil {
		return fmt.Errorf("count hoster priority for site %q: %w", site, err)
	}
	if count > 0 {
		return nil
	}
	return s.SetHosterPriority(ctx, site, entries)
}

// --- JD config (download_jd_config, singleton id=1) ---

func (s *SQLiteStore) GetJDConfig(ctx context.Context) (JDConfig, error) {
	var (
		email            sql.NullString
		passwordBlob     []byte
		deviceName       sql.NullString
		exePathOverride  sql.NullString
		defaultDestDir   sql.NullString
		lastSeenStatus   sql.NullString
		lastSeenAtMs     sql.NullInt64
		lastDecryptError sql.NullString
	)

	err := s.db.QueryRowContext(ctx, `
		SELECT myjd_email, myjd_password_encrypted, device_name, exe_path_override,
		       default_dest_dir, last_seen_status, last_seen_at_ms, last_decrypt_error
		FROM download_jd_config WHERE id = 1
	`).Scan(&email, &passwordBlob, &deviceName, &exePathOverride, &defaultDestDir,
		&lastSeenStatus, &lastSeenAtMs, &lastDecryptError)
	if errors.Is(err, sql.ErrNoRows) {
		return JDConfig{}, nil
	}
	if err != nil {
		return JDConfig{}, fmt.Errorf("get jd config: %w", err)
	}

	return JDConfig{
		Email:            email.String,
		HasPassword:      len(passwordBlob) > 0,
		DeviceName:       deviceName.String,
		ExePathOverride:  exePathOverride.String,
		DefaultDestDir:   defaultDestDir.String,
		LastSeenStatus:   lastSeenStatus.String,
		LastSeenAtMs:     lastSeenAtMs.Int64,
		LastDecryptError: lastDecryptError.String,
	}, nil
}

// SetJDConfig upserts the singleton JD config row. plaintextPassword nil leaves the existing
// encrypted blob untouched (design §4.3); a non-nil plaintextPassword is DPAPI-encrypted via
// crypto.Protect before write and NEVER stored or logged in cleartext.
func (s *SQLiteStore) SetJDConfig(ctx context.Context, cfg JDConfig, plaintextPassword *string) error {
	var passwordBlob []byte
	if plaintextPassword != nil {
		blob, err := crypto.Protect([]byte(*plaintextPassword))
		if err != nil {
			return fmt.Errorf("encrypt jd password: %w", err)
		}
		passwordBlob = blob
	}

	if plaintextPassword == nil {
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO download_jd_config (id, myjd_email, device_name, exe_path_override, default_dest_dir)
			VALUES (1, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				myjd_email = excluded.myjd_email,
				device_name = excluded.device_name,
				exe_path_override = excluded.exe_path_override,
				default_dest_dir = excluded.default_dest_dir
		`, cfg.Email, cfg.DeviceName, cfg.ExePathOverride, cfg.DefaultDestDir)
		if err != nil {
			return fmt.Errorf("set jd config (password unchanged): %w", err)
		}
		return nil
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_jd_config (id, myjd_email, myjd_password_encrypted, device_name, exe_path_override, default_dest_dir)
		VALUES (1, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			myjd_email = excluded.myjd_email,
			myjd_password_encrypted = excluded.myjd_password_encrypted,
			device_name = excluded.device_name,
			exe_path_override = excluded.exe_path_override,
			default_dest_dir = excluded.default_dest_dir
	`, cfg.Email, passwordBlob, cfg.DeviceName, cfg.ExePathOverride, cfg.DefaultDestDir)
	if err != nil {
		return fmt.Errorf("set jd config: %w", err)
	}
	return nil
}

func (s *SQLiteStore) SetJDStatus(ctx context.Context, status string, atMs int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_jd_config (id, last_seen_status, last_seen_at_ms)
		VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			last_seen_status = excluded.last_seen_status,
			last_seen_at_ms = excluded.last_seen_at_ms
	`, status, atMs)
	if err != nil {
		return fmt.Errorf("set jd status: %w", err)
	}
	return nil
}

// DecryptedPassword returns the plaintext MyJD password for the JD adapter's connect-time use
// ONLY (design §4.3/§7). It is the single seam allowed to decrypt -- GetJDConfig/JDConfig never
// expose cleartext. A decrypt failure records last_decrypt_error (non-fatal C4 sink) and
// returns an empty password alongside the error -- it NEVER fabricates or leaks plaintext on
// the failure path.
func (s *SQLiteStore) DecryptedPassword(ctx context.Context) (string, bool, error) {
	var passwordBlob []byte
	err := s.db.QueryRowContext(ctx, `SELECT myjd_password_encrypted FROM download_jd_config WHERE id = 1`).Scan(&passwordBlob)
	if errors.Is(err, sql.ErrNoRows) || len(passwordBlob) == 0 {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("query jd password blob: %w", err)
	}

	plaintext, decryptErr := crypto.Unprotect(passwordBlob)
	if decryptErr != nil {
		if recordErr := s.recordDecryptError(ctx, decryptErr); recordErr != nil {
			return "", false, fmt.Errorf("decrypt jd password: %w (also failed to record last_decrypt_error: %v)", decryptErr, recordErr)
		}
		return "", false, fmt.Errorf("decrypt jd password: %w", decryptErr)
	}

	// A successful decrypt clears any previously recorded error (design §4 "Cleared on a
	// successful decrypt").
	if _, err := s.db.ExecContext(ctx, `UPDATE download_jd_config SET last_decrypt_error = NULL WHERE id = 1`); err != nil {
		return "", false, fmt.Errorf("clear last_decrypt_error after successful decrypt: %w", err)
	}

	return string(plaintext), true, nil
}

func (s *SQLiteStore) recordDecryptError(ctx context.Context, decryptErr error) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_jd_config (id, last_decrypt_error)
		VALUES (1, ?)
		ON CONFLICT(id) DO UPDATE SET last_decrypt_error = excluded.last_decrypt_error
	`, decryptErr.Error())
	return err
}

// --- Schedule config (download_schedule_config, singleton id=1) ---

// scheduleConfigAllWeekdaysEnabled is the backward-compat read-path default applied when
// enabled_weekdays is NULL (legacy/absent column data) or when no row exists at all (design.md
// "NULL column defaults to 127 in the READ path (not stored-127)") -- it preserves the
// pre-existing every-day firing behavior with zero migration of existing rows required.
const scheduleConfigAllWeekdaysEnabled = 127

func (s *SQLiteStore) GetScheduleConfig(ctx context.Context) (ScheduleConfig, error) {
	var (
		mode            string
		dailyTime       sql.NullString
		enabled         int
		lastRunAtMs     sql.NullInt64
		lastRunStatus   sql.NullString
		nextRunAtMs     sql.NullInt64
		enabledWeekdays sql.NullInt64
	)

	err := s.db.QueryRowContext(ctx, `
		SELECT mode, daily_time_hhmm, enabled, last_run_at_ms, last_run_status, next_run_at_ms, enabled_weekdays
		FROM download_schedule_config WHERE id = 1
	`).Scan(&mode, &dailyTime, &enabled, &lastRunAtMs, &lastRunStatus, &nextRunAtMs, &enabledWeekdays)
	if errors.Is(err, sql.ErrNoRows) {
		return ScheduleConfig{Mode: "in_process", Enabled: false, EnabledWeekdays: scheduleConfigAllWeekdaysEnabled}, nil
	}
	if err != nil {
		return ScheduleConfig{}, fmt.Errorf("get schedule config: %w", err)
	}

	weekdays := byte(scheduleConfigAllWeekdaysEnabled)
	if enabledWeekdays.Valid {
		weekdays = byte(enabledWeekdays.Int64)
	}

	return ScheduleConfig{
		Mode:            mode,
		DailyTimeHHMM:   dailyTime.String,
		Enabled:         enabled != 0,
		LastRunAtMs:     lastRunAtMs.Int64,
		LastRunStatus:   lastRunStatus.String,
		NextRunAtMs:     nextRunAtMs.Int64,
		EnabledWeekdays: weekdays,
	}, nil
}

func (s *SQLiteStore) SetScheduleConfig(ctx context.Context, cfg ScheduleConfig) error {
	mode := cfg.Mode
	if mode == "" {
		mode = "in_process"
	}
	enabled := 0
	if cfg.Enabled {
		enabled = 1
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_schedule_config (id, mode, daily_time_hhmm, enabled, enabled_weekdays)
		VALUES (1, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			mode = excluded.mode,
			daily_time_hhmm = excluded.daily_time_hhmm,
			enabled = excluded.enabled,
			enabled_weekdays = excluded.enabled_weekdays
	`, mode, cfg.DailyTimeHHMM, enabled, cfg.EnabledWeekdays)
	if err != nil {
		return fmt.Errorf("set schedule config: %w", err)
	}
	return nil
}

func (s *SQLiteStore) MarkScheduleRun(ctx context.Context, lastAtMs int64, status string, nextAtMs int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_schedule_config (id, last_run_at_ms, last_run_status, next_run_at_ms)
		VALUES (1, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			last_run_at_ms = excluded.last_run_at_ms,
			last_run_status = excluded.last_run_status,
			next_run_at_ms = excluded.next_run_at_ms
	`, lastAtMs, status, nextAtMs)
	if err != nil {
		return fmt.Errorf("mark schedule run: %w", err)
	}
	return nil
}

// --- Runs (download_runs) ---

func (s *SQLiteStore) OpenRun(ctx context.Context, run DownloadRun) error {
	status := run.Status
	if status == "" {
		status = "running"
	}
	jdAvailable := 0
	if run.JDAvailable {
		jdAvailable = 1
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_runs (
			run_id, started_at_ms, finished_at_ms, trigger,
			animes_checked, episodes_found, episodes_downloaded, episodes_failed,
			skipped_count, jd_available, status, error_summary, manual_links_json
		) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
	`, run.RunID, run.StartedAtMs, run.Trigger,
		run.AnimesChecked, run.EpisodesFound, run.EpisodesDownloaded, run.EpisodesFailed,
		run.SkippedCount, jdAvailable, status, nullableString(run.ErrorSummary))
	if err != nil {
		return fmt.Errorf("open run %q: %w", run.RunID, err)
	}
	return nil
}

// UpdateRunProgress refreshes the non-terminal counters of a running row without setting
// finished_at_ms or pruning history. FinalizeRun remains the only terminal transition.
func (s *SQLiteStore) UpdateRunProgress(ctx context.Context, run DownloadRun) error {
	manualLinksJSON, err := encodeManualLinks(run.ManualLinks)
	if err != nil {
		return fmt.Errorf("encode progress manual links for run %q: %w", run.RunID, err)
	}

	jdAvailable := 0
	if run.JDAvailable {
		jdAvailable = 1
	}

	result, err := s.db.ExecContext(ctx, `
		UPDATE download_runs SET
			animes_checked = ?,
			episodes_found = ?,
			episodes_downloaded = ?,
			episodes_failed = ?,
			skipped_count = ?,
			jd_available = ?,
			error_summary = ?,
			manual_links_json = ?
		WHERE run_id = ? AND finished_at_ms IS NULL
	`, run.AnimesChecked, run.EpisodesFound, run.EpisodesDownloaded, run.EpisodesFailed,
		run.SkippedCount, jdAvailable, nullableString(run.ErrorSummary), manualLinksJSON, run.RunID)
	if err != nil {
		return fmt.Errorf("update run progress %q: %w", run.RunID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("update run progress %q rows affected: %w", run.RunID, err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("update run progress %q: no running run found with that run_id", run.RunID)
	}
	return nil
}

// FinalizeRun writes the terminal row AND prunes download_runs to the most-recent
// config.RunRetentionLimit (200) rows, in the SAME transaction (design §4.5/§8, ADR-RETENTION).
func (s *SQLiteStore) FinalizeRun(ctx context.Context, run DownloadRun) error {
	manualLinksJSON, err := encodeManualLinks(run.ManualLinks)
	if err != nil {
		return fmt.Errorf("encode manual links for run %q: %w", run.RunID, err)
	}

	jdAvailable := 0
	if run.JDAvailable {
		jdAvailable = 1
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin finalize run tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `
		UPDATE download_runs SET
			finished_at_ms = ?,
			animes_checked = ?,
			episodes_found = ?,
			episodes_downloaded = ?,
			episodes_failed = ?,
			skipped_count = ?,
			jd_available = ?,
			status = ?,
			error_summary = ?,
			manual_links_json = ?
		WHERE run_id = ?
	`, run.FinishedAtMs, run.AnimesChecked, run.EpisodesFound, run.EpisodesDownloaded,
		run.EpisodesFailed, run.SkippedCount, jdAvailable, run.Status,
		nullableString(run.ErrorSummary), manualLinksJSON, run.RunID)
	if err != nil {
		return fmt.Errorf("finalize run %q: %w", run.RunID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("finalize run %q rows affected: %w", run.RunID, err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("finalize run %q: no open run found with that run_id", run.RunID)
	}

	if err := pruneRunsToRetentionLimit(ctx, tx); err != nil {
		return fmt.Errorf("prune download_runs after finalizing %q: %w", run.RunID, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit finalize run tx: %w", err)
	}
	return nil
}

// pruneRunsToRetentionLimit deletes every row outside the most-recent retention-limit set,
// ordered by started_at_ms DESC (design §4.5 "DELETE ... WHERE run_id NOT IN (... LIMIT 200)").
func pruneRunsToRetentionLimit(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `
		DELETE FROM download_runs
		WHERE run_id NOT IN (
			SELECT run_id FROM download_runs ORDER BY started_at_ms DESC LIMIT ?
		)
	`, downloadRunRetentionLimit)
	return err
}

func (s *SQLiteStore) ListRuns(ctx context.Context, limit int) ([]DownloadRun, error) {
	if limit <= 0 {
		limit = downloadRunRetentionLimit
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT run_id, started_at_ms, finished_at_ms, trigger,
		       animes_checked, episodes_found, episodes_downloaded, episodes_failed,
		       skipped_count, jd_available, status, error_summary, manual_links_json
		FROM download_runs
		ORDER BY started_at_ms DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list runs: %w", err)
	}
	defer rows.Close()

	runs := []DownloadRun{}
	for rows.Next() {
		run, err := scanDownloadRun(rows)
		if err != nil {
			return nil, fmt.Errorf("scan run row: %w", err)
		}
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate run rows: %w", err)
	}
	return runs, nil
}

// ReconcileInterruptedRuns finalizes every non-terminal row (finished_at_ms IS NULL) as
// status="interrupted" at atMs, BEFORE the scheduler starts (design §8 crash-zombie cleanup).
// It deliberately does NOT go through FinalizeRun's retention prune call again here -- a
// reconciled row is exactly one more terminal row, so the next real FinalizeRun's prune still
// applies the same bound; reconciliation itself does not need to duplicate that logic.
func (s *SQLiteStore) ReconcileInterruptedRuns(ctx context.Context, atMs int64) (int, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE download_runs
		SET finished_at_ms = ?, status = 'interrupted'
		WHERE finished_at_ms IS NULL
	`, atMs)
	if err != nil {
		return 0, fmt.Errorf("reconcile interrupted runs: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("reconcile interrupted runs rows affected: %w", err)
	}
	return int(affected), nil
}

// --- scan/encode helpers ---

// rowScanner is satisfied by *sql.Rows (used by ListRuns); kept as an interface so the scan
// helper is not coupled to *sql.Rows specifically.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanDownloadRun(row rowScanner) (DownloadRun, error) {
	var (
		run             DownloadRun
		finishedAtMs    sql.NullInt64
		errorSummary    sql.NullString
		manualLinksJSON sql.NullString
		jdAvailable     int
	)

	if err := row.Scan(
		&run.RunID, &run.StartedAtMs, &finishedAtMs, &run.Trigger,
		&run.AnimesChecked, &run.EpisodesFound, &run.EpisodesDownloaded, &run.EpisodesFailed,
		&run.SkippedCount, &jdAvailable, &run.Status, &errorSummary, &manualLinksJSON,
	); err != nil {
		return DownloadRun{}, err
	}

	if finishedAtMs.Valid {
		v := finishedAtMs.Int64
		run.FinishedAtMs = &v
	}
	run.ErrorSummary = errorSummary.String
	run.JDAvailable = jdAvailable != 0

	links, err := decodeManualLinks(manualLinksJSON)
	if err != nil {
		return DownloadRun{}, err
	}
	run.ManualLinks = links

	return run, nil
}

func encodeManualLinks(links []ManualLink) (sql.NullString, error) {
	if len(links) == 0 {
		return sql.NullString{}, nil
	}
	encoded, err := json.Marshal(links)
	if err != nil {
		return sql.NullString{}, err
	}
	return sql.NullString{String: string(encoded), Valid: true}, nil
}

func decodeManualLinks(raw sql.NullString) ([]ManualLink, error) {
	if !raw.Valid || raw.String == "" {
		return nil, nil
	}
	var links []ManualLink
	if err := json.Unmarshal([]byte(raw.String), &links); err != nil {
		return nil, fmt.Errorf("decode manual_links_json: %w", err)
	}
	return links, nil
}

func nullableString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

var _ DownloadStore = (*SQLiteStore)(nil)

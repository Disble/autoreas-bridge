package download

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// OpenRun inserts the provisional running row for a new download run.
func (s *SQLiteStore) OpenRun(ctx context.Context, run Run) error {
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
			skipped_count, up_to_date_count, jd_available, status, error_summary, manual_links_json
		) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
	`, run.RunID, run.StartedAtMs, run.Trigger,
		run.AnimesChecked, run.EpisodesFound, run.EpisodesDownloaded, run.EpisodesFailed,
		run.SkippedCount, run.UpToDateCount, jdAvailable, status, nullableString(run.ErrorSummary))
	if err != nil {
		return fmt.Errorf("open run %q: %w", run.RunID, err)
	}
	return nil
}

// UpdateRunProgress refreshes the non-terminal counters of a running row.
func (s *SQLiteStore) UpdateRunProgress(ctx context.Context, run Run) error {
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
			up_to_date_count = ?,
			jd_available = ?,
			error_summary = ?,
			manual_links_json = ?
		WHERE run_id = ? AND finished_at_ms IS NULL
	`, run.AnimesChecked, run.EpisodesFound, run.EpisodesDownloaded, run.EpisodesFailed,
		run.SkippedCount, run.UpToDateCount, jdAvailable, nullableString(run.ErrorSummary), manualLinksJSON, run.RunID)
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

// FinalizeRun writes the terminal row and prunes retained history in the same transaction.
func (s *SQLiteStore) FinalizeRun(ctx context.Context, run Run) error {
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
			up_to_date_count = ?,
			jd_available = ?,
			status = ?,
			error_summary = ?,
			manual_links_json = ?
		WHERE run_id = ?
	`, run.FinishedAtMs, run.AnimesChecked, run.EpisodesFound, run.EpisodesDownloaded,
		run.EpisodesFailed, run.SkippedCount, run.UpToDateCount, jdAvailable, run.Status,
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

// pruneRunsToRetentionLimit removes runs older than the configured retention limit.
func pruneRunsToRetentionLimit(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `
		DELETE FROM download_runs
		WHERE run_id NOT IN (
			SELECT run_id FROM download_runs ORDER BY started_at_ms DESC LIMIT ?
		)
	`, downloadRunRetentionLimit)
	return err
}

// ListRuns returns the most recent download runs, newest first.
func (s *SQLiteStore) ListRuns(ctx context.Context, limit int) (runs []Run, err error) {
	if limit <= 0 {
		limit = downloadRunRetentionLimit
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT run_id, started_at_ms, finished_at_ms, trigger,
		       animes_checked, episodes_found, episodes_downloaded, episodes_failed,
		       skipped_count, up_to_date_count, jd_available, status, error_summary, manual_links_json
		FROM download_runs
		ORDER BY started_at_ms DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list runs: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			runs = nil
			err = fmt.Errorf("close download run rows: %w", closeErr)
		}
	}()

	runs = []Run{}
	for rows.Next() {
		run, err := scanRun(rows)
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

// ReconcileInterruptedRuns finalizes every non-terminal row as interrupted before scheduler start.
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

type rowScanner interface {
	Scan(dest ...any) error
}

// scanRun decodes one database row into a download run.
func scanRun(row rowScanner) (Run, error) {
	var (
		run             Run
		finishedAtMs    sql.NullInt64
		errorSummary    sql.NullString
		manualLinksJSON sql.NullString
		jdAvailable     int
	)

	if err := row.Scan(
		&run.RunID, &run.StartedAtMs, &finishedAtMs, &run.Trigger,
		&run.AnimesChecked, &run.EpisodesFound, &run.EpisodesDownloaded, &run.EpisodesFailed,
		&run.SkippedCount, &run.UpToDateCount, &jdAvailable, &run.Status, &errorSummary, &manualLinksJSON,
	); err != nil {
		return Run{}, err
	}

	if finishedAtMs.Valid {
		v := finishedAtMs.Int64
		run.FinishedAtMs = &v
	}
	run.ErrorSummary = errorSummary.String
	run.JDAvailable = jdAvailable != 0

	links, err := decodeManualLinks(manualLinksJSON)
	if err != nil {
		return Run{}, err
	}
	run.ManualLinks = links

	return run, nil
}

// encodeManualLinks serializes manual links for nullable database storage.
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

// decodeManualLinks deserializes nullable database manual links.
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

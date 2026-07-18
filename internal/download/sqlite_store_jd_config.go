package download

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"autoreas-bridge/internal/download/crypto"
)

// GetJDConfig returns the persisted singleton MyJDownloader configuration.
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

// SetJDConfig upserts the singleton JD configuration row.
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

// SetJDStatus records the last observed MyJDownloader availability snapshot.
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

// DecryptedPassword returns the plaintext MyJDownloader password for connect-time adapter use.
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

	if _, err := s.db.ExecContext(ctx, `UPDATE download_jd_config SET last_decrypt_error = NULL WHERE id = 1`); err != nil {
		return "", false, fmt.Errorf("clear last_decrypt_error after successful decrypt: %w", err)
	}

	return string(plaintext), true, nil
}

// recordDecryptError records a persisted decryption failure for diagnostics.
func (s *SQLiteStore) recordDecryptError(ctx context.Context, decryptErr error) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_jd_config (id, last_decrypt_error)
		VALUES (1, ?)
		ON CONFLICT(id) DO UPDATE SET last_decrypt_error = excluded.last_decrypt_error
	`, decryptErr.Error())
	return err
}

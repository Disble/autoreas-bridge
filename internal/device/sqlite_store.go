package device

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type SQLiteStore struct {
	db *sql.DB
}

func NewSQLiteStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
}

func (s *SQLiteStore) SavePairingToken(ctx context.Context, token string, createdAtMs int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO pairing_tokens(token, created_at_ms, consumed_at_ms)
		VALUES (?, ?, NULL)
	`, token, createdAtMs)
	if err != nil {
		return fmt.Errorf("save pairing token: %w", err)
	}
	return nil
}

func (s *SQLiteStore) ConsumePairingToken(ctx context.Context, token string, consumedAtMs int64) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE pairing_tokens
		SET consumed_at_ms = ?
		WHERE token = ? AND consumed_at_ms IS NULL
	`, consumedAtMs, token)
	if err != nil {
		return fmt.Errorf("consume pairing token: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("consume pairing token rows affected: %w", err)
	}
	if rows != 1 {
		return ErrInvalidPairingToken
	}

	return nil
}

func (s *SQLiteStore) InsertPairedDevice(ctx context.Context, device StoredDevice) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO devices(device_id, name, auth_token, paired_at_ms)
		VALUES (?, ?, ?, ?)
	`, device.DeviceID, device.Name, device.AuthToken, device.PairedAtMs)
	if err != nil {
		return fmt.Errorf("insert paired device: %w", err)
	}
	return nil
}

func (s *SQLiteStore) FindByAuthToken(ctx context.Context, token string) (StoredDevice, error) {
	var device StoredDevice
	err := s.db.QueryRowContext(ctx, `
		SELECT device_id, name, auth_token, paired_at_ms
		FROM devices
		WHERE auth_token = ?
	`, token).Scan(&device.DeviceID, &device.Name, &device.AuthToken, &device.PairedAtMs)
	if errors.Is(err, sql.ErrNoRows) {
		return StoredDevice{}, ErrUnauthorized
	}
	if err != nil {
		return StoredDevice{}, fmt.Errorf("find device by auth token: %w", err)
	}

	return device, nil
}

var _ Store = (*SQLiteStore)(nil)

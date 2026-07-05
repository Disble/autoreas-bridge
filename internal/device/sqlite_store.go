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

func (s *SQLiteStore) FindActivePairingToken(ctx context.Context, createdAfterOrAtMs int64) (string, error) {
	var token string
	err := s.db.QueryRowContext(ctx, `
		SELECT token
		FROM pairing_tokens
		WHERE consumed_at_ms IS NULL
		  AND created_at_ms >= ?
		ORDER BY created_at_ms DESC
		LIMIT 1
	`, createdAfterOrAtMs).Scan(&token)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrInvalidPairingToken
	}
	if err != nil {
		return "", fmt.Errorf("find active pairing token: %w", err)
	}
	return token, nil
}

func (s *SQLiteStore) PruneExpiredPairingTokens(ctx context.Context, expiresBeforeMs int64) (int64, error) {
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM pairing_tokens
		WHERE consumed_at_ms IS NULL
		  AND created_at_ms < ?
	`, expiresBeforeMs)
	if err != nil {
		return 0, fmt.Errorf("prune expired pairing tokens: %w", err)
	}
	deleted, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("prune expired pairing token rows affected: %w", err)
	}
	return deleted, nil
}

func (s *SQLiteStore) ConsumePairingToken(ctx context.Context, token string, consumedAtMs int64, expiresBeforeMs int64) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE pairing_tokens
		SET consumed_at_ms = ?
		WHERE token = ?
		  AND consumed_at_ms IS NULL
		  AND created_at_ms >= ?
	`, consumedAtMs, token, expiresBeforeMs)
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

func (s *SQLiteStore) ListPairedDevices(ctx context.Context) ([]StoredDevice, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT device_id, name, auth_token, paired_at_ms
		FROM devices
		ORDER BY paired_at_ms ASC, device_id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list paired devices: %w", err)
	}
	defer rows.Close()

	devices := []StoredDevice{}
	for rows.Next() {
		var item StoredDevice
		if err := rows.Scan(&item.DeviceID, &item.Name, &item.AuthToken, &item.PairedAtMs); err != nil {
			return nil, fmt.Errorf("scan paired device: %w", err)
		}
		devices = append(devices, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate paired devices: %w", err)
	}
	return devices, nil
}

func (s *SQLiteStore) DeletePairedDevice(ctx context.Context, deviceID string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM devices WHERE device_id = ?`, deviceID); err != nil {
		return fmt.Errorf("delete paired device %q: %w", deviceID, err)
	}
	return nil
}

var _ Store = (*SQLiteStore)(nil)

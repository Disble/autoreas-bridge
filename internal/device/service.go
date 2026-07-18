package device

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"autoreas-bridge/internal/api/contracts"
)

// ErrInvalidPairingRequest reports malformed device-pairing input.
var ErrInvalidPairingRequest = errors.New("invalid pairing request")

// ErrInvalidPairingToken reports a missing, expired, or already-consumed pairing token.
var ErrInvalidPairingToken = errors.New("invalid pairing token")

// ErrUnauthorized reports an invalid or missing device authentication token.
var ErrUnauthorized = errors.New("unauthorized")

// PairingTokenTTL defines how long an unused pairing token remains valid.
const PairingTokenTTL = 10 * time.Minute

// PairDeviceRequest contains the client payload required to pair a device.
type PairDeviceRequest struct {
	PairingToken string
	DeviceName   string
}

// PairedDevice is the authenticated device view returned to API callers.
type PairedDevice struct {
	DeviceID  string
	Name      string
	AuthToken string
}

// StoredDevice is the persisted device record kept in storage.
type StoredDevice struct {
	DeviceID   string
	Name       string
	AuthToken  string
	PairedAtMs int64
}

// SyncState tracks per-device synchronization progress and pruning status.
type SyncState struct {
	DeviceID               string
	LastAckChangelogID     int64
	LastSeenAtMs           int64
	SyncStatus             string
	BlocksChangelogPruning bool
}

// SyncStateStore persists per-device synchronization state.
type SyncStateStore interface {
	ListDeviceSyncStates(ctx context.Context) ([]SyncState, error)
	MarkDeviceActive(ctx context.Context, deviceID string, atMs int64) error
	MarkDeviceRevoked(ctx context.Context, deviceID string, atMs int64) error
}

// Store persists pairing tokens and paired-device records.
type Store interface {
	SavePairingToken(ctx context.Context, token string, createdAtMs int64) error
	ConsumePairingToken(ctx context.Context, token string, consumedAtMs int64, expiresBeforeMs int64) error
	FindActivePairingToken(ctx context.Context, createdAfterOrAtMs int64) (string, error)
	PruneExpiredPairingTokens(ctx context.Context, expiresBeforeMs int64) (int64, error)
	InsertPairedDevice(ctx context.Context, device StoredDevice) error
	FindByAuthToken(ctx context.Context, token string) (StoredDevice, error)
	ListPairedDevices(ctx context.Context) ([]StoredDevice, error)
	DeletePairedDevice(ctx context.Context, deviceID string) error
}

// AuthService pairs devices and authenticates device tokens.
type AuthService interface {
	PairDevice(ctx context.Context, req PairDeviceRequest) (PairedDevice, error)
	AuthenticateToken(ctx context.Context, token string) (PairedDevice, error)
}

// AdminService lists and revokes paired devices for admin surfaces.
type AdminService interface {
	ListDevices(ctx context.Context) ([]contracts.DeviceInfo, error)
	RevokeDevice(ctx context.Context, id string) error
}

// Service implements device pairing, authentication, and admin operations.
type Service struct {
	store          Store
	syncStateStore SyncStateStore
	now            func() time.Time
	newToken       func() (string, error)
	newID          func() string
}

// NewService builds a device service over the provided persistence store.
func NewService(store Store) *Service {
	return &Service{
		store: store,
		now:   time.Now,
		newToken: func() (string, error) {
			return randomHexToken(16)
		},
		newID: func() string {
			token, err := randomHexToken(8)
			if err != nil {
				return ""
			}
			return "device-" + token
		},
	}
}

// SetSyncStateStore configures the optional synchronization-state backing store.
func (s *Service) SetSyncStateStore(store SyncStateStore) {
	if s == nil {
		return
	}
	s.syncStateStore = store
}

// PairDevice consumes a valid pairing token and provisions one authenticated device.
func (s *Service) PairDevice(ctx context.Context, req PairDeviceRequest) (PairedDevice, error) {
	if s == nil || s.store == nil {
		return PairedDevice{}, ErrUnauthorized
	}

	req.PairingToken = strings.TrimSpace(req.PairingToken)
	req.DeviceName = strings.TrimSpace(req.DeviceName)
	if req.PairingToken == "" || req.DeviceName == "" {
		return PairedDevice{}, ErrInvalidPairingRequest
	}

	pairedAtMs := s.pairingTime().UnixMilli()

	if err := s.store.ConsumePairingToken(ctx, req.PairingToken, pairedAtMs, pairedAtMs-PairingTokenTTL.Milliseconds()); err != nil {
		return PairedDevice{}, err
	}

	authToken, err := s.generateAuthToken()
	if err != nil {
		return PairedDevice{}, err
	}

	stored := StoredDevice{
		DeviceID:   s.generateDeviceID(),
		Name:       req.DeviceName,
		AuthToken:  authToken,
		PairedAtMs: pairedAtMs,
	}
	if stored.DeviceID == "" {
		return PairedDevice{}, errors.New("generate device id")
	}

	if err := s.store.InsertPairedDevice(ctx, stored); err != nil {
		return PairedDevice{}, err
	}
	if s.syncStateStore != nil {
		if err := s.syncStateStore.MarkDeviceActive(ctx, stored.DeviceID, pairedAtMs); err != nil {
			return PairedDevice{}, err
		}
	}

	return PairedDevice{
		DeviceID:  stored.DeviceID,
		Name:      stored.Name,
		AuthToken: stored.AuthToken,
	}, nil
}

// pairingTime returns the service clock time used for pairing operations.
func (s *Service) pairingTime() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

// generateAuthToken creates an authentication token using the configured generator.
func (s *Service) generateAuthToken() (string, error) {
	if s.newToken != nil {
		return s.newToken()
	}
	return randomHexToken(16)
}

// generateDeviceID creates a device identifier using the configured generator.
func (s *Service) generateDeviceID() string {
	if s.newID != nil {
		return s.newID()
	}
	token, err := randomHexToken(8)
	if err != nil {
		return ""
	}
	return "device-" + token
}

// AuthenticateToken resolves one bearer token into the paired-device identity it owns.
func (s *Service) AuthenticateToken(ctx context.Context, token string) (PairedDevice, error) {
	if s == nil || s.store == nil {
		return PairedDevice{}, ErrUnauthorized
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return PairedDevice{}, ErrUnauthorized
	}

	stored, err := s.store.FindByAuthToken(ctx, token)
	if err != nil {
		return PairedDevice{}, err
	}

	return PairedDevice{
		DeviceID:  stored.DeviceID,
		Name:      stored.Name,
		AuthToken: stored.AuthToken,
	}, nil
}

// ListDevices returns paired-device admin read models enriched with sync state.
func (s *Service) ListDevices(ctx context.Context) ([]contracts.DeviceInfo, error) {
	devices, err := s.store.ListPairedDevices(ctx)
	if err != nil {
		return nil, err
	}
	statesByDevice := map[string]SyncState{}
	if s.syncStateStore != nil {
		states, err := s.syncStateStore.ListDeviceSyncStates(ctx)
		if err != nil {
			return nil, err
		}
		for _, state := range states {
			statesByDevice[state.DeviceID] = state
		}
	}
	result := make([]contracts.DeviceInfo, 0, len(devices))
	for _, item := range devices {
		state := statesByDevice[item.DeviceID]
		syncStatus := state.SyncStatus
		if syncStatus == "" {
			syncStatus = "active"
		}
		connectionStatus := syncStatus
		if connectionStatus == "active" {
			connectionStatus = "disconnected"
		}
		result = append(result, contracts.DeviceInfo{
			DeviceID:               item.DeviceID,
			DeviceName:             item.Name,
			PairedAtMs:             item.PairedAtMs,
			LastSeenAtMs:           state.LastSeenAtMs,
			LastAckChangelogID:     state.LastAckChangelogID,
			SyncStatus:             syncStatus,
			ConnectionStatus:       connectionStatus,
			AuthState:              "active",
			BlocksChangelogPruning: state.BlocksChangelogPruning,
		})
	}
	return result, nil
}

// RevokeDevice removes one paired device and marks its sync state as revoked.
func (s *Service) RevokeDevice(ctx context.Context, id string) error {
	if err := s.store.DeletePairedDevice(ctx, id); err != nil {
		return err
	}
	if s.syncStateStore != nil {
		now := s.now
		if now == nil {
			now = time.Now
		}
		return s.syncStateStore.MarkDeviceRevoked(ctx, id, now().UnixMilli())
	}
	return nil
}

// randomHexToken returns cryptographically random hexadecimal bytes.
func randomHexToken(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

var _ AuthService = (*Service)(nil)
var _ AdminService = (*Service)(nil)

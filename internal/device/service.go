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

var (
	ErrInvalidPairingRequest = errors.New("invalid pairing request")
	ErrInvalidPairingToken   = errors.New("invalid pairing token")
	ErrUnauthorized          = errors.New("unauthorized")
)

const PairingTokenTTL = 10 * time.Minute

type PairDeviceRequest struct {
	PairingToken string
	DeviceName   string
}

type PairedDevice struct {
	DeviceID  string
	Name      string
	AuthToken string
}

type StoredDevice struct {
	DeviceID   string
	Name       string
	AuthToken  string
	PairedAtMs int64
}

type SyncState struct {
	DeviceID               string
	LastAckChangelogID     int64
	LastSeenAtMs           int64
	SyncStatus             string
	BlocksChangelogPruning bool
}

type SyncStateStore interface {
	ListDeviceSyncStates(ctx context.Context) ([]SyncState, error)
	MarkDeviceActive(ctx context.Context, deviceID string, atMs int64) error
	MarkDeviceRevoked(ctx context.Context, deviceID string, atMs int64) error
}

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

type AuthService interface {
	PairDevice(ctx context.Context, req PairDeviceRequest) (PairedDevice, error)
	AuthenticateToken(ctx context.Context, token string) (PairedDevice, error)
}

type AdminService interface {
	ListDevices(ctx context.Context) ([]contracts.DeviceInfo, error)
	RevokeDevice(ctx context.Context, id string) error
}

type Service struct {
	store          Store
	syncStateStore SyncStateStore
	now            func() time.Time
	newToken       func() (string, error)
	newID          func() string
}

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

func (s *Service) SetSyncStateStore(store SyncStateStore) {
	if s == nil {
		return
	}
	s.syncStateStore = store
}

func (s *Service) PairDevice(ctx context.Context, req PairDeviceRequest) (PairedDevice, error) {
	if s == nil || s.store == nil {
		return PairedDevice{}, ErrUnauthorized
	}

	req.PairingToken = strings.TrimSpace(req.PairingToken)
	req.DeviceName = strings.TrimSpace(req.DeviceName)
	if req.PairingToken == "" || req.DeviceName == "" {
		return PairedDevice{}, ErrInvalidPairingRequest
	}

	now := s.now
	if now == nil {
		now = time.Now
	}
	pairedAtMs := now().UnixMilli()

	if err := s.store.ConsumePairingToken(ctx, req.PairingToken, pairedAtMs, pairedAtMs-PairingTokenTTL.Milliseconds()); err != nil {
		return PairedDevice{}, err
	}

	newToken := s.newToken
	if newToken == nil {
		newToken = func() (string, error) { return randomHexToken(16) }
	}
	authToken, err := newToken()
	if err != nil {
		return PairedDevice{}, err
	}

	newID := s.newID
	if newID == nil {
		newID = func() string {
			token, err := randomHexToken(8)
			if err != nil {
				return ""
			}
			return "device-" + token
		}
	}

	stored := StoredDevice{
		DeviceID:   newID(),
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

func randomHexToken(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

var _ AuthService = (*Service)(nil)
var _ AdminService = (*Service)(nil)

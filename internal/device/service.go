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

type Store interface {
	SavePairingToken(ctx context.Context, token string, createdAtMs int64) error
	ConsumePairingToken(ctx context.Context, token string, consumedAtMs int64) error
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
	store    Store
	now      func() time.Time
	newToken func() (string, error)
	newID    func() string
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

	if err := s.store.ConsumePairingToken(ctx, req.PairingToken, pairedAtMs); err != nil {
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
	result := make([]contracts.DeviceInfo, 0, len(devices))
	for _, item := range devices {
		result = append(result, contracts.DeviceInfo{
			DeviceID:   item.DeviceID,
			DeviceName: item.Name,
			PairedAtMs: item.PairedAtMs,
		})
	}
	return result, nil
}

func (s *Service) RevokeDevice(ctx context.Context, id string) error {
	return s.store.DeletePairedDevice(ctx, id)
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

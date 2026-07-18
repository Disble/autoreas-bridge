package api

import (
	"context"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

type stubDeviceService struct {
	paired          device.PairedDevice
	pairErr         error
	authenticated   device.PairedDevice
	authenticateErr error
}

func (s stubDeviceService) IssuePairingToken(context.Context) (string, error) {
	return "", nil
}

func (s stubDeviceService) PairDevice(context.Context, device.PairDeviceRequest) (device.PairedDevice, error) {
	if s.pairErr != nil {
		return device.PairedDevice{}, s.pairErr
	}
	return s.paired, nil
}

func (s stubDeviceService) AuthenticateToken(context.Context, string) (device.PairedDevice, error) {
	if s.authenticateErr != nil {
		return device.PairedDevice{}, s.authenticateErr
	}
	return s.authenticated, nil
}

type stubAnimeQueryService struct {
	list []contracts.MobileAnime
	item *contracts.MobileAnime
}

func (s stubAnimeQueryService) GetEffectiveAnime(context.Context, string) (*contracts.EffectiveAnime, error) {
	return nil, nil
}

func (s stubAnimeQueryService) ListMobileAnimes(context.Context) ([]contracts.MobileAnime, error) {
	return s.list, nil
}

func (s stubAnimeQueryService) GetMobileAnime(context.Context, string) (*contracts.MobileAnime, error) {
	return s.item, nil
}

func (s stubAnimeQueryService) ListAnimeItems(context.Context) ([]contracts.AnimeListItem, error) {
	return nil, nil
}

func (s stubAnimeQueryService) ListAnimeHistory(context.Context) ([]contracts.AnimeHistoryItem, error) {
	return nil, nil
}

func (s stubAnimeQueryService) GetAnimeDetail(context.Context, string) (*contracts.AnimeDetail, error) {
	return nil, nil
}

type stubSyncService struct {
	changes []contracts.AnimeChange
	lastID  int64
	lastAt  *int64
}

func (s stubSyncService) TriggerReconcile(context.Context) error { return nil }
func (s stubSyncService) ListChangesSince(context.Context, int64) ([]contracts.AnimeChange, int64, error) {
	return s.changes, s.lastID, nil
}
func (s stubSyncService) ListChangesAfterID(context.Context, int64) ([]contracts.AnimeChange, int64, error) {
	return s.changes, s.lastID, nil
}
func (s stubSyncService) AcknowledgeDevice(context.Context, string, int64) error { return nil }
func (s stubSyncService) LastChangedAt(context.Context) (*int64, error)          { return s.lastAt, nil }

type stubStatusService struct{ status contracts.StatusInfo }

func (s stubStatusService) GetStatus(context.Context) (contracts.StatusInfo, error) {
	return s.status, nil
}

type stubDeviceAdminService struct{ devices []contracts.DeviceInfo }

func (s stubDeviceAdminService) ListDevices(context.Context) ([]contracts.DeviceInfo, error) {
	return s.devices, nil
}
func (s stubDeviceAdminService) RevokeDevice(context.Context, string) error { return nil }

type stubConflictService struct{}

func (stubConflictService) ListConflicts(context.Context) ([]contracts.ConflictInfo, error) {
	return []contracts.ConflictInfo{}, nil
}
func (stubConflictService) ResolveConflict(context.Context, string, time.Time) error { return nil }

var _ device.AuthService = stubDeviceService{}

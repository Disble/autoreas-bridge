package desktop

import (
	"context"

	"autoreas-bridge/internal/device"
	bridgeSync "autoreas-bridge/internal/sync"
)

type stubPendingLookup struct {
	pending []bridgeSync.ChangelogEntry
}

func (s stubPendingLookup) ListSinceTimestamp(context.Context, int64) ([]bridgeSync.ChangelogEntry, error) {
	return nil, nil
}

func (s stubPendingLookup) ListAfterID(context.Context, int64) ([]bridgeSync.ChangelogEntry, error) {
	return nil, nil
}

func (s stubPendingLookup) ListPending(context.Context) ([]bridgeSync.ChangelogEntry, error) {
	return append([]bridgeSync.ChangelogEntry(nil), s.pending...), nil
}

func (s stubPendingLookup) LastID(context.Context) (int64, error) {
	return 0, nil
}

func (s stubPendingLookup) LastChangedAt(context.Context) (*int64, error) {
	return nil, nil
}

func (s stubPendingLookup) AcknowledgeDevice(context.Context, string, int64, int64) error {
	return nil
}

func (s stubPendingLookup) PruneAcknowledgedChangelog(context.Context) (int64, error) {
	return 0, nil
}

type spyDeviceStore struct {
	stubAppDeviceStore
	savedToken  string
	saveErr     error
	activeToken string
	pruneCalls  int
}

func (s *spyDeviceStore) SavePairingToken(_ context.Context, token string, _ int64) error {
	s.savedToken = token
	return s.saveErr
}

func (s *spyDeviceStore) FindActivePairingToken(context.Context, int64) (string, error) {
	if s.activeToken == "" {
		return "", device.ErrInvalidPairingToken
	}
	return s.activeToken, nil
}

func (s *spyDeviceStore) PruneExpiredPairingTokens(context.Context, int64) (int64, error) {
	s.pruneCalls++
	return 0, nil
}

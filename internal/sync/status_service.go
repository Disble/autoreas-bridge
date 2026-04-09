package sync

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
)

type changelogStatusReader interface {
	LastID(ctx context.Context) (int64, error)
	LastChangedAt(ctx context.Context) (*int64, error)
}

type StatusService struct {
	changes changelogStatusReader
	address func() string
}

func NewStatusService(changes changelogStatusReader, address func() string) *StatusService {
	return &StatusService{changes: changes, address: address}
}

func (s *StatusService) GetStatus(ctx context.Context) (contracts.StatusInfo, error) {
	status := contracts.StatusInfo{Status: "ok"}
	if s.changes != nil {
		lastID, err := s.changes.LastID(ctx)
		if err != nil {
			return contracts.StatusInfo{}, fmt.Errorf("last changelog id: %w", err)
		}
		status.LastChangelogID = lastID
		lastChangedAt, err := s.changes.LastChangedAt(ctx)
		if err != nil {
			return contracts.StatusInfo{}, fmt.Errorf("last changed at: %w", err)
		}
		status.LastChangedAtMs = lastChangedAt
	}
	if s.address != nil {
		status.ServerAddress = s.address()
	}
	return status, nil
}

var _ contracts.StatusService = (*StatusService)(nil)

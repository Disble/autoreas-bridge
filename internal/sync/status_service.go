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

// StatusService reads the bridge status snapshot exposed to the UI and API.
type StatusService struct {
	changes    changelogStatusReader
	address    func() string
	seasonMode func(ctx context.Context) bool
}

// NewStatusService wires the status read-model. seasonMode is the bridge-owned
// global season-mode reader (preferences-backed); it may be nil, in which case
// GetStatus reports SeasonMode=false (the canonical default).
func NewStatusService(changes changelogStatusReader, address func() string, seasonMode func(ctx context.Context) bool) *StatusService {
	return &StatusService{changes: changes, address: address, seasonMode: seasonMode}
}

// GetStatus returns the current bridge status snapshot.
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
	if s.seasonMode != nil {
		status.SeasonMode = s.seasonMode(ctx)
	}
	return status, nil
}

var _ contracts.StatusService = (*StatusService)(nil)

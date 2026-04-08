package sync

import (
	"context"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

type TriggerService struct {
	bus events.Bus
}

func NewTriggerService(bus events.Bus) *TriggerService {
	return &TriggerService{bus: bus}
}

func (s *TriggerService) TriggerReconcile(context.Context) error {
	s.bus.Publish(events.SyncRequestedEvent{Requester: "rest-api"})
	return nil
}

var _ contracts.SyncTriggerService = (*TriggerService)(nil)

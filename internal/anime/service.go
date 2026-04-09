package anime

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

type snapshotLookup interface {
	GetSnapshot(ctx context.Context, animeID string) (SnapshotRecord, error)
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
}

type QueryService struct {
	store snapshotLookup
}

type WriteService struct {
	store snapshotLookup
	bus   events.Bus
	now   func() time.Time
}

func NewQueryService(store snapshotLookup) *QueryService {
	return &QueryService{store: store}
}

func NewWriteService(store snapshotLookup, bus events.Bus) *WriteService {
	return &WriteService{store: store, bus: bus, now: time.Now}
}

func (s *WriteService) SetNow(now func() time.Time) {
	s.now = now
}

func (s *QueryService) GetEffectiveAnime(ctx context.Context, id string) (*contracts.EffectiveAnime, error) {
	record, err := s.store.GetSnapshot(ctx, id)
	if err != nil {
		return nil, err
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(record.CanonicalJSON, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal snapshot %q: %w", id, err)
	}

	var activo *bool
	switch raw.Activo.TriState() {
	case domain.TriStateTrue:
		value := true
		activo = &value
	case domain.TriStateFalse:
		value := false
		activo = &value
	}

	return &contracts.EffectiveAnime{
		ID:           raw.ID,
		TotalCap:     raw.TotalCapValue(),
		Activo:       activo,
		SnapshotJSON: append([]byte(nil), record.CanonicalJSON...),
	}, nil
}

func (s *QueryService) ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error) {
	records, err := s.store.ListSnapshots(ctx)
	if err != nil {
		return nil, err
	}
	ids := sortedSnapshotIDs(records)
	result := make([]contracts.MobileAnime, 0, len(ids))
	for _, id := range ids {
		item, err := mobileAnimeFromSnapshot(records[id].CanonicalJSON)
		if err != nil {
			return nil, fmt.Errorf("normalize snapshot %q: %w", id, err)
		}
		result = append(result, item)
	}
	return result, nil
}

func (s *QueryService) GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error) {
	record, err := s.store.GetSnapshot(ctx, id)
	if err != nil {
		return nil, err
	}
	item, err := mobileAnimeFromSnapshot(record.CanonicalJSON)
	if err != nil {
		return nil, fmt.Errorf("normalize snapshot %q: %w", id, err)
	}
	return &item, nil
}

func (s *WriteService) PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) error {
	record, err := s.store.GetSnapshot(ctx, id)
	if err != nil {
		return err
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(record.CanonicalJSON, &raw); err != nil {
		return fmt.Errorf("unmarshal snapshot %q: %w", id, err)
	}

	if patch.Estado != nil {
		raw.SetEstado(*patch.Estado)
	}
	if patch.NroCapVisto != nil {
		raw.SetNroCapVisto(*patch.NroCapVisto)
	}
	if patch.Dias != nil {
		raw.SetDias(patch.Dias)
	}

	patch = domain.ApplyCompletionStateMachine(patch, raw.TotalCapValue())
	if patch.Estado != nil {
		raw.SetEstado(*patch.Estado)
	}

	now := s.now
	if now == nil {
		now = time.Now
	}
	raw.StampServerTimestamp(now())

	payload, err := raw.MarshalJSON()
	if err != nil {
		return fmt.Errorf("marshal merged anime %q: %w", id, err)
	}

	s.bus.Publish(events.AnimeUpdateRequestedEvent{AnimeID: id, Payload: payload})
	return nil
}

var _ contracts.AnimeQueryService = (*QueryService)(nil)
var _ contracts.AnimeWriteService = (*WriteService)(nil)

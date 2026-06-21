package anime

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

type snapshotLookup interface {
	GetSnapshot(ctx context.Context, animeID string) (SnapshotRecord, error)
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
}

type snapshotBaselineReplacer interface {
	ReplaceBaseline(ctx context.Context, current map[string]SnapshotRecord, pruneIDs []string) error
}

type QueryService struct {
	store snapshotLookup
}

type AnimeWriter interface {
	RequestWrite(ctx context.Context, animeID string, payload []byte) error
}

type WriteService struct {
	store  snapshotLookup
	writer AnimeWriter
	now    func() time.Time
}

func NewQueryService(store snapshotLookup) *QueryService {
	return &QueryService{store: store}
}

func NewWriteService(store snapshotLookup, writer AnimeWriter) *WriteService {
	return &WriteService{store: store, writer: writer, now: time.Now}
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

func (s *QueryService) ListAnimeItems(ctx context.Context) ([]contracts.AnimeListItem, error) {
	records, err := s.store.ListSnapshots(ctx)
	if err != nil {
		return nil, err
	}
	ids := sortedSnapshotIDs(records)
	result := make([]contracts.AnimeListItem, 0, len(ids))
	for _, id := range ids {
		item, err := mobileAnimeFromSnapshot(records[id].CanonicalJSON)
		if err != nil {
			return nil, fmt.Errorf("normalize snapshot %q: %w", id, err)
		}
		result = append(result, contracts.AnimeListItem{
			ID:          item.ID,
			Nombre:      item.Nombre,
			Estado:      item.Estado,
			NroCapVisto: item.NroCapVisto,
			TotalCap:    item.TotalCap,
			Activo:      item.Activo,
			Tipo:        item.Tipo,
			Dias:        extractDayNames(item.Dias),
			Generos:     item.Generos,
		})
	}
	return result, nil
}

func extractDayNames(days []contracts.MobileAnimeDay) []string {
	if len(days) == 0 {
		return []string{}
	}
	result := make([]string, 0, len(days))
	for _, day := range days {
		result = append(result, day.Dia)
	}
	return result
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

	if patch.FechaUltCapVisto != nil {
		raw.FechaUltCapVisto = domain.NewLegacyDateFieldFromUnixMilli(*patch.FechaUltCapVisto)
	} else {
		now := s.now
		if now == nil {
			now = time.Now
		}
		raw.StampServerTimestamp(now())
	}

	payload, err := raw.MarshalJSON()
	if err != nil {
		return fmt.Errorf("marshal merged anime %q: %w", id, err)
	}

	if s.writer == nil {
		return fmt.Errorf("anime writer is required")
	}

	if err := s.writer.RequestWrite(ctx, id, payload); err != nil {
		return err
	}

	if err := s.updateConfirmedSnapshot(ctx, id, payload); err != nil {
		return err
	}

	return nil
}

func (s *WriteService) updateConfirmedSnapshot(ctx context.Context, id string, payload []byte) error {
	replacer, ok := s.store.(snapshotBaselineReplacer)
	if !ok {
		return nil
	}

	records, err := s.store.ListSnapshots(ctx)
	if err != nil {
		return fmt.Errorf("list snapshots after confirmed write %q: %w", id, err)
	}
	records[id] = SnapshotRecord{
		AnimeID:       id,
		CanonicalJSON: append([]byte(nil), payload...),
		Hash:          HashSnapshot(payload),
	}
	if err := replacer.ReplaceBaseline(ctx, records, nil); err != nil {
		return fmt.Errorf("replace confirmed snapshot %q: %w", id, err)
	}

	return nil
}

var _ contracts.AnimeQueryService = (*QueryService)(nil)
var _ contracts.AnimeWriteService = (*WriteService)(nil)

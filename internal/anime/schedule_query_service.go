package anime

import (
	"context"
	"sort"

	"autoreas-bridge/internal/api/contracts"
)

type GetAnimeEditorScheduleBoardQuery struct {
	OriginAnimeID string
}

type ScheduleQueryService struct {
	query *QueryService
}

func NewScheduleQueryService(query *QueryService) *ScheduleQueryService {
	return &ScheduleQueryService{query: query}
}

func (s *ScheduleQueryService) GetEditorBoard(ctx context.Context, query GetAnimeEditorScheduleBoardQuery) (contracts.AnimeEditorScheduleBoard, error) {
	records, err := s.query.ListReadRecords(ctx)
	if err != nil {
		return contracts.AnimeEditorScheduleBoard{}, err
	}
	entries := make([]contracts.AnimeScheduleBoardEntry, 0, len(records))
	var boardModifiedAt int64
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Activo != 1 {
			continue
		}
		entries = append(entries, contracts.AnimeScheduleBoardEntry{
			AnimeID:           item.ID,
			Name:              item.Nombre,
			Active:            true,
			ModifiedAt:        item.ModifiedAt,
			Placements:        cloneMobileDays(item.Dias),
			Status:            item.Estado,
			Progress:          item.NroCapVisto,
			Cover:             item.Portada,
			OriginHighlighted: item.ID == query.OriginAnimeID,
		})
		if item.ModifiedAt > boardModifiedAt {
			boardModifiedAt = item.ModifiedAt
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].OriginHighlighted != entries[j].OriginHighlighted {
			return !entries[i].OriginHighlighted && entries[j].OriginHighlighted
		}
		return entries[i].Name < entries[j].Name
	})
	return contracts.AnimeEditorScheduleBoard{
		OriginAnimeID:   query.OriginAnimeID,
		BoardModifiedAt: boardModifiedAt,
		Destinations: []contracts.AnimeScheduleDestination{
			{ID: "Lunes", Label: "Lunes", Kind: "weekday"},
			{ID: "Martes", Label: "Martes", Kind: "weekday"},
			{ID: "Miércoles", Label: "Miércoles", Kind: "weekday"},
			{ID: "Jueves", Label: "Jueves", Kind: "weekday"},
			{ID: "Viernes", Label: "Viernes", Kind: "weekday"},
			{ID: "Sábado", Label: "Sábado", Kind: "weekday"},
			{ID: "Domingo", Label: "Domingo", Kind: "weekday"},
			{ID: "Sin ver", Label: "Sin ver", Kind: "special"},
			{ID: "Ver hoy", Label: "Ver hoy", Kind: "special"},
			{ID: "Visto", Label: "Visto", Kind: "special"},
		},
		Entries: entries,
	}, nil
}

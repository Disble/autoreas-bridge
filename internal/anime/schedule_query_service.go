package anime

import (
	"context"
	"sort"

	"autoreas-bridge/internal/api/contracts"
)

// GetAnimeEditorScheduleBoardQuery selects the context for the editor schedule board.
type GetAnimeEditorScheduleBoardQuery struct {
	OriginAnimeID string
}

// ScheduleQueryService builds read models for schedule-oriented UI surfaces.
type ScheduleQueryService struct {
	query *QueryService
}

// NewScheduleQueryService builds a schedule query service over the anime query service.
func NewScheduleQueryService(query *QueryService) *ScheduleQueryService {
	return &ScheduleQueryService{query: query}
}

// GetEditorBoard returns the normalized editor schedule board for one origin anime.
func (s *ScheduleQueryService) GetEditorBoard(ctx context.Context, query GetAnimeEditorScheduleBoardQuery) (contracts.AnimeEditorScheduleBoard, error) {
	records, err := s.query.ListReadRecords(ctx)
	if err != nil {
		return contracts.AnimeEditorScheduleBoard{}, err
	}
	normalizedPlacements := map[string][]contracts.MobileAnimeDay{}
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Active != 1 {
			continue
		}
		normalizedPlacements[item.ID] = cloneMobileDays(item.Days)
	}
	normalizedPlacements = normalizeSchedulePlacementsMap(normalizedPlacements)
	entries := make([]contracts.AnimeScheduleBoardEntry, 0, len(records))
	var boardModifiedAt int64
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Active != 1 {
			continue
		}
		entries = append(entries, contracts.AnimeScheduleBoardEntry{
			AnimeID:           item.ID,
			Name:              item.Name,
			Active:            true,
			ModifiedAt:        item.ModifiedAt,
			Placements:        cloneMobileDays(normalizedPlacements[item.ID]),
			Status:            item.Status,
			Progress:          item.EpisodesWatched,
			Cover:             item.Cover,
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

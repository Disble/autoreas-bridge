package desktop

import (
	"fmt"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

// AnimeCreatePlacementDTO is one wire schedule placement for a batch create item.
type AnimeCreatePlacementDTO struct {
	Day   string `json:"day"`
	Order int    `json:"order"`
}

// AnimeCreateCoverDTO is the optional wire cover payload for a batch-create row.
type AnimeCreateCoverDTO struct {
	Type string `json:"type"`
	Path string `json:"path"`
}

// AnimeCreateItemDTO is one wire batch-create row. Premiere date is never
// user-provided here: it is an auto lifecycle field set only when the first
// episode is watched, never at create time.
type AnimeCreateItemDTO struct {
	Nombre          string                    `json:"nombre"`
	Pagina          string                    `json:"pagina"`
	Dias            []AnimeCreatePlacementDTO `json:"dias"`
	Carpeta         string                    `json:"carpeta,omitempty"`
	Tipo            *int                      `json:"tipo,omitempty"`
	EpisodesWatched *int                      `json:"episodesWatched,omitempty"`
	TotalEpisodes   *int                      `json:"totalEpisodes,omitempty"`
	DurationMinutes *int                      `json:"durationMinutes,omitempty"`
	Origin          string                    `json:"origin,omitempty"`
	Genres          []string                  `json:"genres,omitempty"`
	Studios         []string                  `json:"studios,omitempty"`
	Cover           *AnimeCreateCoverDTO      `json:"cover,omitempty"`
}

// AnimeCreateNeighborDTO is one reflowed existing-neighbor entry for a batch create.
type AnimeCreateNeighborDTO struct {
	AnimeID        string                     `json:"animeId"`
	BaseModifiedAt int64                      `json:"baseModifiedAt"`
	Placements     []contracts.MobileAnimeDay `json:"placements"`
}

// AnimeCreateCommandDTO is the wire command for a batch anime create.
type AnimeCreateCommandDTO struct {
	Creates          []AnimeCreateItemDTO     `json:"creates"`
	ChangedNeighbors []AnimeCreateNeighborDTO `json:"changedNeighbors"`
}

// CreateAnime persists one or more new animes plus any reflowed existing
// neighbor placements as a single atomic batch create.
func (a *App) CreateAnime(command AnimeCreateCommandDTO) contracts.AnimeCreateResult {
	if a.animeCreateBatch == nil {
		return contracts.AnimeCreateResult{Outcome: contracts.AnimePatchOutcomeError, Message: "anime create service unavailable"}
	}
	creates := command.toCreates()
	neighbors := command.toNeighbors()
	result, err := a.animeCreateBatch.CreateBatch(a.appContext(), creates, neighbors)
	if err != nil {
		return contracts.AnimeCreateResult{Outcome: contracts.AnimePatchOutcomeError, Message: fmt.Sprintf("create anime batch: %v", err)}
	}
	return result
}

// toCreates maps the wire batch-create command into contract create requests.
func (d AnimeCreateCommandDTO) toCreates() []contracts.AnimeCreate {
	creates := make([]contracts.AnimeCreate, 0, len(d.Creates))
	for _, item := range d.Creates {
		dias := make([]contracts.Placement, 0, len(item.Dias))
		for _, placement := range item.Dias {
			dias = append(dias, contracts.Placement{Day: placement.Day, Order: placement.Order})
		}
		creates = append(creates, contracts.AnimeCreate{
			Nombre: item.Nombre, Pagina: item.Pagina, Dias: dias,
			Carpeta: item.Carpeta, Tipo: item.Tipo,
			EpisodesWatched: item.EpisodesWatched,
			TotalEpisodes:   item.TotalEpisodes,
			DurationMinutes: item.DurationMinutes,
			Origin:          item.Origin,
			Genres:          item.Genres,
			Studios:         item.Studios,
			Cover:           item.toContractCover(),
		})
	}
	return creates
}

// toContractCover maps the wire cover DTO into the contract cover, when present.
func (d AnimeCreateItemDTO) toContractCover() *contracts.AnimeCreateCover {
	if d.Cover == nil {
		return nil
	}
	return &contracts.AnimeCreateCover{Type: d.Cover.Type, Path: d.Cover.Path}
}

// toNeighbors maps the wire batch-create command into schedule draft entries
// for reflowed existing neighbors.
func (d AnimeCreateCommandDTO) toNeighbors() []anime.ApplyAnimeScheduleDraftEntry {
	neighbors := make([]anime.ApplyAnimeScheduleDraftEntry, 0, len(d.ChangedNeighbors))
	for _, neighbor := range d.ChangedNeighbors {
		neighbors = append(neighbors, anime.ApplyAnimeScheduleDraftEntry{
			AnimeID: neighbor.AnimeID, BaseModifiedAt: neighbor.BaseModifiedAt,
			Placements: append([]contracts.MobileAnimeDay{}, neighbor.Placements...),
		})
	}
	return neighbors
}

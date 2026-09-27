package desktop

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/season"
	seasondomain "autoreas-bridge/internal/season/domain"
)

// animeReadRecordLister is the narrow English read seam required by the season gateway.
type animeReadRecordLister interface {
	ListReadRecords(ctx context.Context) ([]anime.ReadRecord, error)
}

// seasonAnimeGateway adapts the anime services + snapshot store to
// season.AnimeGateway at the composition root.
type seasonAnimeGateway struct {
	writer  *anime.WriteService
	creator anime.Creator
	records animeReadRecordLister
}

func (g seasonAnimeGateway) CreateAnime(ctx context.Context, in season.AnimeCreateInput) (season.AnimeMutationResult, error) {
	if g.creator == nil {
		return season.AnimeMutationResult{}, fmt.Errorf("canonical anime create service is required")
	}
	order, err := g.nextOrden(ctx, in.Section)
	if err != nil {
		return season.AnimeMutationResult{}, err
	}
	create := contracts.AnimeCreate{
		Nombre:  in.Nombre,
		Pagina:  in.Pagina,
		Dias:    []contracts.Placement{{Day: in.Section, Order: order}},
		Carpeta: in.Carpeta,
		Tipo:    in.Tipo,
	}
	applyCreateMetadata(&create, in.Metadata)
	result, err := g.creator.CreateAnime(ctx, create)
	if err != nil {
		return season.AnimeMutationResult{}, err
	}
	return toSeasonAnimeMutation(result), nil
}

// applyCreateMetadata fills the allow-listed create fields from one row's
// confirmed MyAnimeList metadata, and nothing else. The title is deliberately
// absent from the metadata: create.Nombre is already the intake row's raw name,
// which is what the user typed, so a confirmed MyAnimeList title can never rename
// the anime. The cover is forwarded in the metadata's own typed {type, path}
// shape instead of a synthesized one. The premiere/first-watch date has no field
// here at all — it is derived from an observed watched-progress transition, never
// authored at creation.
func applyCreateMetadata(create *contracts.AnimeCreate, metadata *season.AnimeCreateMetadata) {
	if metadata == nil {
		return
	}
	if metadata.Kind != nil {
		create.Tipo = metadata.Kind
	}
	create.TotalEpisodes = metadata.TotalEpisodes
	create.DurationMinutes = metadata.DurationMinutes
	create.Origin = metadata.Origin
	if len(metadata.Genres) > 0 {
		create.Genres = metadata.Genres
	}
	if len(metadata.Studios) > 0 {
		create.Studios = metadata.Studios
	}
	if metadata.Cover != nil && metadata.Cover.Path != "" {
		create.Cover = &contracts.AnimeCreateCover{Type: metadata.Cover.Type, Path: metadata.Cover.Path}
	}
}

func (g seasonAnimeGateway) MoveToSection(ctx context.Context, animeID, section string) (season.AnimeMutationResult, error) {
	result, err := g.writer.PatchAnime(ctx, animeID, contracts.AnimePatch{
		Dias:                []string{section},
		PreserveLastWatched: true,
	})
	return toSeasonAnimeMutation(result), err
}

func (g seasonAnimeGateway) SetSelection(ctx context.Context, animeID string, estado int, activo bool) (season.AnimeMutationResult, error) {
	result, err := g.writer.PatchAnime(ctx, animeID, contracts.AnimePatch{
		Estado:              &estado,
		Activo:              &activo,
		PreserveLastWatched: true,
	})
	return toSeasonAnimeMutation(result), err
}

func (g seasonAnimeGateway) SetAnimeSchedule(ctx context.Context, animeID string, dias []seasondomain.Placement) (season.AnimeMutationResult, error) {
	days := make([]contracts.MobileAnimeDay, 0, len(dias))
	for _, day := range dias {
		days = append(days, contracts.MobileAnimeDay{Day: day.Dia, Order: day.Orden})
	}
	result, err := g.writer.PatchAnime(ctx, animeID, contracts.AnimePatch{
		DiasOrdered:         days,
		PreserveLastWatched: true,
	})
	return toSeasonAnimeMutation(result), err
}

// toSeasonAnimeMutation maps an anime patch result to a season mutation result.
func toSeasonAnimeMutation(result anime.PatchResult) season.AnimeMutationResult {
	return season.AnimeMutationResult{
		AnimeID: result.AnimeID, Outcome: season.AnimeMutationOutcome(result.Outcome),
		ModifiedAt: result.ModifiedAt, ConflictID: result.ConflictID,
	}
}

func (g seasonAnimeGateway) CurrentPlacements(ctx context.Context, animeIDs []string) (map[string][]seasondomain.Placement, error) {
	records, err := g.records.ListReadRecords(ctx)
	if err != nil {
		return nil, err
	}
	want := make(map[string]struct{}, len(animeIDs))
	for _, id := range animeIDs {
		want[id] = struct{}{}
	}
	out := map[string][]seasondomain.Placement{}
	for _, record := range records {
		id := record.Value.ID
		if _, ok := want[id]; !ok {
			continue
		}
		var placements []seasondomain.Placement
		for _, day := range record.Value.Days {
			placements = append(placements, seasondomain.Placement{Dia: day.Day, Orden: int(day.Order)})
		}
		out[id] = placements
	}
	return out, nil
}

func (g seasonAnimeGateway) FindActiveByPagina(ctx context.Context, pageURL string) (string, bool, error) {
	records, err := g.records.ListReadRecords(ctx)
	if err != nil {
		return "", false, err
	}
	for _, record := range records {
		if record.Value.Active != domain.TriStateTrue {
			continue
		}
		if page := record.Value.SourceURL; page != nil && *page == pageURL {
			return record.Value.ID, true, nil
		}
	}
	return "", false, nil
}

// nextOrden returns the next available order within a season section.
func (g seasonAnimeGateway) nextOrden(ctx context.Context, section string) (int, error) {
	records, err := g.records.ListReadRecords(ctx)
	if err != nil {
		return 0, fmt.Errorf("list anime read records for next order: %w", err)
	}
	maxOrder := 0
	for _, record := range records {
		for _, day := range record.Value.Days {
			if day.Day == section && int(day.Order) > maxOrder {
				maxOrder = int(day.Order)
			}
		}
	}
	return maxOrder + 1, nil
}

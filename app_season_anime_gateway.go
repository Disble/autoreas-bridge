package main

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/season"
	seasondomain "autoreas-bridge/internal/season/domain"
)

// seasonAnimeMetadataProvider exposes only facts the current source can prove.
// Episode listings know the latest aired episode, not the announced total,
// duration, or cover, so those canonical fields remain unknown.
type seasonAnimeMetadataProvider struct {
	registry siteResolver
}

func (p seasonAnimeMetadataProvider) Lookup(ctx context.Context, pageURL string) (anime.CreateMetadata, error) {
	source, err := p.registry.Resolve(pageURL)
	if err != nil {
		return anime.CreateMetadata{}, fmt.Errorf("resolve anime metadata source: %w", err)
	}
	listing, err := source.ListEpisodes(ctx, pageURL)
	if err != nil {
		return anime.CreateMetadata{}, fmt.Errorf("list anime metadata source: %w", err)
	}
	if listing.LatestEpisode < 0 {
		return anime.CreateMetadata{}, nil
	}
	latest := listing.LatestEpisode
	return anime.CreateMetadata{LatestEpisode: &latest}, nil
}

// animeReadRecordLister is the narrow English read seam required by the season gateway.
type animeReadRecordLister interface {
	ListReadRecords(ctx context.Context) ([]anime.ReadRecord, error)
}

// seasonAnimeGateway adapts the anime services + snapshot store to
// season.AnimeGateway at the composition root.
type seasonAnimeGateway struct {
	writer  *anime.WriteService
	creator anime.AnimeCreator
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
	result, err := g.creator.CreateAnime(ctx, contracts.AnimeCreate{
		Nombre:  in.Nombre,
		Pagina:  in.Pagina,
		Section: in.Section,
		Orden:   order,
		Carpeta: in.Carpeta,
		Tipo:    in.Tipo,
	})
	if err != nil {
		return season.AnimeMutationResult{}, err
	}
	return toSeasonAnimeMutation(result), nil
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
		days = append(days, contracts.MobileAnimeDay{Dia: day.Dia, Orden: day.Orden})
	}
	result, err := g.writer.PatchAnime(ctx, animeID, contracts.AnimePatch{
		DiasOrdered:         days,
		PreserveLastWatched: true,
	})
	return toSeasonAnimeMutation(result), err
}

func toSeasonAnimeMutation(result anime.AnimePatchResult) season.AnimeMutationResult {
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

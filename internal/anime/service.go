package anime

import (
	"context"
	"sort"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/api/contracts"
)

type snapshotLookup interface {
	GetSnapshot(ctx context.Context, animeID string) (SnapshotRecord, error)
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
}

// QueryService projects canonical anime snapshots into transport read models.
type QueryService struct {
	store snapshotLookup
}

// ReadRecord is the English contract returned by the Legacy gateway. Wire
// vocabulary and JSON mechanics remain inside internal/anime/legacy.
type ReadRecord struct {
	Snapshot SnapshotRecord
	Value    domain.Anime
}

// Creator is the application-facing canonical Create port. It returns the
// authoritative write token rather than projecting the result to an id alone.
type Creator interface {
	CreateAnime(context.Context, contracts.AnimeCreate) (PatchResult, error)
}

// NewQueryService builds a read-model query service over the shared snapshot store.
func NewQueryService(store snapshotLookup) *QueryService {
	return &QueryService{store: store}
}

// GetEffectiveAnime returns the snapshot payload and effective active state for one anime.
func (s *QueryService) GetEffectiveAnime(ctx context.Context, id string) (*contracts.EffectiveAnime, error) {
	record, err := s.GetReadRecord(ctx, id)
	if err != nil {
		return nil, err
	}

	var activo *bool
	switch record.Value.Active {
	case domain.TriStateTrue:
		value := true
		activo = &value
	case domain.TriStateFalse:
		value := false
		activo = &value
	}

	return &contracts.EffectiveAnime{
		ID:           record.Value.ID,
		TotalCap:     record.Value.TotalEpisodes,
		Activo:       activo,
		SnapshotJSON: append([]byte(nil), record.Snapshot.CanonicalJSON...),
	}, nil
}

// GetReadRecord loads one snapshot through the shared Legacy gateway and
// exposes only the English aggregate plus Bridge-owned snapshot metadata.
func (s *QueryService) GetReadRecord(ctx context.Context, id string) (ReadRecord, error) {
	record, value, err := s.legacyGateway().Get(ctx, id)
	return ReadRecord{Snapshot: fromLegacySnapshot(record), Value: value}, err
}

// ListReadRecords loads every effective snapshot through the shared Legacy
// gateway without exposing the lossless wire envelope to application code.
func (s *QueryService) ListReadRecords(ctx context.Context) ([]ReadRecord, error) {
	records, err := s.legacyGateway().List(ctx)
	result := make([]ReadRecord, 0, len(records))
	for _, record := range records {
		result = append(result, ReadRecord{
			Snapshot: fromLegacySnapshot(record.Snapshot),
			Value:    record.Anime,
		})
	}
	return result, err
}

// ListMobileAnimes returns the mobile anime list projection for every effective snapshot.
func (s *QueryService) ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error) {
	records, err := s.ListReadRecords(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]contracts.MobileAnime, 0, len(records))
	for _, record := range records {
		result = append(result, mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt))
	}
	return result, nil
}

// ListAnimeItems returns the compact desktop list projection for every effective snapshot.
func (s *QueryService) ListAnimeItems(ctx context.Context) ([]contracts.AnimeListItem, error) {
	records, err := s.ListReadRecords(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]contracts.AnimeListItem, 0, len(records))
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		result = append(result, contracts.AnimeListItem{
			ID:              item.ID,
			Nombre:          item.Nombre,
			Estado:          item.Estado,
			NroCapVisto:     item.NroCapVisto,
			TotalCap:        item.TotalCap,
			Activo:          item.Activo,
			Tipo:            item.Tipo,
			Dias:            extractDayNames(item.Dias),
			Generos:         item.Generos,
			HasDownloadPage: hasNonEmptyLegacyString(item.Pagina),
			HasFolder:       hasNonEmptyLegacyString(item.Carpeta),
		})
	}
	return result, nil
}

// ListAnimeHistory projects the same snapshot set as ListAnimeItems into the
// slim watch-activity read model (Anime History spec, "History Read Model"):
// membership requires a present FechaUltCapVisto (absent rows excluded), and
// the result is sorted DESC by it. Soft-deleted/inactive animes are NOT
// filtered out here, mirroring ListAnimeItems's existing behavior (verified:
// TestQueryServiceListAnimeItemsReturnsActiveAndInactive) -- History is an
// activity log, so an eliminated-but-watched anime stays listed with its
// estado, matching Legacy's "Historial" screen.
// ListAnimeHistory returns the history read model sorted by last-watched descending.
func (s *QueryService) ListAnimeHistory(ctx context.Context) ([]contracts.AnimeHistoryItem, error) {
	records, err := s.ListReadRecords(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]contracts.AnimeHistoryItem, 0, len(records))
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.FechaUltCapVisto == nil {
			continue
		}
		result = append(result, contracts.AnimeHistoryItem{
			ID:               item.ID,
			Nombre:           item.Nombre,
			NroCapVisto:      item.NroCapVisto,
			FechaUltCapVisto: *item.FechaUltCapVisto,
			Estado:           item.Estado,
			Tipo:             item.Tipo,
			FechaCreacion:    item.FechaCreacion,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].FechaUltCapVisto > result[j].FechaUltCapVisto
	})
	return result, nil
}

// hasNonEmptyLegacyString reports whether a legacy optional string field (e.g.
// MobileAnime.Pagina/Carpeta) is present and non-empty. Mirrors the same
// nil-or-empty presence check already used by the download decision engine
// (internal/download/decision.go) so the AnimePanel gap indicator and the
// download skip logic agree on what counts as "missing".
func hasNonEmptyLegacyString(value *string) bool {
	return value != nil && *value != ""
}

// legacyStringValue unwraps a legacy optional string field (e.g.
// MobileAnime.Pagina/Carpeta) to its literal value, or "" when absent.
// Companion to hasNonEmptyLegacyString for callers (ChapterScheduleItem)
// that expose the literal string itself rather than a presence boolean.
func legacyStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// extractDayNames returns the names from mobile anime day placements.
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

// GetMobileAnime returns one mobile anime projection by id.
func (s *QueryService) GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error) {
	record, err := s.GetReadRecord(ctx, id)
	if err != nil {
		return nil, err
	}
	item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
	return &item, nil
}

// GetAnimeDetail returns the richer anime detail projection by id.
func (s *QueryService) GetAnimeDetail(ctx context.Context, id string) (*contracts.AnimeDetail, error) {
	item, err := s.GetMobileAnime(ctx, id)
	if err != nil {
		return nil, err
	}

	return animeDetailFromMobile(*item), nil
}

// GetAnimeEditorRecord returns the editor-focused projection for one anime.
func (s *QueryService) GetAnimeEditorRecord(ctx context.Context, id string) (*contracts.AnimeEditorRecord, error) {
	record, err := s.GetReadRecord(ctx, id)
	if err != nil {
		return nil, err
	}
	fields := decodeSnapshotFields(record.Snapshot.CanonicalJSON)
	item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
	result := &contracts.AnimeEditorRecord{
		AnimeID:    item.ID,
		ModifiedAt: item.ModifiedAt,
		Frequent: contracts.AnimeEditorFrequentFields{
			Name:          item.Nombre,
			Status:        item.Estado,
			Progress:      item.NroCapVisto,
			TotalEpisodes: editorNullableIntFromFields(fields, "totalcap"),
			Active:        item.Activo == 1,
			Kind:          editorNullableIntFromFields(fields, "tipo"),
			Page:          editorNullableStringFromFields(fields, "pagina"),
			Folder:        editorNullableStringFromFields(fields, "carpeta"),
			Placements:    cloneMobileDays(item.Dias),
		},
		Details: contracts.AnimeEditorDetailFields{
			PremieredAt: editorNullableTimeFromFields(fields, "fechaEstreno"),
			Duration:    editorNullableIntFromFields(fields, "duracion"),
			Origin:      editorNullableStringFromFields(fields, "origen"),
			Genres:      editorStringListFromFields(fields, "generos"),
			Studios:     editorStringListFromFields(fields, "estudios"),
			Cover:       editorCoverFromFields(fields),
		},
	}
	return result, nil
}

// animeDetailFromMobile converts the mobile read model to an anime detail.
func animeDetailFromMobile(item contracts.MobileAnime) *contracts.AnimeDetail {
	return &contracts.AnimeDetail{
		ID:         item.ID,
		Nombre:     item.Nombre,
		Estado:     item.Estado,
		Activo:     item.Activo,
		PrimeraVez: item.PrimeraVez,
		Progress: contracts.AnimeDetailProgress{
			Watched:   item.NroCapVisto,
			Total:     item.TotalCap,
			Remaining: remainingChapters(item.NroCapVisto, item.TotalCap),
		},
		Schedule: item.Dias,
		Dates: contracts.AnimeDetailDates{
			Created:     item.FechaCreacion,
			FirstWatch:  item.FechaEstreno,
			LastWatched: item.FechaUltCapVisto,
			Deleted:     item.FechaEliminacion,
		},
		Content: contracts.AnimeDetailContent{
			Tipo:     item.Tipo,
			Duracion: item.Duracion,
			Generos:  item.Generos,
			Studios:  item.Estudios,
			Origen:   item.Origen,
			Cover:    item.Portada,
		},
		Download: contracts.AnimeDetailDownload{
			Page:   item.Pagina,
			Folder: item.Carpeta,
		},
		ModifiedAt: item.ModifiedAt,
	}
}

// remainingChapters calculates the number of unwatched chapters when known.
func remainingChapters(watched float64, total *int) *float64 {
	if total == nil {
		return nil
	}
	value := float64(*total) - watched
	return &value
}

// legacyGateway builds the gateway used for legacy snapshot queries.
func (s *QueryService) legacyGateway() *legacy.Gateway {
	return legacy.NewGateway(legacy.GatewayConfig{
		LoadSnapshot: func(ctx context.Context, id string) (legacy.Snapshot, error) {
			record, err := s.store.GetSnapshot(ctx, id)
			return toLegacySnapshot(record), err
		},
		ListSnapshots: func(ctx context.Context) (map[string]legacy.Snapshot, error) {
			records, err := s.store.ListSnapshots(ctx)
			result := make(map[string]legacy.Snapshot, len(records))
			for id, record := range records {
				result[id] = toLegacySnapshot(record)
			}
			return result, err
		},
	})
}

// fromLegacySnapshot converts a legacy snapshot to the anime snapshot record.
func fromLegacySnapshot(record legacy.Snapshot) SnapshotRecord {
	return SnapshotRecord{
		AnimeID: record.AnimeID, CanonicalJSON: append([]byte(nil), record.CanonicalJSON...),
		Hash: record.Hash, ModifiedAt: record.ModifiedAt,
	}
}

var _ contracts.AnimeQueryService = (*QueryService)(nil)
var _ contracts.AnimeWriteService = (*WriteService)(nil)

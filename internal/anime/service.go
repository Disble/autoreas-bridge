package anime

import (
	"context"
	"sort"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
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
// vocabulary and JSON mechanics remain inside internal/anime/store.
type ReadRecord struct {
	Snapshot SnapshotRecord
	Value    domain.Anime
}

// Creator is the application-facing canonical Create port. It returns the
// authoritative write token rather than projecting the result to an id alone.
type Creator interface {
	CreateAnime(context.Context, contracts.AnimeCreate) (PatchResult, error)
}

// BatchCreator is the application-facing atomic batch Create port: it
// persists one or more new animes plus any reflowed existing neighbor
// placements in a single atomic transaction.
type BatchCreator interface {
	CreateBatch(context.Context, []contracts.AnimeCreate, []ApplyAnimeScheduleDraftEntry) (contracts.AnimeCreateResult, error)
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
			Name:            item.Name,
			Status:          item.Status,
			EpisodesWatched: item.EpisodesWatched,
			TotalEpisodes:   item.TotalEpisodes,
			Active:          item.Active,
			Kind:            item.Kind,
			Days:            extractDayNames(item.Days),
			Genres:          item.Genres,
			HasDownloadPage: hasNonEmptyLegacyString(item.SourceURL),
			HasFolder:       hasNonEmptyLegacyString(item.Folder),
		})
	}
	return result, nil
}

// ListAnimeHistory projects the same snapshot set as ListAnimeItems into the
// slim watch-activity read model (Anime History spec, "History Read Model"):
// membership requires a present LastWatchedAt (absent rows excluded), and
// the result is sorted DESC by it. Soft-deleted/inactive animes are NOT
// filtered out here, mirroring ListAnimeItems's existing behavior (verified:
// TestQueryServiceListAnimeItemsReturnsActiveAndInactive) -- History is an
// activity log, so an eliminated-but-watched anime stays listed with its
// status, matching Legacy's "Historial" screen.
// ListAnimeHistory returns the history read model sorted by last-watched descending.
func (s *QueryService) ListAnimeHistory(ctx context.Context) ([]contracts.AnimeHistoryItem, error) {
	records, err := s.ListReadRecords(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]contracts.AnimeHistoryItem, 0, len(records))
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.LastWatchedAt == nil {
			continue
		}
		result = append(result, contracts.AnimeHistoryItem{
			ID:              item.ID,
			Name:            item.Name,
			EpisodesWatched: item.EpisodesWatched,
			LastWatchedAt:   *item.LastWatchedAt,
			Status:          item.Status,
			Kind:            item.Kind,
			CreatedAt:       item.CreatedAt,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].LastWatchedAt > result[j].LastWatchedAt
	})
	return result, nil
}

// hasNonEmptyLegacyString reports whether a legacy optional string field (e.g.
// MobileAnime.SourceURL/Folder) is present and non-empty. Mirrors the same
// nil-or-empty presence check already used by the download decision engine
// (internal/download/decision.go) so the AnimePanel gap indicator and the
// download skip logic agree on what counts as "missing".
func hasNonEmptyLegacyString(value *string) bool {
	return value != nil && *value != ""
}

// legacyStringValue unwraps a legacy optional string field (e.g.
// MobileAnime.SourceURL/Folder) to its literal value, or "" when absent.
// Companion to hasNonEmptyLegacyString for callers (EpisodeScheduleItem)
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
		result = append(result, day.Day)
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
			Name:          item.Name,
			Status:        item.Status,
			Progress:      item.EpisodesWatched,
			TotalEpisodes: editorNullableIntFromFields(fields, "totalEpisodes"),
			Active:        item.Active == 1,
			Kind:          editorNullableIntFromFields(fields, "kind"),
			Page:          editorNullableStringFromFields(fields, "sourceUrl"),
			Folder:        editorNullableStringFromFields(fields, "folder"),
			Placements:    cloneMobileDays(item.Days),
		},
		Details: contracts.AnimeEditorDetailFields{
			PremieredAt: editorNullableTimeFromFields(fields, "premieredAt"),
			Duration:    editorNullableIntFromFields(fields, "durationMinutes"),
			Origin:      editorNullableStringFromFields(fields, "origin"),
			Genres:      editorStringListFromFields(fields, "genres"),
			Studios:     editorStringListFromFields(fields, "studios"),
			Cover:       editorCoverFromFields(fields),
		},
	}
	return result, nil
}

// animeDetailFromMobile converts the mobile read model to an anime detail.
func animeDetailFromMobile(item contracts.MobileAnime) *contracts.AnimeDetail {
	return &contracts.AnimeDetail{
		ID:         item.ID,
		Name:       item.Name,
		Status:     item.Status,
		Active:     item.Active,
		FirstCycle: item.FirstCycle,
		Progress: contracts.AnimeDetailProgress{
			Watched:   item.EpisodesWatched,
			Total:     item.TotalEpisodes,
			Remaining: remainingEpisodes(item.EpisodesWatched, item.TotalEpisodes),
		},
		Schedule: item.Days,
		Dates: contracts.AnimeDetailDates{
			Created:     item.CreatedAt,
			FirstWatch:  item.PremieredAt,
			LastWatched: item.LastWatchedAt,
			Deleted:     item.DeletedAt,
		},
		Content: contracts.AnimeDetailContent{
			Kind:            item.Kind,
			DurationMinutes: item.DurationMinutes,
			Genres:          item.Genres,
			Studios:         item.Studios,
			Origin:          item.Origin,
			Cover:           item.Cover,
		},
		Download: contracts.AnimeDetailDownload{
			Page:   item.SourceURL,
			Folder: item.Folder,
		},
		ModifiedAt: item.ModifiedAt,
	}
}

// remainingEpisodes calculates the number of unwatched episodes when known.
func remainingEpisodes(watched float64, total *int) *float64 {
	if total == nil {
		return nil
	}
	value := float64(*total) - watched
	return &value
}

// legacyGateway builds the gateway used for legacy snapshot queries.
func (s *QueryService) legacyGateway() *store.Gateway {
	return store.NewGateway(store.GatewayConfig{
		LoadSnapshot: func(ctx context.Context, id string) (store.Snapshot, error) {
			record, err := s.store.GetSnapshot(ctx, id)
			return toLegacySnapshot(record), err
		},
		ListSnapshots: func(ctx context.Context) (map[string]store.Snapshot, error) {
			records, err := s.store.ListSnapshots(ctx)
			result := make(map[string]store.Snapshot, len(records))
			for id, record := range records {
				result[id] = toLegacySnapshot(record)
			}
			return result, err
		},
	})
}

// fromLegacySnapshot converts a legacy snapshot to the anime snapshot record.
func fromLegacySnapshot(record store.Snapshot) SnapshotRecord {
	return SnapshotRecord{
		AnimeID: record.AnimeID, CanonicalJSON: append([]byte(nil), record.CanonicalJSON...),
		Hash: record.Hash, ModifiedAt: record.ModifiedAt,
	}
}

var _ contracts.AnimeQueryService = (*QueryService)(nil)
var _ contracts.AnimePatcher = (*WriteService)(nil)

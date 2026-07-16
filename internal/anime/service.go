package anime

import (
	"context"
	"encoding/json"
	"sort"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/api/contracts"
)

type snapshotLookup interface {
	GetSnapshot(ctx context.Context, animeID string) (SnapshotRecord, error)
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
}

type QueryService struct {
	store snapshotLookup
}

// ReadRecord is the English contract returned by the Legacy gateway. Wire
// vocabulary and JSON mechanics remain inside internal/anime/legacy.
type ReadRecord struct {
	Snapshot SnapshotRecord
	Value    domain.Anime
}

// AnimeCreator is the application-facing canonical Create port. It returns the
// authoritative write token rather than projecting the result to an id alone.
type AnimeCreator interface {
	CreateAnime(context.Context, contracts.AnimeCreate) (AnimePatchResult, error)
}

func NewQueryService(store snapshotLookup) *QueryService {
	return &QueryService{store: store}
}

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
	record, err := s.GetReadRecord(ctx, id)
	if err != nil {
		return nil, err
	}
	item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
	return &item, nil
}

func (s *QueryService) GetAnimeDetail(ctx context.Context, id string) (*contracts.AnimeDetail, error) {
	item, err := s.GetMobileAnime(ctx, id)
	if err != nil {
		return nil, err
	}

	return animeDetailFromMobile(*item), nil
}

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

func remainingChapters(watched float64, total *int) *float64 {
	if total == nil {
		return nil
	}
	value := float64(*total) - watched
	return &value
}

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

func fromLegacySnapshot(record legacy.Snapshot) SnapshotRecord {
	return SnapshotRecord{
		AnimeID: record.AnimeID, CanonicalJSON: append([]byte(nil), record.CanonicalJSON...),
		Hash: record.Hash, ModifiedAt: record.ModifiedAt,
	}
}

func decodeSnapshotFields(payload []byte) map[string]json.RawMessage {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return map[string]json.RawMessage{}
	}
	return fields
}

func cloneMobileDays(days []contracts.MobileAnimeDay) []contracts.MobileAnimeDay {
	return append([]contracts.MobileAnimeDay{}, days...)
}

func editorStringListFromFields(fields map[string]json.RawMessage, key string) contracts.AnimeEditorStringListDTO {
	value, exists := fields[key]
	if !exists {
		return contracts.AnimeEditorStringListDTO{Kind: contracts.AnimeEditorValueKindMissing, Values: []string{}}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorStringListDTO{Kind: contracts.AnimeEditorValueKindNull, Values: []string{}}
	}
	var values []string
	if err := json.Unmarshal(value, &values); err == nil {
		return contracts.AnimeEditorStringListDTO{Kind: contracts.AnimeEditorValueKindValue, Values: append([]string{}, values...)}
	}
	return contracts.AnimeEditorStringListDTO{Kind: contracts.AnimeEditorValueKindMissing, Values: []string{}}
}

func editorNullableStringFromFields(fields map[string]json.RawMessage, key string) contracts.AnimeEditorNullableStringDTO {
	value, exists := fields[key]
	if !exists {
		return contracts.AnimeEditorNullableStringDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorNullableStringDTO{Kind: contracts.AnimeEditorValueKindNull}
	}
	var decoded string
	if json.Unmarshal(value, &decoded) != nil {
		return contracts.AnimeEditorNullableStringDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	return contracts.AnimeEditorNullableStringDTO{Kind: contracts.AnimeEditorValueKindValue, Value: decoded}
}

func editorNullableIntFromFields(fields map[string]json.RawMessage, key string) contracts.AnimeEditorNullableIntDTO {
	value, exists := fields[key]
	if !exists {
		return contracts.AnimeEditorNullableIntDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorNullableIntDTO{Kind: contracts.AnimeEditorValueKindNull}
	}
	var decoded int
	if json.Unmarshal(value, &decoded) != nil {
		return contracts.AnimeEditorNullableIntDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	return contracts.AnimeEditorNullableIntDTO{Kind: contracts.AnimeEditorValueKindValue, Value: decoded}
}

func editorNullableTimeFromFields(fields map[string]json.RawMessage, key string) contracts.AnimeEditorNullableTimeDTO {
	value, exists := fields[key]
	if !exists {
		return contracts.AnimeEditorNullableTimeDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorNullableTimeDTO{Kind: contracts.AnimeEditorValueKindNull}
	}
	var wrapper struct {
		UnixMilli int64 `json:"$$date"`
	}
	if json.Unmarshal(value, &wrapper) != nil {
		return contracts.AnimeEditorNullableTimeDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	return contracts.AnimeEditorNullableTimeDTO{Kind: contracts.AnimeEditorValueKindValue, UnixMilli: wrapper.UnixMilli}
}

func editorCoverFromFields(fields map[string]json.RawMessage) contracts.AnimeEditorCoverDTO {
	value, exists := fields["portada"]
	if !exists {
		return contracts.AnimeEditorCoverDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorCoverDTO{Kind: contracts.AnimeEditorValueKindNull}
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(value, &raw); err != nil {
		return contracts.AnimeEditorCoverDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	result := contracts.AnimeEditorCoverDTO{Kind: contracts.AnimeEditorValueKindValue, Raw: map[string]any{}}
	if path, ok := raw["path"]; ok {
		_ = json.Unmarshal(path, &result.Path)
	}
	if coverType, ok := raw["type"]; ok {
		_ = json.Unmarshal(coverType, &result.Type)
	}
	for key, rawValue := range raw {
		if key == "type" || key == "path" {
			continue
		}
		var decoded any
		if err := json.Unmarshal(rawValue, &decoded); err != nil {
			continue
		}
		result.Raw[key] = decoded
	}
	if len(result.Raw) == 0 {
		result.Raw = nil
	}
	return result
}

var _ contracts.AnimeQueryService = (*QueryService)(nil)
var _ contracts.AnimeWriteService = (*WriteService)(nil)

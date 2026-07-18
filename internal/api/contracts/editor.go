package contracts

// AnimeEditorValueKind classifies editor field presence in DTO unions.
type AnimeEditorValueKind string

const (
	// AnimeEditorValueKindMissing means the client omitted the field.
	AnimeEditorValueKindMissing AnimeEditorValueKind = "missing"
	// AnimeEditorValueKindNull means the client explicitly cleared the field.
	AnimeEditorValueKindNull AnimeEditorValueKind = "null"
	// AnimeEditorValueKindValue means the client supplied a concrete value.
	AnimeEditorValueKindValue AnimeEditorValueKind = "value"
)

// AnimeEditorNullableStringDTO carries a discriminated optional string value.
type AnimeEditorNullableStringDTO struct {
	Kind AnimeEditorValueKind `json:"kind"`
	// Value must serialize even when empty — the Kind discriminator distinguishes
	// missing/null from a present empty string, so omitempty would collapse them.
	Value string `json:"value"`
}

// AnimeEditorNullableIntDTO carries a discriminated optional integer value.
type AnimeEditorNullableIntDTO struct {
	Kind AnimeEditorValueKind `json:"kind"`
	// Value must serialize even when 0 — the Kind discriminator already encodes
	// missing/null, so omitempty would drop a legitimate zero (e.g. tipo=0,
	// "Anime (TV)") and make it indistinguishable from an absent field.
	Value int `json:"value"`
}

// AnimeEditorNullableTimeDTO carries a discriminated optional timestamp value.
type AnimeEditorNullableTimeDTO struct {
	Kind AnimeEditorValueKind `json:"kind"`
	// UnixMilli must serialize even when 0 for the same discriminated-union
	// reason as AnimeEditorNullableIntDTO.Value.
	UnixMilli int64 `json:"unixMilli"`
}

// AnimeEditorStringListDTO carries a discriminated optional string slice.
type AnimeEditorStringListDTO struct {
	Kind   AnimeEditorValueKind `json:"kind"`
	Values []string             `json:"values"`
}

// AnimeEditorCoverDTO carries a discriminated optional cover payload.
type AnimeEditorCoverDTO struct {
	Kind AnimeEditorValueKind `json:"kind"`
	Type string               `json:"type,omitempty"`
	Path string               `json:"path,omitempty"`
	Raw  map[string]any       `json:"raw,omitempty"`
}

// AnimeEditorFrequentFields groups the editor's most-used fields.
type AnimeEditorFrequentFields struct {
	Name          string                       `json:"name"`
	Status        int                          `json:"status"`
	Progress      float64                      `json:"progress"`
	TotalEpisodes AnimeEditorNullableIntDTO    `json:"totalEpisodes"`
	Active        bool                         `json:"active"`
	Kind          AnimeEditorNullableIntDTO    `json:"kind"`
	Page          AnimeEditorNullableStringDTO `json:"page"`
	Folder        AnimeEditorNullableStringDTO `json:"folder"`
	Placements    []MobileAnimeDay             `json:"placements"`
}

// AnimeEditorDetailFields groups the editor's detail fields.
type AnimeEditorDetailFields struct {
	PremieredAt AnimeEditorNullableTimeDTO   `json:"premieredAt"`
	Duration    AnimeEditorNullableIntDTO    `json:"duration"`
	Origin      AnimeEditorNullableStringDTO `json:"origin"`
	Genres      AnimeEditorStringListDTO     `json:"genres"`
	Studios     AnimeEditorStringListDTO     `json:"studios"`
	Cover       AnimeEditorCoverDTO          `json:"cover"`
}

// AnimeEditorRecord is the full editor read model for one anime.
type AnimeEditorRecord struct {
	AnimeID    string                    `json:"animeId"`
	ModifiedAt int64                     `json:"modifiedAt"`
	Frequent   AnimeEditorFrequentFields `json:"frequent"`
	Details    AnimeEditorDetailFields   `json:"details"`
}

// AnimeScheduleDestination is one board column or queue destination.
type AnimeScheduleDestination struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
}

// AnimeScheduleBoardEntry is one draggable board card entry.
type AnimeScheduleBoardEntry struct {
	AnimeID           string           `json:"animeId"`
	Name              string           `json:"name"`
	Active            bool             `json:"active"`
	ModifiedAt        int64            `json:"modifiedAt"`
	Placements        []MobileAnimeDay `json:"placements"`
	Status            int              `json:"status"`
	Progress          float64          `json:"progress"`
	Cover             *string          `json:"cover,omitempty"`
	OriginHighlighted bool             `json:"originHighlighted"`
}

// AnimeEditorScheduleBoard is the editor schedule board snapshot.
type AnimeEditorScheduleBoard struct {
	OriginAnimeID   string                     `json:"originAnimeId"`
	BoardModifiedAt int64                      `json:"boardModifiedAt"`
	Destinations    []AnimeScheduleDestination `json:"destinations"`
	Entries         []AnimeScheduleBoardEntry  `json:"entries"`
}

// AnimeEditorRecordResult wraps a record fetch outcome.
type AnimeEditorRecordResult struct {
	Outcome AnimePatchOutcome  `json:"outcome"`
	Message string             `json:"message"`
	Details map[string]string  `json:"details,omitempty"`
	Record  *AnimeEditorRecord `json:"record,omitempty"`
}

// AnimeEditorSaveResult wraps an editor save outcome.
type AnimeEditorSaveResult struct {
	Outcome    AnimePatchOutcome  `json:"outcome"`
	Message    string             `json:"message"`
	Details    map[string]string  `json:"details,omitempty"`
	AnimeID    string             `json:"animeId,omitempty"`
	ModifiedAt int64              `json:"modifiedAt,omitempty"`
	ConflictID string             `json:"conflictId,omitempty"`
	Record     *AnimeEditorRecord `json:"record,omitempty"`
}

// AnimeEditorScheduleBoardResult wraps a board read outcome.
type AnimeEditorScheduleBoardResult struct {
	Outcome AnimePatchOutcome         `json:"outcome"`
	Message string                    `json:"message"`
	Details map[string]string         `json:"details,omitempty"`
	Board   *AnimeEditorScheduleBoard `json:"board,omitempty"`
}

// AnimeEditorScheduleApplyResult wraps a board-apply outcome.
type AnimeEditorScheduleApplyResult struct {
	Outcome    AnimePatchOutcome         `json:"outcome"`
	Message    string                    `json:"message"`
	Details    map[string]string         `json:"details,omitempty"`
	ModifiedAt int64                     `json:"modifiedAt,omitempty"`
	ConflictID string                    `json:"conflictId,omitempty"`
	Board      *AnimeEditorScheduleBoard `json:"board,omitempty"`
}

package contracts

type AnimeEditorValueKind string

const (
	AnimeEditorValueKindMissing AnimeEditorValueKind = "missing"
	AnimeEditorValueKindNull    AnimeEditorValueKind = "null"
	AnimeEditorValueKindValue   AnimeEditorValueKind = "value"
)

type AnimeEditorNullableStringDTO struct {
	Kind AnimeEditorValueKind `json:"kind"`
	// Value must serialize even when empty — the Kind discriminator distinguishes
	// missing/null from a present empty string, so omitempty would collapse them.
	Value string `json:"value"`
}

type AnimeEditorNullableIntDTO struct {
	Kind AnimeEditorValueKind `json:"kind"`
	// Value must serialize even when 0 — the Kind discriminator already encodes
	// missing/null, so omitempty would drop a legitimate zero (e.g. tipo=0,
	// "Anime (TV)") and make it indistinguishable from an absent field.
	Value int `json:"value"`
}

type AnimeEditorNullableTimeDTO struct {
	Kind AnimeEditorValueKind `json:"kind"`
	// UnixMilli must serialize even when 0 for the same discriminated-union
	// reason as AnimeEditorNullableIntDTO.Value.
	UnixMilli int64 `json:"unixMilli"`
}

type AnimeEditorStringListDTO struct {
	Kind   AnimeEditorValueKind `json:"kind"`
	Values []string             `json:"values"`
}

type AnimeEditorCoverDTO struct {
	Kind AnimeEditorValueKind `json:"kind"`
	Type string               `json:"type,omitempty"`
	Path string               `json:"path,omitempty"`
	Raw  map[string]any       `json:"raw,omitempty"`
}

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

type AnimeEditorDetailFields struct {
	PremieredAt AnimeEditorNullableTimeDTO   `json:"premieredAt"`
	Duration    AnimeEditorNullableIntDTO    `json:"duration"`
	Origin      AnimeEditorNullableStringDTO `json:"origin"`
	Genres      AnimeEditorStringListDTO     `json:"genres"`
	Studios     AnimeEditorStringListDTO     `json:"studios"`
	Cover       AnimeEditorCoverDTO          `json:"cover"`
}

type AnimeEditorRecord struct {
	AnimeID    string                    `json:"animeId"`
	ModifiedAt int64                     `json:"modifiedAt"`
	Frequent   AnimeEditorFrequentFields `json:"frequent"`
	Details    AnimeEditorDetailFields   `json:"details"`
}

type AnimeScheduleDestination struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
}

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

type AnimeEditorScheduleBoard struct {
	OriginAnimeID   string                     `json:"originAnimeId"`
	BoardModifiedAt int64                      `json:"boardModifiedAt"`
	Destinations    []AnimeScheduleDestination `json:"destinations"`
	Entries         []AnimeScheduleBoardEntry  `json:"entries"`
}

type AnimeEditorRecordResult struct {
	Outcome AnimePatchOutcome  `json:"outcome"`
	Message string             `json:"message"`
	Details map[string]string  `json:"details,omitempty"`
	Record  *AnimeEditorRecord `json:"record,omitempty"`
}

type AnimeEditorSaveResult struct {
	Outcome    AnimePatchOutcome  `json:"outcome"`
	Message    string             `json:"message"`
	Details    map[string]string  `json:"details,omitempty"`
	AnimeID    string             `json:"animeId,omitempty"`
	ModifiedAt int64              `json:"modifiedAt,omitempty"`
	ConflictID string             `json:"conflictId,omitempty"`
	Record     *AnimeEditorRecord `json:"record,omitempty"`
}

type AnimeEditorScheduleBoardResult struct {
	Outcome AnimePatchOutcome         `json:"outcome"`
	Message string                    `json:"message"`
	Details map[string]string         `json:"details,omitempty"`
	Board   *AnimeEditorScheduleBoard `json:"board,omitempty"`
}

type AnimeEditorScheduleApplyResult struct {
	Outcome    AnimePatchOutcome         `json:"outcome"`
	Message    string                    `json:"message"`
	Details    map[string]string         `json:"details,omitempty"`
	ModifiedAt int64                     `json:"modifiedAt,omitempty"`
	ConflictID string                    `json:"conflictId,omitempty"`
	Board      *AnimeEditorScheduleBoard `json:"board,omitempty"`
}

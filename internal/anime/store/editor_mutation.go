package store

import (
	"encoding/json"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

// NullableStringMutation applies an optional string update to a legacy field.
type NullableStringMutation struct {
	Present bool
	Clear   bool
	Value   string
}

// NullableIntMutation applies an optional integer update to a legacy field.
type NullableIntMutation struct {
	Present bool
	Clear   bool
	Value   int
}

// NullableTimeMutation applies an optional timestamp update to a legacy field.
type NullableTimeMutation struct {
	Present   bool
	Clear     bool
	UnixMilli int64
}

// StudiosMutation applies an optional studios array update.
type StudiosMutation struct {
	Present bool
	Clear   bool
	Values  []string
}

// CoverMutation applies an optional cover payload update.
type CoverMutation struct {
	Present bool
	Clear   bool
	Type    string
	Path    string
	Raw     map[string]json.RawMessage
}

// EditorMutation aggregates the editable legacy-anime fields.
type EditorMutation struct {
	Name          *string
	Status        *int
	Progress      *float64
	TotalEpisodes NullableIntMutation
	Kind          NullableIntMutation
	Page          NullableStringMutation
	Folder        NullableStringMutation
	Origin        NullableStringMutation
	Duration      NullableIntMutation
	PremieredAt   NullableTimeMutation
	Genres        *[]string
	Placements    *[]contracts.MobileAnimeDay
	Active        *bool
	Cover         CoverMutation
	Studios       StudiosMutation
}

// NewEditorRawMutation builds a legacy-raw mutator from editor DTO changes.
func NewEditorRawMutation(patch EditorMutation, now time.Time) func(*AnimeRaw, *domain.Anime) error {
	return func(raw *AnimeRaw, _ *domain.Anime) error {
		applyEditorScalarMutations(raw, patch)
		applyEditorLifecycleMutations(raw, patch, now)
		applyEditorCollectionMutations(raw, patch)
		return nil
	}
}

// applyEditorScalarMutations applies scalar fields from an editor mutation.
func applyEditorScalarMutations(raw *AnimeRaw, patch EditorMutation) {
	if patch.Name != nil {
		raw.Name = *patch.Name
	}
	if patch.Status != nil {
		raw.SetIntField("status", patch.Status)
	}
	if patch.Progress != nil {
		raw.EpisodesWatched = *patch.Progress
	}
	applyNullableIntMutation(raw, "totalEpisodes", patch.TotalEpisodes)
	applyNullableStringMutation(raw, "sourceUrl", patch.Page)
	applyNullableStringMutation(raw, "folder", patch.Folder)
	applyNullableStringMutation(raw, "origin", patch.Origin)
	applyNullableIntMutation(raw, "durationMinutes", patch.Duration)
	applyNullableIntMutation(raw, "kind", patch.Kind)
	applyNullableTimeMutation(raw, "premieredAt", patch.PremieredAt)
}

// applyEditorLifecycleMutations applies active-state and deletion-date changes.
func applyEditorLifecycleMutations(raw *AnimeRaw, patch EditorMutation, now time.Time) {
	if patch.Active == nil {
		return
	}
	raw.SetBoolField("active", *patch.Active)
	if *patch.Active {
		raw.SetDateField("deletedAt", nil)
		return
	}
	raw.SetDateField("deletedAt", &now)
}

// applyEditorCollectionMutations applies collection and structured metadata changes.
func applyEditorCollectionMutations(raw *AnimeRaw, patch EditorMutation) {
	if patch.Placements != nil {
		raw.SetDays(toRawDays(*patch.Placements))
	}
	if patch.Genres != nil {
		raw.SetStringArrayField("genres", append([]string{}, (*patch.Genres)...))
	}
	if patch.Studios.Present {
		raw.SetStudios(patch.Studios.Clear, patch.Studios.Values)
	}
	if patch.Cover.Present {
		raw.SetCover(patch.Cover.Clear, patch.Cover.Type, patch.Cover.Path, patch.Cover.Raw)
	}
}

// NewDeactivateRawMutation builds a mutator that soft-deletes an anime.
func NewDeactivateRawMutation(now time.Time) func(*AnimeRaw, *domain.Anime) error {
	return func(raw *AnimeRaw, _ *domain.Anime) error {
		raw.SetBoolField("active", false)
		raw.SetDateField("deletedAt", &now)
		return nil
	}
}

// NewSchedulePlacementsMutation builds a mutator that overwrites schedule days.
func NewSchedulePlacementsMutation(placements []contracts.MobileAnimeDay) func(*AnimeRaw, *domain.Anime) error {
	return func(raw *AnimeRaw, _ *domain.Anime) error {
		raw.SetDays(toRawDays(placements))
		return nil
	}
}

// applyNullableStringMutation applies a present or cleared nullable string field.
func applyNullableStringMutation(raw *AnimeRaw, key string, patch NullableStringMutation) {
	if !patch.Present {
		return
	}
	if patch.Clear {
		raw.SetStringField(key, nil)
		return
	}
	value := patch.Value
	raw.SetStringField(key, &value)
}

// applyNullableIntMutation applies a present or cleared nullable integer field.
func applyNullableIntMutation(raw *AnimeRaw, key string, patch NullableIntMutation) {
	if !patch.Present {
		return
	}
	if patch.Clear {
		raw.SetIntField(key, nil)
		return
	}
	value := patch.Value
	raw.SetIntField(key, &value)
}

// applyNullableTimeMutation applies a present or cleared nullable timestamp field.
func applyNullableTimeMutation(raw *AnimeRaw, key string, patch NullableTimeMutation) {
	if !patch.Present {
		return
	}
	if patch.Clear {
		raw.SetDateField(key, nil)
		return
	}
	value := time.UnixMilli(patch.UnixMilli).UTC()
	raw.SetDateField(key, &value)
}

// toRawDays converts mobile schedule placements to raw day records.
func toRawDays(placements []contracts.MobileAnimeDay) []AnimeDay {
	result := make([]AnimeDay, 0, len(placements))
	for _, placement := range placements {
		result = append(result, AnimeDay{Day: placement.Day, Order: float64(placement.Order)})
	}
	return result
}

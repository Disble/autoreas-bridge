package desktop

import (
	"encoding/json"
	"fmt"
	"slices"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

// SaveAnimeEditorCommandDTO is the wire shape the editor screen sends to
// SaveAnimeEditor. It exists separately from the domain command because every
// field is an explicit presence-carrying patch: see AnimeEditorPatchDTO.
type SaveAnimeEditorCommandDTO struct {
	AnimeID        string              `json:"animeId"`
	BaseModifiedAt int64               `json:"baseModifiedAt"`
	Patch          AnimeEditorPatchDTO `json:"patch"`
}

// AnimeEditorNullableStringPatchDTO carries a nullable string patch. The
// wrapper distinguishes "not sent" from "sent as null", which a bare *string
// crossing JSON cannot.
type AnimeEditorNullableStringPatchDTO struct {
	Present bool   `json:"present"`
	Clear   bool   `json:"clear"`
	Value   string `json:"value"`
}

// AnimeEditorNullableIntPatchDTO carries a nullable integer patch, with the
// same not-sent/sent-null distinction as AnimeEditorNullableStringPatchDTO.
type AnimeEditorNullableIntPatchDTO struct {
	Present bool `json:"present"`
	Clear   bool `json:"clear"`
	Value   int  `json:"value"`
}

// AnimeEditorNullableTimePatchDTO carries a nullable timestamp patch, with the
// same not-sent/sent-null distinction as AnimeEditorNullableStringPatchDTO.
type AnimeEditorNullableTimePatchDTO struct {
	Present   bool  `json:"present"`
	Clear     bool  `json:"clear"`
	UnixMilli int64 `json:"unixMilli"`
}

// AnimeEditorStudiosPatchDTO carries a studios-list patch, distinguishing an
// untouched list from one deliberately emptied.
type AnimeEditorStudiosPatchDTO struct {
	Present bool     `json:"present"`
	Clear   bool     `json:"clear"`
	Values  []string `json:"values"`
}

// AnimeEditorCoverPatchDTO carries a cover patch, distinguishing an untouched
// cover from one deliberately cleared.
type AnimeEditorCoverPatchDTO struct {
	Present bool           `json:"present"`
	Clear   bool           `json:"clear"`
	Type    string         `json:"type"`
	Path    string         `json:"path"`
	Raw     map[string]any `json:"raw"`
}

// AnimeEditorPatchDTO is the set of field patches one save may carry. Each
// field is a wrapper rather than a pointer because the editor must be able to
// clear a value, and "omitted" and "set to null" are different intents that a
// plain nil cannot tell apart. UnmarshalJSON is what records which arrived.
type AnimeEditorPatchDTO struct {
	Name          *string                           `json:"name,omitempty"`
	Status        *int                              `json:"status,omitempty"`
	Progress      *float64                          `json:"progress,omitempty"`
	TotalEpisodes AnimeEditorNullableIntPatchDTO    `json:"totalEpisodes"`
	Page          AnimeEditorNullableStringPatchDTO `json:"page"`
	Folder        AnimeEditorNullableStringPatchDTO `json:"folder"`
	Origin        AnimeEditorNullableStringPatchDTO `json:"origin"`
	Duration      AnimeEditorNullableIntPatchDTO    `json:"duration"`
	Kind          AnimeEditorNullableIntPatchDTO    `json:"kind"`
	PremieredAt   AnimeEditorNullableTimePatchDTO   `json:"premieredAt"`
	Placements    *[]contracts.MobileAnimeDay       `json:"placements,omitempty"`
	Genres        *[]string                         `json:"genres,omitempty"`
	Studios       AnimeEditorStudiosPatchDTO        `json:"studios"`
	Cover         AnimeEditorCoverPatchDTO          `json:"cover"`
	Active        *bool                             `json:"active,omitempty"`

	forbiddenFields []string
	decodeError     error
}

// UnmarshalJSON records which keys the payload actually carried, which is the
// only point where "absent" and "present but null" are still distinguishable.
func (d *AnimeEditorPatchDTO) UnmarshalJSON(data []byte) error {
	type alias AnimeEditorPatchDTO
	var decoded alias
	if err := json.Unmarshal(data, &decoded); err != nil {
		d.decodeError = err
		return nil
	}
	*d = AnimeEditorPatchDTO(decoded)
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		d.decodeError = err
		return nil
	}
	for _, key := range []string{"_id", "modifiedAt", "modified_at", "repeat", "repetir", "firstTime", "primeravez"} {
		if _, exists := fields[key]; exists {
			d.forbiddenFields = append(d.forbiddenFields, key)
		}
	}
	allowed := map[string]struct{}{
		"name": {}, "status": {}, "progress": {}, "totalEpisodes": {}, "page": {}, "folder": {}, "origin": {},
		"duration": {}, "kind": {}, "premieredAt": {}, "placements": {}, "genres": {}, "studios": {}, "cover": {}, "active": {},
	}
	for key := range fields {
		if _, exists := allowed[key]; !exists && !editorContainsString(d.forbiddenFields, key) {
			d.forbiddenFields = append(d.forbiddenFields, key)
		}
	}
	return nil
}

// editorContainsString reports whether a field name is already recorded.
func editorContainsString(values []string, target string) bool {
	return slices.Contains(values, target)
}

// toDomain converts an editor save command DTO to its domain command.
func (d SaveAnimeEditorCommandDTO) toDomain() (anime.SaveAnimeEditorCommand, error) {
	patch, err := d.Patch.toDomain()
	if err != nil {
		return anime.SaveAnimeEditorCommand{}, err
	}
	return anime.SaveAnimeEditorCommand{AnimeID: d.AnimeID, BaseModifiedAt: d.BaseModifiedAt, Patch: patch}, nil
}

// toDomain converts an editor patch DTO to its domain patch.
func (d AnimeEditorPatchDTO) toDomain() (anime.EditorPatch, error) {
	if d.decodeError != nil {
		return anime.EditorPatch{}, fmt.Errorf("decode editor patch: %w", d.decodeError)
	}
	coverRaw := make(map[string]json.RawMessage, len(d.Cover.Raw))
	for key, value := range d.Cover.Raw {
		encoded, err := json.Marshal(value)
		if err != nil {
			return anime.EditorPatch{}, fmt.Errorf("encode cover raw field %q: %w", key, err)
		}
		coverRaw[key] = encoded
	}
	if d.Cover.Raw == nil {
		coverRaw = nil
	}
	var studios []string
	if d.Studios.Values != nil {
		studios = append([]string{}, d.Studios.Values...)
	}
	return anime.EditorPatch{
		Name: d.Name, Status: d.Status, Progress: d.Progress,
		TotalEpisodes: d.TotalEpisodes.toDomain(), Kind: d.Kind.toDomain(),
		Page: d.Page.toDomain(), Folder: d.Folder.toDomain(), Origin: d.Origin.toDomain(),
		Duration: d.Duration.toDomain(), PremieredAt: d.PremieredAt.toDomain(),
		Placements: d.Placements, Genres: d.Genres,
		Studios: anime.EditorStudiosPatch{Present: d.Studios.Present, Clear: d.Studios.Clear, Values: studios},
		Cover:   anime.EditorCoverPatch{Present: d.Cover.Present, Clear: d.Cover.Clear, Type: d.Cover.Type, Path: d.Cover.Path, Raw: coverRaw},
		Active:  d.Active, ForbiddenFields: append([]string{}, d.forbiddenFields...),
	}, nil
}

// toDomain converts a nullable string patch DTO to its domain value.
func (d AnimeEditorNullableStringPatchDTO) toDomain() anime.EditorNullableStringPatch {
	return anime.EditorNullableStringPatch{Present: d.Present, Clear: d.Clear, Value: d.Value}
}

// toDomain converts a nullable integer patch DTO to its domain value.
func (d AnimeEditorNullableIntPatchDTO) toDomain() anime.EditorNullableIntPatch {
	return anime.EditorNullableIntPatch{Present: d.Present, Clear: d.Clear, Value: d.Value}
}

// toDomain converts a nullable time patch DTO to its domain value.
func (d AnimeEditorNullableTimePatchDTO) toDomain() anime.EditorNullableTimePatch {
	return anime.EditorNullableTimePatch{Present: d.Present, Clear: d.Clear, UnixMilli: d.UnixMilli}
}

// ApplyAnimeScheduleDraftCommandDTO is the wire shape of a whole dragged
// schedule board, sent as one command so it cannot be applied halfway.
type ApplyAnimeScheduleDraftCommandDTO struct {
	BoardModifiedAt int64                             `json:"boardModifiedAt"`
	Entries         []ApplyAnimeScheduleDraftEntryDTO `json:"entries"`
}

// ApplyAnimeScheduleDraftEntryDTO is one card's placement inside an
// ApplyAnimeScheduleDraftCommandDTO.
type ApplyAnimeScheduleDraftEntryDTO struct {
	AnimeID        string                     `json:"animeId"`
	BaseModifiedAt int64                      `json:"baseModifiedAt"`
	Placements     []contracts.MobileAnimeDay `json:"placements"`
}

// toDomain converts a schedule draft DTO to its domain command.
func (d ApplyAnimeScheduleDraftCommandDTO) toDomain() anime.ApplyAnimeScheduleDraftCommand {
	entries := make([]anime.ApplyAnimeScheduleDraftEntry, 0, len(d.Entries))
	for _, entry := range d.Entries {
		entries = append(entries, anime.ApplyAnimeScheduleDraftEntry{
			AnimeID: entry.AnimeID, BaseModifiedAt: entry.BaseModifiedAt,
			Placements: append([]contracts.MobileAnimeDay{}, entry.Placements...),
		})
	}
	return anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: d.BoardModifiedAt, Entries: entries}
}

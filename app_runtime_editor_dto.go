package main

import (
	"encoding/json"
	"fmt"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

type SaveAnimeEditorCommandDTO struct {
	AnimeID        string              `json:"animeId"`
	BaseModifiedAt int64               `json:"baseModifiedAt"`
	Patch          AnimeEditorPatchDTO `json:"patch"`
}

type AnimeEditorNullableStringPatchDTO struct {
	Present bool   `json:"present"`
	Clear   bool   `json:"clear"`
	Value   string `json:"value"`
}

type AnimeEditorNullableIntPatchDTO struct {
	Present bool `json:"present"`
	Clear   bool `json:"clear"`
	Value   int  `json:"value"`
}

type AnimeEditorNullableTimePatchDTO struct {
	Present   bool  `json:"present"`
	Clear     bool  `json:"clear"`
	UnixMilli int64 `json:"unixMilli"`
}

type AnimeEditorStudiosPatchDTO struct {
	Present bool     `json:"present"`
	Clear   bool     `json:"clear"`
	Values  []string `json:"values"`
}

type AnimeEditorCoverPatchDTO struct {
	Present bool           `json:"present"`
	Clear   bool           `json:"clear"`
	Type    string         `json:"type"`
	Path    string         `json:"path"`
	Raw     map[string]any `json:"raw"`
}

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
	Placements    []contracts.MobileAnimeDay        `json:"placements,omitempty"`
	Genres        *[]string                         `json:"genres,omitempty"`
	Studios       AnimeEditorStudiosPatchDTO        `json:"studios"`
	Cover         AnimeEditorCoverPatchDTO          `json:"cover"`
	Active        *bool                             `json:"active,omitempty"`

	forbiddenFields []string
	decodeError     error
}

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

func editorContainsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (d SaveAnimeEditorCommandDTO) toDomain() (anime.SaveAnimeEditorCommand, error) {
	patch, err := d.Patch.toDomain()
	if err != nil {
		return anime.SaveAnimeEditorCommand{}, err
	}
	return anime.SaveAnimeEditorCommand{AnimeID: d.AnimeID, BaseModifiedAt: d.BaseModifiedAt, Patch: patch}, nil
}

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
	var placements []contracts.MobileAnimeDay
	if d.Placements != nil {
		placements = append([]contracts.MobileAnimeDay{}, d.Placements...)
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
		Placements: placements, Genres: d.Genres,
		Studios: anime.EditorStudiosPatch{Present: d.Studios.Present, Clear: d.Studios.Clear, Values: studios},
		Cover:   anime.EditorCoverPatch{Present: d.Cover.Present, Clear: d.Cover.Clear, Type: d.Cover.Type, Path: d.Cover.Path, Raw: coverRaw},
		Active:  d.Active, ForbiddenFields: append([]string{}, d.forbiddenFields...),
	}, nil
}

func (d AnimeEditorNullableStringPatchDTO) toDomain() anime.EditorNullableStringPatch {
	return anime.EditorNullableStringPatch{Present: d.Present, Clear: d.Clear, Value: d.Value}
}

func (d AnimeEditorNullableIntPatchDTO) toDomain() anime.EditorNullableIntPatch {
	return anime.EditorNullableIntPatch{Present: d.Present, Clear: d.Clear, Value: d.Value}
}

func (d AnimeEditorNullableTimePatchDTO) toDomain() anime.EditorNullableTimePatch {
	return anime.EditorNullableTimePatch{Present: d.Present, Clear: d.Clear, UnixMilli: d.UnixMilli}
}

type ApplyAnimeScheduleDraftCommandDTO struct {
	BoardModifiedAt int64                             `json:"boardModifiedAt"`
	Entries         []ApplyAnimeScheduleDraftEntryDTO `json:"entries"`
}

type ApplyAnimeScheduleDraftEntryDTO struct {
	AnimeID        string                     `json:"animeId"`
	BaseModifiedAt int64                      `json:"baseModifiedAt"`
	Placements     []contracts.MobileAnimeDay `json:"placements"`
}

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

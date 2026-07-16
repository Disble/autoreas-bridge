package legacy

import (
	"encoding/json"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

type NullableStringMutation struct {
	Present bool
	Clear   bool
	Value   string
}

type NullableIntMutation struct {
	Present bool
	Clear   bool
	Value   int
}

type NullableTimeMutation struct {
	Present   bool
	Clear     bool
	UnixMilli int64
}

type StudiosMutation struct {
	Present bool
	Clear   bool
	Values  []string
}

type CoverMutation struct {
	Present bool
	Clear   bool
	Type    string
	Path    string
	Raw     map[string]json.RawMessage
}

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
	Placements    []contracts.MobileAnimeDay
	Active        *bool
	Cover         CoverMutation
	Studios       StudiosMutation
}

func NewEditorRawMutation(patch EditorMutation, now time.Time) func(*LegacyAnimeRaw, *domain.Anime) error {
	return func(raw *LegacyAnimeRaw, _ *domain.Anime) error {
		if patch.Name != nil {
			raw.Nombre = *patch.Name
		}
		if patch.Status != nil {
			raw.SetIntField("estado", patch.Status)
		}
		if patch.Progress != nil {
			raw.NroCapVisto = *patch.Progress
		}
		applyNullableIntMutation(raw, "totalcap", patch.TotalEpisodes)
		applyNullableStringMutation(raw, "pagina", patch.Page)
		applyNullableStringMutation(raw, "carpeta", patch.Folder)
		applyNullableStringMutation(raw, "origen", patch.Origin)
		applyNullableIntMutation(raw, "duracion", patch.Duration)
		applyNullableIntMutation(raw, "tipo", patch.Kind)
		applyNullableTimeMutation(raw, "fechaEstreno", patch.PremieredAt)
		if patch.Active != nil {
			raw.SetBoolField("activo", *patch.Active)
			if *patch.Active {
				raw.SetDateField("fechaEliminacion", nil)
			} else {
				raw.SetDateField("fechaEliminacion", &now)
			}
		}
		if patch.Placements != nil {
			raw.SetDays(toLegacyDays(patch.Placements))
		}
		if patch.Genres != nil {
			raw.SetStringArrayField("generos", append([]string{}, (*patch.Genres)...))
		}
		if patch.Studios.Present {
			raw.SetStudios(patch.Studios.Clear, patch.Studios.Values)
		}
		if patch.Cover.Present {
			raw.SetCover(patch.Cover.Clear, patch.Cover.Type, patch.Cover.Path, patch.Cover.Raw)
		}
		return nil
	}
}

func NewDeactivateRawMutation(now time.Time) func(*LegacyAnimeRaw, *domain.Anime) error {
	return func(raw *LegacyAnimeRaw, _ *domain.Anime) error {
		raw.SetBoolField("activo", false)
		raw.SetDateField("fechaEliminacion", &now)
		return nil
	}
}

func NewSchedulePlacementsMutation(placements []contracts.MobileAnimeDay) func(*LegacyAnimeRaw, *domain.Anime) error {
	return func(raw *LegacyAnimeRaw, _ *domain.Anime) error {
		raw.SetDays(toLegacyDays(placements))
		return nil
	}
}

func applyNullableStringMutation(raw *LegacyAnimeRaw, key string, patch NullableStringMutation) {
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

func applyNullableIntMutation(raw *LegacyAnimeRaw, key string, patch NullableIntMutation) {
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

func applyNullableTimeMutation(raw *LegacyAnimeRaw, key string, patch NullableTimeMutation) {
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

func toLegacyDays(placements []contracts.MobileAnimeDay) []LegacyAnimeDay {
	result := make([]LegacyAnimeDay, 0, len(placements))
	for _, placement := range placements {
		result = append(result, LegacyAnimeDay{Dia: placement.Dia, Orden: float64(placement.Orden)})
	}
	return result
}

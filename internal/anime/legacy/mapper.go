package legacy

import (
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

type Mapper struct{}

func NewMapper() Mapper {
	return Mapper{}
}

func (Mapper) ToDomain(raw LegacyAnimeRaw) (domain.Anime, error) {
	if raw.ID == "" {
		return domain.Anime{}, fmt.Errorf("map Legacy anime: missing id")
	}

	days := raw.days()
	domainDays := make([]domain.AnimeDay, 0, len(days))
	for _, day := range days {
		domainDays = append(domainDays, domain.AnimeDay{Day: day.Dia, Order: day.Orden})
	}

	return domain.Anime{
		ID:              raw.ID,
		Title:           raw.Nombre,
		Progress:        raw.NroCapVisto,
		Status:          raw.integer("estado"),
		Days:            domainDays,
		Active:          raw.triState("activo"),
		FirstCycle:      raw.triState("primeravez"),
		CreatedAt:       raw.date("fechaCreacion"),
		PremieredAt:     raw.date("fechaEstreno"),
		LastWatchedAt:   raw.date("fechaUltCapVisto"),
		DeletedAt:       raw.date("fechaEliminacion"),
		TotalEpisodes:   raw.number("totalcap"),
		DurationMinutes: raw.number("duracion"),
		SourceURL:       raw.stringValue("pagina"),
		ContentType:     raw.integer("tipo"),
		Folder:          raw.stringValue("carpeta"),
		Origin:          raw.stringValue("origen"),
		Studios:         raw.strings("estudios"),
		Genres:          raw.strings("generos"),
		CoverPath:       raw.coverPath(),
		Repetitions:     raw.repetitions(),
	}, nil
}

func (Mapper) Merge(original LegacyAnimeRaw, anime domain.Anime) (LegacyAnimeRaw, error) {
	if original.ID != anime.ID {
		return LegacyAnimeRaw{}, fmt.Errorf("merge Legacy anime: id changed from %q to %q", original.ID, anime.ID)
	}

	fields := cloneFields(original.extraFields)
	changes := anime.Changes()
	if changes.Progress {
		fields["nrocapvisto"] = mustJSON(anime.Progress)
	}
	if changes.Status {
		fields["estado"] = nullableIntJSON(anime.Status)
	}
	if changes.Days {
		days := make([]LegacyAnimeDay, 0, len(anime.Days))
		for _, day := range anime.Days {
			days = append(days, LegacyAnimeDay{Dia: day.Day, Orden: day.Order})
		}
		fields["dias"] = mustJSON(days)
		delete(fields, "dia")
		delete(fields, "orden")
	}
	if changes.Active {
		fields["activo"] = triStateJSON(anime.Active)
	}
	if changes.FirstCycle {
		fields["primeravez"] = triStateJSON(anime.FirstCycle)
	}
	if changes.CreatedAt {
		fields["fechaCreacion"] = dateJSON(anime.CreatedAt)
	}
	if changes.PremieredAt {
		fields["fechaEstreno"] = dateJSON(anime.PremieredAt)
	}
	if changes.LastWatchedAt {
		fields["fechaUltCapVisto"] = dateJSON(anime.LastWatchedAt)
	}
	if changes.DeletedAt {
		fields["fechaEliminacion"] = dateJSON(anime.DeletedAt)
	}
	if changes.Repetition != nil {
		if err := appendRepetition(fields, *changes.Repetition); err != nil {
			return LegacyAnimeRaw{}, err
		}
	}

	encoded, err := marshalFields(fields)
	if err != nil {
		return LegacyAnimeRaw{}, fmt.Errorf("merge Legacy anime: %w", err)
	}
	var merged LegacyAnimeRaw
	if err := json.Unmarshal(encoded, &merged); err != nil {
		return LegacyAnimeRaw{}, fmt.Errorf("merge Legacy anime: %w", err)
	}
	return merged, nil
}

func appendRepetition(fields map[string]json.RawMessage, repetition domain.Repetition) error {
	entries := make([]map[string]json.RawMessage, 0, 1)
	if value, ok := nonNullField(fields, "repetir"); ok {
		if err := json.Unmarshal(value, &entries); err != nil {
			return fmt.Errorf("merge Legacy anime repetition history: %w", err)
		}
	}

	entries = append(entries, map[string]json.RawMessage{
		"numrepeticion":    mustJSON(len(entries)),
		"nrocapvisto":      mustJSON(repetition.Progress),
		"estado":           mustJSON(repetition.Status),
		"fechaCreacion":    dateJSON(repetition.CreatedAt),
		"fechaEstreno":     dateJSON(repetition.PremieredAt),
		"fechaUltCapVisto": dateJSON(repetition.LastWatchedAt),
		"fechaEliminacion": dateJSON(repetition.DeletedAt),
		"fechaRepeticion":  dateJSON(timePointer(repetition.RepeatedAt)),
	})
	fields["repetir"] = mustJSON(entries)
	return nil
}

func nullableIntJSON(value *int) json.RawMessage {
	if value == nil {
		return mustJSON(nil)
	}
	return mustJSON(*value)
}

func triStateJSON(value domain.TriState) json.RawMessage {
	return mustJSON(value == domain.TriStateTrue)
}

func dateJSON(value *time.Time) json.RawMessage {
	if value == nil {
		return mustJSON(nil)
	}
	return mustJSON(legacyDateWrapper{Date: value.UTC().UnixMilli()})
}

func timePointer(value time.Time) *time.Time {
	return &value
}

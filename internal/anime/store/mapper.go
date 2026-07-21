package store

import (
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

// Mapper converts legacy raw records to and from the anime domain model.
type Mapper struct{}

// NewMapper builds a legacy-domain mapper.
func NewMapper() Mapper {
	return Mapper{}
}

// ToDomain projects a legacy raw record into the anime domain model.
func (Mapper) ToDomain(raw AnimeRaw) (domain.Anime, error) {
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

// Merge overlays domain changes onto the original legacy raw record.
func (Mapper) Merge(original AnimeRaw, anime domain.Anime) (AnimeRaw, error) {
	if original.ID != anime.ID {
		return AnimeRaw{}, fmt.Errorf("merge Legacy anime: id changed from %q to %q", original.ID, anime.ID)
	}

	fields := cloneFields(original.extraFields)
	changes := anime.Changes()
	applyScalarChanges(fields, anime, changes)
	applyDateChanges(fields, anime, changes)
	if err := applyRepetitionChange(fields, changes); err != nil {
		return AnimeRaw{}, err
	}

	encoded, err := marshalFields(fields)
	if err != nil {
		return AnimeRaw{}, fmt.Errorf("merge Legacy anime: %w", err)
	}
	var merged AnimeRaw
	if err := json.Unmarshal(encoded, &merged); err != nil {
		return AnimeRaw{}, fmt.Errorf("merge Legacy anime: %w", err)
	}
	return merged, nil
}

// applyScalarChanges writes changed scalar domain fields into the legacy envelope.
func applyScalarChanges(fields map[string]json.RawMessage, anime domain.Anime, changes domain.AnimeChanges) {
	if changes.Progress {
		fields["nrocapvisto"] = mustJSON(anime.Progress)
	}
	if changes.Status {
		fields["estado"] = nullableIntJSON(anime.Status)
	}
	if changes.Days {
		fields["dias"] = mustJSON(legacyDays(anime.Days))
		delete(fields, "dia")
		delete(fields, "orden")
	}
	if changes.Active {
		fields["activo"] = triStateJSON(anime.Active)
	}
	if changes.FirstCycle {
		fields["primeravez"] = triStateJSON(anime.FirstCycle)
	}
}

// legacyDays converts domain anime days into legacy day records.
func legacyDays(days []domain.AnimeDay) []AnimeDay {
	result := make([]AnimeDay, 0, len(days))
	for _, day := range days {
		result = append(result, AnimeDay{Dia: day.Day, Orden: day.Order})
	}
	return result
}

// applyDateChanges writes changed domain timestamps into the legacy envelope.
func applyDateChanges(fields map[string]json.RawMessage, anime domain.Anime, changes domain.AnimeChanges) {
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
}

// applyRepetitionChange appends a changed repetition to the legacy history.
func applyRepetitionChange(fields map[string]json.RawMessage, changes domain.AnimeChanges) error {
	if changes.Repetition == nil {
		return nil
	}
	return appendRepetition(fields, *changes.Repetition)
}

// appendRepetition adds one repetition entry to the legacy history array.
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

// nullableIntJSON encodes a nullable integer as a legacy JSON value.
func nullableIntJSON(value *int) json.RawMessage {
	if value == nil {
		return mustJSON(nil)
	}
	return mustJSON(*value)
}

// triStateJSON encodes a domain tri-state value for the legacy boolean field.
func triStateJSON(value domain.TriState) json.RawMessage {
	return mustJSON(value == domain.TriStateTrue)
}

// dateJSON encodes an optional timestamp using the legacy date wrapper.
func dateJSON(value *time.Time) json.RawMessage {
	if value == nil {
		return mustJSON(nil)
	}
	return mustJSON(legacyDateWrapper{Date: value.UTC().UnixMilli()})
}

// timePointer returns a pointer to the supplied timestamp.
func timePointer(value time.Time) *time.Time {
	return &value
}

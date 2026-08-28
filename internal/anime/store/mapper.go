package store

import (
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

// Mapper converts raw records to and from the anime domain model.
type Mapper struct{}

// NewMapper builds a raw-domain mapper.
func NewMapper() Mapper {
	return Mapper{}
}

// ToDomain projects a raw record into the anime domain model.
func (Mapper) ToDomain(raw AnimeRaw) (domain.Anime, error) {
	if raw.ID == "" {
		return domain.Anime{}, fmt.Errorf("map anime: missing id")
	}

	days := raw.days()
	domainDays := make([]domain.AnimeDay, 0, len(days))
	for _, day := range days {
		domainDays = append(domainDays, domain.AnimeDay{Day: day.Day, Order: day.Order})
	}

	return domain.Anime{
		ID:              raw.ID,
		Title:           raw.Name,
		Progress:        raw.EpisodesWatched,
		Status:          raw.integer("status"),
		Days:            domainDays,
		Active:          raw.triState("active"),
		FirstCycle:      raw.triState("firstCycle"),
		CreatedAt:       raw.date("createdAt"),
		PremieredAt:     raw.date("premieredAt"),
		LastWatchedAt:   raw.date("lastWatchedAt"),
		DeletedAt:       raw.date("deletedAt"),
		TotalEpisodes:   raw.number("totalEpisodes"),
		DurationMinutes: raw.number("durationMinutes"),
		SourceURL:       raw.stringValue("sourceUrl"),
		ContentType:     raw.integer("kind"),
		Folder:          raw.stringValue("folder"),
		Origin:          raw.stringValue("origin"),
		Studios:         raw.strings("studios"),
		Genres:          raw.strings("genres"),
		CoverPath:       raw.coverPath(),
		Repetitions:     raw.repetitions(),
	}, nil
}

// Merge overlays domain changes onto the original raw record.
func (Mapper) Merge(original AnimeRaw, anime domain.Anime) (AnimeRaw, error) {
	if original.ID != anime.ID {
		return AnimeRaw{}, fmt.Errorf("merge anime: id changed from %q to %q", original.ID, anime.ID)
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
		return AnimeRaw{}, fmt.Errorf("merge anime: %w", err)
	}
	var merged AnimeRaw
	if err := json.Unmarshal(encoded, &merged); err != nil {
		return AnimeRaw{}, fmt.Errorf("merge anime: %w", err)
	}
	return merged, nil
}

// applyScalarChanges writes changed scalar domain fields into the raw envelope.
func applyScalarChanges(fields map[string]json.RawMessage, anime domain.Anime, changes domain.AnimeChanges) {
	if changes.Progress {
		fields["episodesWatched"] = mustJSON(anime.Progress)
	}
	if changes.Status {
		fields["status"] = nullableIntJSON(anime.Status)
	}
	if changes.Days {
		fields["days"] = mustJSON(englishDays(anime.Days))
		delete(fields, "day")
		delete(fields, "order")
	}
	if changes.Active {
		fields["active"] = triStateJSON(anime.Active)
	}
	if changes.FirstCycle {
		fields["firstCycle"] = triStateJSON(anime.FirstCycle)
	}
}

// englishDays converts domain anime days into raw day records.
func englishDays(days []domain.AnimeDay) []AnimeDay {
	result := make([]AnimeDay, 0, len(days))
	for _, day := range days {
		result = append(result, AnimeDay{Day: day.Day, Order: day.Order})
	}
	return result
}

// applyDateChanges writes changed domain timestamps into the raw envelope.
func applyDateChanges(fields map[string]json.RawMessage, anime domain.Anime, changes domain.AnimeChanges) {
	if changes.CreatedAt {
		fields["createdAt"] = dateJSON(anime.CreatedAt)
	}
	if changes.PremieredAt {
		fields["premieredAt"] = dateJSON(anime.PremieredAt)
	}
	if changes.LastWatchedAt {
		fields["lastWatchedAt"] = dateJSON(anime.LastWatchedAt)
	}
	if changes.DeletedAt {
		fields["deletedAt"] = dateJSON(anime.DeletedAt)
	}
}

// applyRepetitionChange appends a changed repetition to the repetition history.
func applyRepetitionChange(fields map[string]json.RawMessage, changes domain.AnimeChanges) error {
	if changes.Repetition == nil {
		return nil
	}
	return appendRepetition(fields, *changes.Repetition)
}

// appendRepetition adds one repetition entry to the repetition history array.
func appendRepetition(fields map[string]json.RawMessage, repetition domain.Repetition) error {
	entries := make([]map[string]json.RawMessage, 0, 1)
	if value, ok := nonNullField(fields, "repetitions"); ok {
		if err := json.Unmarshal(value, &entries); err != nil {
			return fmt.Errorf("merge anime repetition history: %w", err)
		}
	}

	entries = append(entries, map[string]json.RawMessage{
		"numRepetitions":  mustJSON(len(entries)),
		"episodesWatched": mustJSON(repetition.Progress),
		"status":          mustJSON(repetition.Status),
		"createdAt":       dateJSON(repetition.CreatedAt),
		"premieredAt":     dateJSON(repetition.PremieredAt),
		"lastWatchedAt":   dateJSON(repetition.LastWatchedAt),
		"deletedAt":       dateJSON(repetition.DeletedAt),
		"repeatedAt":      dateJSON(new(repetition.RepeatedAt)),
	})
	fields["repetitions"] = mustJSON(entries)
	return nil
}

// nullableIntJSON encodes a nullable integer as a JSON value.
func nullableIntJSON(value *int) json.RawMessage {
	if value == nil {
		return mustJSON(nil)
	}
	return mustJSON(*value)
}

// triStateJSON encodes a domain tri-state value for the boolean field.
func triStateJSON(value domain.TriState) json.RawMessage {
	return mustJSON(value == domain.TriStateTrue)
}

// dateJSON encodes an optional timestamp as a plain epoch-millis integer.
func dateJSON(value *time.Time) json.RawMessage {
	if value == nil {
		return mustJSON(nil)
	}
	return mustJSON(value.UTC().UnixMilli())
}

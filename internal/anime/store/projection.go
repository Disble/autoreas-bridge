package store

import (
	"encoding/json"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

// strings projects a legacy JSON array field into string values.
func (r AnimeRaw) strings(key string) []string {
	value, ok := nonNullField(r.extraFields, key)
	if !ok {
		return []string{}
	}
	var encoded []json.RawMessage
	if err := json.Unmarshal(value, &encoded); err != nil {
		return []string{}
	}
	result := make([]string, 0, len(encoded))
	for _, item := range encoded {
		var decoded string
		if json.Unmarshal(item, &decoded) == nil {
			result = append(result, decoded)
		}
	}
	return result
}

// coverPath projects the path from the cover object.
func (r AnimeRaw) coverPath() *string {
	value, ok := nonNullField(r.extraFields, "cover")
	if !ok {
		return nil
	}
	var cover struct {
		Path *string `json:"path"`
	}
	if json.Unmarshal(value, &cover) != nil {
		return nil
	}
	return cover.Path
}

// repetitions projects repetition history into domain values.
func (r AnimeRaw) repetitions() []domain.Repetition {
	value, ok := nonNullField(r.extraFields, "repetitions")
	if !ok {
		return []domain.Repetition{}
	}
	var entries []map[string]json.RawMessage
	if json.Unmarshal(value, &entries) != nil {
		return []domain.Repetition{}
	}
	result := make([]domain.Repetition, 0, len(entries))
	for _, entry := range entries {
		repeatedAt := rawFieldDate(entry, "repeatedAt")
		repetition := domain.Repetition{
			Number:        rawFieldInt(entry, "numRepetitions"),
			Progress:      rawFieldNumber(entry, "episodesWatched"),
			Status:        rawFieldInt(entry, "status"),
			CreatedAt:     rawFieldDate(entry, "createdAt"),
			PremieredAt:   rawFieldDate(entry, "premieredAt"),
			LastWatchedAt: rawFieldDate(entry, "lastWatchedAt"),
			DeletedAt:     rawFieldDate(entry, "deletedAt"),
		}
		if repeatedAt != nil {
			repetition.RepeatedAt = *repeatedAt
		}
		result = append(result, repetition)
	}
	return result
}

// rawFieldNumber reads a numeric field from a raw JSON object.
func rawFieldNumber(fields map[string]json.RawMessage, key string) float64 {
	value, ok := nonNullField(fields, key)
	if !ok {
		return 0
	}
	var result float64
	_ = json.Unmarshal(value, &result)
	return result
}

// rawFieldInt reads an integer field from a raw JSON object.
func rawFieldInt(fields map[string]json.RawMessage, key string) int {
	return int(rawFieldNumber(fields, key))
}

// rawFieldDate reads a plain epoch-millis timestamp field from a raw JSON object.
func rawFieldDate(fields map[string]json.RawMessage, key string) *time.Time {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var millis int64
	if json.Unmarshal(value, &millis) != nil {
		return nil
	}
	result := time.UnixMilli(millis).UTC()
	return &result
}

// IsSoftDeleted reports whether a canonical payload carries both the
// inactive flag and a deletion timestamp.
func IsSoftDeleted(payload []byte) (bool, error) {
	_, value, _, err := decode(payload)
	if err != nil {
		return false, err
	}
	return value.Active == domain.TriStateFalse && value.DeletedAt != nil, nil
}

// Deactivate applies the English domain lifecycle transition while keeping
// every unknown Legacy wire field byte-semantically intact.
func Deactivate(payload []byte, at time.Time) ([]byte, error) {
	raw, value, _, err := decode(payload)
	if err != nil {
		return nil, err
	}
	value.Deactivate(at)
	return mergeLifecycle(raw, value)
}

// Reactivate clears the Legacy deletion state through the English aggregate
// while preserving fields the Bridge does not own.
func Reactivate(payload []byte) ([]byte, error) {
	raw, value, _, err := decode(payload)
	if err != nil {
		return nil, err
	}
	value.Restore()
	return mergeLifecycle(raw, value)
}

// mergeLifecycle applies domain lifecycle changes while preserving legacy fields.
func mergeLifecycle(raw AnimeRaw, value domain.Anime) ([]byte, error) {
	merged, err := NewMapper().Merge(raw, value)
	if err != nil {
		return nil, err
	}
	return merged.MarshalJSON()
}

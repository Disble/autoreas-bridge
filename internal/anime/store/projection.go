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

// coverPath projects the path from the legacy cover object.
func (r AnimeRaw) coverPath() *string {
	value, ok := nonNullField(r.extraFields, "portada")
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

// repetitions projects legacy repetition history into domain values.
func (r AnimeRaw) repetitions() []domain.Repetition {
	value, ok := nonNullField(r.extraFields, "repetir")
	if !ok {
		return []domain.Repetition{}
	}
	var entries []map[string]json.RawMessage
	if json.Unmarshal(value, &entries) != nil {
		return []domain.Repetition{}
	}
	result := make([]domain.Repetition, 0, len(entries))
	for _, entry := range entries {
		repeatedAt := legacyFieldDate(entry, "fechaRepeticion")
		repetition := domain.Repetition{
			Number:        legacyFieldInt(entry, "numrepeticion"),
			Progress:      legacyFieldNumber(entry, "nrocapvisto"),
			Status:        legacyFieldInt(entry, "estado"),
			CreatedAt:     legacyFieldDate(entry, "fechaCreacion"),
			PremieredAt:   legacyFieldDate(entry, "fechaEstreno"),
			LastWatchedAt: legacyFieldDate(entry, "fechaUltCapVisto"),
			DeletedAt:     legacyFieldDate(entry, "fechaEliminacion"),
		}
		if repeatedAt != nil {
			repetition.RepeatedAt = *repeatedAt
		}
		result = append(result, repetition)
	}
	return result
}

// legacyFieldNumber reads a numeric field from a legacy JSON object.
func legacyFieldNumber(fields map[string]json.RawMessage, key string) float64 {
	value, ok := nonNullField(fields, key)
	if !ok {
		return 0
	}
	var result float64
	_ = json.Unmarshal(value, &result)
	return result
}

// legacyFieldInt reads an integer field from a legacy JSON object.
func legacyFieldInt(fields map[string]json.RawMessage, key string) int {
	return int(legacyFieldNumber(fields, key))
}

// legacyFieldDate reads a wrapped timestamp field from a legacy JSON object.
func legacyFieldDate(fields map[string]json.RawMessage, key string) *time.Time {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var wrapper legacyDateWrapper
	if json.Unmarshal(value, &wrapper) != nil {
		return nil
	}
	result := time.UnixMilli(wrapper.Date).UTC()
	return &result
}

// IsSoftDeleted reports whether a canonical Legacy payload carries both the
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

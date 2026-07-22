package store

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

// AnimeRaw is the lossless canonical wire envelope. SDD-56 hard-cuts the
// vocabulary from Legacy-inherited Spanish to English; unknown fields remain
// opaque JSON.
type AnimeRaw struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	EpisodesWatched float64 `json:"episodesWatched"`

	extraFields map[string]json.RawMessage
}

// SetStringField stores a nullable string field in the raw payload.
func (r *AnimeRaw) SetStringField(key string, value *string) {
	if value == nil {
		r.extraFields[key] = mustJSON(nil)
		return
	}
	r.extraFields[key] = mustJSON(*value)
}

// SetIntField stores a nullable integer field in the raw payload.
func (r *AnimeRaw) SetIntField(key string, value *int) {
	if value == nil {
		r.extraFields[key] = mustJSON(nil)
		return
	}
	r.extraFields[key] = mustJSON(*value)
}

// SetFloatField stores a nullable numeric field in the raw payload.
func (r *AnimeRaw) SetFloatField(key string, value *float64) {
	if value == nil {
		r.extraFields[key] = mustJSON(nil)
		return
	}
	r.extraFields[key] = mustJSON(*value)
}

// SetBoolField stores a boolean field in the raw payload.
func (r *AnimeRaw) SetBoolField(key string, value bool) {
	r.extraFields[key] = mustJSON(value)
}

// SetDateField stores a nullable epoch-millis date field.
func (r *AnimeRaw) SetDateField(key string, value *time.Time) {
	if value == nil {
		r.extraFields[key] = mustJSON(nil)
		return
	}
	r.extraFields[key] = mustJSON(value.UTC().UnixMilli())
}

// SetDays stores modern days[] placement data and removes the flat single-day fallback fields.
func (r *AnimeRaw) SetDays(days []AnimeDay) {
	r.extraFields["days"] = mustJSON(days)
	delete(r.extraFields, "day")
	delete(r.extraFields, "order")
}

// SetStringArrayField stores a string slice field in the raw payload.
func (r *AnimeRaw) SetStringArrayField(key string, values []string) {
	r.extraFields[key] = mustJSON(values)
}

// SetCoverPath updates the cover.path field while preserving unknown cover keys.
func (r *AnimeRaw) SetCoverPath(path string) {
	raw := map[string]json.RawMessage{}
	if current, ok := nonNullField(r.extraFields, "cover"); ok {
		_ = json.Unmarshal(current, &raw)
	}
	if len(raw) == 0 {
		raw["type"] = mustJSON("url")
	}
	raw["path"] = mustJSON(path)
	if _, ok := raw["type"]; !ok {
		raw["type"] = mustJSON("url")
	}
	r.extraFields["cover"] = mustJSON(raw)
}

// SetStudios updates studios while preserving the clear-versus-null semantics.
func (r *AnimeRaw) SetStudios(clear bool, values []string) {
	if !clear {
		r.SetStringArrayField("studios", append([]string{}, values...))
		return
	}
	current, exists := r.extraFields["studios"]
	if !exists {
		return
	}
	if bytes.Equal(bytes.TrimSpace(current), []byte("null")) {
		r.extraFields["studios"] = mustJSON(nil)
		return
	}
	r.SetStringArrayField("studios", []string{})
}

// SetCover updates cover while preserving caller-provided extra metadata keys.
func (r *AnimeRaw) SetCover(clear bool, coverType, path string, extra map[string]json.RawMessage) {
	if clear {
		if current, exists := r.extraFields["cover"]; !exists || bytes.Equal(bytes.TrimSpace(current), []byte("null")) {
			if exists {
				r.extraFields["cover"] = mustJSON(nil)
			}
			return
		}
		r.SetCoverPath("")
		return
	}
	raw := map[string]json.RawMessage{}
	if current, ok := nonNullField(r.extraFields, "cover"); ok {
		_ = json.Unmarshal(current, &raw)
	}
	for key, value := range extra {
		raw[key] = append(json.RawMessage(nil), value...)
	}
	raw["type"] = mustJSON(coverType)
	raw["path"] = mustJSON(path)
	r.extraFields["cover"] = mustJSON(raw)
}

// DeleteField removes one raw field from the payload.
func (r *AnimeRaw) DeleteField(key string) {
	delete(r.extraFields, key)
}

// AnimeDay is the raw schedule placement entry.
type AnimeDay struct {
	Day   string  `json:"day"`
	Order float64 `json:"order"`
}

// UnmarshalJSON decodes a lossless raw payload while validating key fields.
func (r *AnimeRaw) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return fmt.Errorf("unmarshal anime payload: %w", err)
	}

	r.extraFields = cloneFields(fields)
	if err := unmarshalKnown(fields, "id", &r.ID); err != nil {
		return err
	}
	if err := unmarshalKnown(fields, "name", &r.Name); err != nil {
		return err
	}
	if err := unmarshalKnown(fields, "episodesWatched", &r.EpisodesWatched); err != nil {
		return err
	}
	if err := validateKnownFields(fields); err != nil {
		return err
	}

	return nil
}

// MarshalJSON re-encodes the lossless raw payload with deterministic key order.
func (r AnimeRaw) MarshalJSON() ([]byte, error) {
	fields := cloneFields(r.extraFields)
	fields["id"] = mustJSON(r.ID)
	fields["name"] = mustJSON(r.Name)
	fields["episodesWatched"] = mustJSON(r.EpisodesWatched)
	return marshalFields(fields)
}

// unmarshalKnown decodes a known field when it is present.
func unmarshalKnown(fields map[string]json.RawMessage, key string, target any) error {
	value, ok := fields[key]
	if !ok {
		return nil
	}
	if err := json.Unmarshal(value, target); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

// nonNullField returns a present field that is not JSON null.
func nonNullField(fields map[string]json.RawMessage, key string) (json.RawMessage, bool) {
	value, ok := fields[key]
	if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return nil, false
	}
	return value, true
}

// number decodes an optional numeric field.
func (r AnimeRaw) number(key string) *float64 {
	value, ok := nonNullField(r.extraFields, key)
	if !ok {
		return nil
	}
	var decoded float64
	if json.Unmarshal(value, &decoded) != nil {
		return nil
	}
	return &decoded
}

// integer decodes an optional integer field.
func (r AnimeRaw) integer(key string) *int {
	value := r.number(key)
	if value == nil {
		return nil
	}
	decoded := int(*value)
	return &decoded
}

// stringValue decodes an optional string field.
func (r AnimeRaw) stringValue(key string) *string {
	value, ok := nonNullField(r.extraFields, key)
	if !ok {
		return nil
	}
	var decoded string
	if json.Unmarshal(value, &decoded) != nil {
		return nil
	}
	return &decoded
}

// date decodes an optional epoch-millis date field.
func (r AnimeRaw) date(key string) *time.Time {
	value, ok := nonNullField(r.extraFields, key)
	if !ok {
		return nil
	}
	var millis int64
	if json.Unmarshal(value, &millis) != nil {
		return nil
	}
	decoded := time.UnixMilli(millis).UTC()
	return &decoded
}

// triState decodes a boolean field into a tri-state value.
func (r AnimeRaw) triState(key string) domain.TriState {
	value, exists := r.extraFields[key]
	if !exists {
		return domain.TriStateAbsent
	}
	var decoded bool
	if bytes.Equal(bytes.TrimSpace(value), []byte("null")) || json.Unmarshal(value, &decoded) != nil || !decoded {
		return domain.TriStateFalse
	}
	return domain.TriStateTrue
}

// days decodes schedule fields into anime days.
func (r AnimeRaw) days() []AnimeDay {
	value, ok := nonNullField(r.extraFields, "days")
	if ok {
		var days []AnimeDay
		if json.Unmarshal(value, &days) == nil && len(days) > 0 {
			return days
		}
	}
	day := r.stringValue("day")
	order := r.number("order")
	if day == nil || order == nil {
		return nil
	}
	return []AnimeDay{{Day: *day, Order: *order}}
}

// cloneFields copies raw JSON field values into a new map.
func cloneFields(input map[string]json.RawMessage) map[string]json.RawMessage {
	fields := make(map[string]json.RawMessage, len(input))
	for key, value := range input {
		fields[key] = append(json.RawMessage(nil), value...)
	}
	return fields
}

// mustJSON marshals a value and panics when marshaling fails.
func mustJSON(value any) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}

// marshalFields encodes raw JSON fields in deterministic key order.
func marshalFields(fields map[string]json.RawMessage) ([]byte, error) {
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var buffer bytes.Buffer
	buffer.WriteByte('{')
	for index, key := range keys {
		if index > 0 {
			buffer.WriteByte(',')
		}
		encodedKey, err := json.Marshal(key)
		if err != nil {
			return nil, fmt.Errorf("marshal JSON key %q: %w", key, err)
		}
		buffer.Write(encodedKey)
		buffer.WriteByte(':')
		buffer.Write(fields[key])
	}
	buffer.WriteByte('}')
	return buffer.Bytes(), nil
}

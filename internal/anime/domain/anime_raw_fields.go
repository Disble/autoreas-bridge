package domain

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

func (f *LegacyDateField) UnmarshalJSON(data []byte) error {
	f.raw.set(data)
	if f.raw.IsNull() {
		f.value = time.Time{}
		return nil
	}

	var rawWrapper map[string]json.RawMessage
	if err := json.Unmarshal(f.raw.bytes, &rawWrapper); err != nil {
		return fmt.Errorf("unmarshal legacy date wrapper: %w", err)
	}

	dateValue, ok := rawWrapper["$$date"]
	if !ok || len(rawWrapper) != 1 {
		return fmt.Errorf("unmarshal legacy date wrapper: expected object with only $$date")
	}

	var wrapper legacyDateWrapper
	if err := json.Unmarshal(dateValue, &wrapper.Date); err != nil {
		return fmt.Errorf("unmarshal legacy date wrapper: %w", err)
	}

	f.value = time.UnixMilli(wrapper.Date).UTC()
	return nil
}

func (f LegacyDateField) MarshalJSON() ([]byte, error) { return f.raw.marshal(), nil }
func (f LegacyDateField) IsAbsent() bool               { return f.raw.IsAbsent() }
func (f LegacyDateField) IsNull() bool                 { return f.raw.IsNull() }
func (f LegacyDateField) IsZero() bool                 { return f.raw.IsAbsent() }

func (f LegacyDateField) Time() *time.Time {
	if !f.raw.IsValue() {
		return nil
	}

	value := f.value
	return &value
}

func (f *LegacyBoolField) UnmarshalJSON(data []byte) error {
	f.raw.set(data)
	if !f.raw.IsValue() {
		f.value = false
		return nil
	}

	return json.Unmarshal(f.raw.bytes, &f.value)
}

func (f LegacyBoolField) MarshalJSON() ([]byte, error) { return f.raw.marshal(), nil }
func (f LegacyBoolField) IsZero() bool                 { return f.raw.IsAbsent() }

func (f LegacyBoolField) TriState() TriState {
	switch {
	case f.raw.IsAbsent():
		return TriStateAbsent
	case f.value:
		return TriStateTrue
	default:
		return TriStateFalse
	}
}

func (f *LegacyStringField) UnmarshalJSON(data []byte) error {
	f.raw.set(data)
	if !f.raw.IsValue() {
		f.value = ""
		return nil
	}

	return json.Unmarshal(f.raw.bytes, &f.value)
}

func (f LegacyStringField) MarshalJSON() ([]byte, error) { return f.raw.marshal(), nil }
func (f LegacyStringField) IsZero() bool                 { return f.raw.IsAbsent() }
func (f LegacyStringField) IsAbsent() bool               { return f.raw.IsAbsent() }
func (f LegacyStringField) IsNull() bool                 { return f.raw.IsNull() }
func (f LegacyStringField) IsPresent() bool              { return !f.raw.IsAbsent() }

func (f LegacyStringField) String() *string {
	if !f.raw.IsValue() {
		return nil
	}

	value := f.value
	return &value
}

func (f *LegacyNumberField) UnmarshalJSON(data []byte) error {
	f.raw.set(data)
	if !f.raw.IsValue() {
		f.value = 0
		return nil
	}

	return json.Unmarshal(f.raw.bytes, &f.value)
}

func (f LegacyNumberField) MarshalJSON() ([]byte, error) { return f.raw.marshal(), nil }
func (f LegacyNumberField) IsZero() bool                 { return f.raw.IsAbsent() }
func (f LegacyNumberField) IsAbsent() bool               { return f.raw.IsAbsent() }
func (f LegacyNumberField) IsNull() bool                 { return f.raw.IsNull() }

func (f LegacyNumberField) Float64() *float64 {
	if !f.raw.IsValue() {
		return nil
	}

	value := f.value
	return &value
}

func (f LegacyNumberField) Int() *int {
	value := f.Float64()
	if value == nil {
		return nil
	}

	result := int(*value)
	return &result
}

func (f *LegacyJSONArrayField) UnmarshalJSON(data []byte) error {
	f.raw.set(data)
	if !f.raw.IsValue() {
		f.value = nil
		return nil
	}

	var emptyString string
	if err := json.Unmarshal(f.raw.bytes, &emptyString); err == nil && emptyString == "" {
		f.value = nil
		return nil
	}

	return json.Unmarshal(f.raw.bytes, &f.value)
}

func (f LegacyJSONArrayField) MarshalJSON() ([]byte, error) { return f.raw.marshal(), nil }
func (f LegacyJSONArrayField) IsZero() bool                 { return f.raw.IsAbsent() }
func (f LegacyJSONArrayField) IsAbsent() bool               { return f.raw.IsAbsent() }
func (f LegacyJSONArrayField) IsNull() bool                 { return f.raw.IsNull() }

func (f LegacyJSONArrayField) Values() []json.RawMessage {
	if !f.raw.IsValue() {
		return nil
	}

	values := make([]json.RawMessage, len(f.value))
	copy(values, f.value)
	return values
}

func (f *LegacyAnimeDaysField) UnmarshalJSON(data []byte) error {
	f.raw.set(data)
	if !f.raw.IsValue() {
		f.val = nil
		return nil
	}

	return json.Unmarshal(f.raw.bytes, &f.val)
}

func (f LegacyAnimeDaysField) MarshalJSON() ([]byte, error) { return f.raw.marshal(), nil }
func (f LegacyAnimeDaysField) IsZero() bool                 { return f.raw.IsAbsent() }

func (f LegacyAnimeDaysField) Values() []LegacyAnimeDay {
	if !f.raw.IsValue() {
		return nil
	}

	values := make([]LegacyAnimeDay, len(f.val))
	copy(values, f.val)
	return values
}

func (f *LegacyRepetirField) UnmarshalJSON(data []byte) error {
	f.raw.set(data)
	if !f.raw.IsValue() {
		f.val = nil
		return nil
	}

	return json.Unmarshal(f.raw.bytes, &f.val)
}

func (f LegacyRepetirField) MarshalJSON() ([]byte, error) { return f.raw.marshal(), nil }
func (f LegacyRepetirField) IsZero() bool                 { return f.raw.IsAbsent() }

func (f LegacyRepetirField) Values() []LegacyRepeticion {
	if !f.raw.IsValue() {
		return nil
	}

	values := make([]LegacyRepeticion, len(f.val))
	copy(values, f.val)
	return values
}

func newLegacyNumberField(value float64) LegacyNumberField {
	return LegacyNumberField{
		raw:   rawField{state: rawFieldValue, bytes: mustMarshalJSON(value)},
		value: value,
	}
}

func newLegacyAnimeDaysField(days []LegacyAnimeDay) LegacyAnimeDaysField {
	encoded := mustMarshalJSON(days)
	return LegacyAnimeDaysField{
		raw: rawField{state: rawFieldValue, bytes: encoded},
		val: append([]LegacyAnimeDay(nil), days...),
	}
}

func newLegacyDateField(value time.Time) LegacyDateField {
	utc := value.UTC()
	encoded := mustMarshalJSON(map[string]int64{"$$date": utc.UnixMilli()})
	return LegacyDateField{
		raw:   rawField{state: rawFieldValue, bytes: encoded},
		value: utc,
	}
}

func newLegacyNullDateField() LegacyDateField {
	return LegacyDateField{
		raw: rawField{state: rawFieldNull, bytes: []byte("null")},
	}
}

func newLegacyBoolField(value bool) LegacyBoolField {
	return LegacyBoolField{
		raw:   rawField{state: rawFieldValue, bytes: mustMarshalJSON(value)},
		value: value,
	}
}

func (f *rawField) set(data []byte) {
	trimmed := bytes.TrimSpace(data)
	f.bytes = append(f.bytes[:0], trimmed...)
	switch {
	case len(trimmed) == 0:
		f.state = rawFieldAbsent
	case bytes.Equal(trimmed, []byte("null")):
		f.state = rawFieldNull
	default:
		f.state = rawFieldValue
	}
}

func (f rawField) marshal() []byte {
	if f.IsAbsent() {
		return []byte("null")
	}

	return append([]byte(nil), f.bytes...)
}

func (f rawField) IsAbsent() bool { return f.state == rawFieldAbsent }
func (f rawField) IsNull() bool   { return f.state == rawFieldNull }
func (f rawField) IsValue() bool  { return f.state == rawFieldValue }

func cloneJSON(value []byte) []byte {
	if value == nil {
		return nil
	}

	return append([]byte(nil), value...)
}

func assignOptionalField(fields map[string]json.RawMessage, key string, field rawField) {
	if field.IsAbsent() {
		delete(fields, key)
		return
	}

	assignJSON(fields, key, field.marshal())
}

func assignJSON(fields map[string]json.RawMessage, key string, value []byte) {
	fields[key] = cloneJSON(value)
}

func mustMarshalJSON(value any) []byte {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}

	return encoded
}

func marshalJSONObject(fields map[string]json.RawMessage) ([]byte, error) {
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

		keyJSON, err := json.Marshal(key)
		if err != nil {
			return nil, fmt.Errorf("marshal json key %q: %w", key, err)
		}

		buffer.Write(keyJSON)
		buffer.WriteByte(':')
		buffer.Write(fields[key])
	}
	buffer.WriteByte('}')

	return buffer.Bytes(), nil
}

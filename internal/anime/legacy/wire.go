package legacy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

// LegacyAnimeRaw is the lossless Legacy wire envelope. Spanish identifiers are
// intentionally confined to this adapter; unknown fields remain opaque JSON.
type LegacyAnimeRaw struct {
	ID          string  `json:"_id"`
	Nombre      string  `json:"nombre"`
	NroCapVisto float64 `json:"nrocapvisto"`

	extraFields map[string]json.RawMessage
}

func (r *LegacyAnimeRaw) SetStringField(key string, value *string) {
	if value == nil {
		r.extraFields[key] = mustJSON(nil)
		return
	}
	r.extraFields[key] = mustJSON(*value)
}

func (r *LegacyAnimeRaw) SetIntField(key string, value *int) {
	if value == nil {
		r.extraFields[key] = mustJSON(nil)
		return
	}
	r.extraFields[key] = mustJSON(*value)
}

func (r *LegacyAnimeRaw) SetFloatField(key string, value *float64) {
	if value == nil {
		r.extraFields[key] = mustJSON(nil)
		return
	}
	r.extraFields[key] = mustJSON(*value)
}

func (r *LegacyAnimeRaw) SetBoolField(key string, value bool) {
	r.extraFields[key] = mustJSON(value)
}

func (r *LegacyAnimeRaw) SetDateField(key string, value *time.Time) {
	if value == nil {
		r.extraFields[key] = mustJSON(nil)
		return
	}
	r.extraFields[key] = mustJSON(legacyDateWrapper{Date: value.UTC().UnixMilli()})
}

func (r *LegacyAnimeRaw) SetDays(days []LegacyAnimeDay) {
	r.extraFields["dias"] = mustJSON(days)
	delete(r.extraFields, "dia")
	delete(r.extraFields, "orden")
}

func (r *LegacyAnimeRaw) SetStringArrayField(key string, values []string) {
	r.extraFields[key] = mustJSON(values)
}

func (r *LegacyAnimeRaw) SetPortada(path string) {
	raw := map[string]json.RawMessage{}
	if current, ok := nonNullField(r.extraFields, "portada"); ok {
		_ = json.Unmarshal(current, &raw)
	}
	if len(raw) == 0 {
		raw["type"] = mustJSON("url")
	}
	raw["path"] = mustJSON(path)
	if _, ok := raw["type"]; !ok {
		raw["type"] = mustJSON("url")
	}
	r.extraFields["portada"] = mustJSON(raw)
}

func (r *LegacyAnimeRaw) SetStudios(clear bool, values []string) {
	if !clear {
		r.SetStringArrayField("estudios", append([]string{}, values...))
		return
	}
	current, exists := r.extraFields["estudios"]
	if !exists {
		return
	}
	if bytes.Equal(bytes.TrimSpace(current), []byte("null")) {
		r.extraFields["estudios"] = mustJSON(nil)
		return
	}
	r.SetStringArrayField("estudios", []string{})
}

func (r *LegacyAnimeRaw) SetCover(clear bool, coverType, path string, extra map[string]json.RawMessage) {
	if clear {
		if current, exists := r.extraFields["portada"]; !exists || bytes.Equal(bytes.TrimSpace(current), []byte("null")) {
			if exists {
				r.extraFields["portada"] = mustJSON(nil)
			}
			return
		}
		r.SetPortada("")
		return
	}
	raw := map[string]json.RawMessage{}
	if current, ok := nonNullField(r.extraFields, "portada"); ok {
		_ = json.Unmarshal(current, &raw)
	}
	for key, value := range extra {
		raw[key] = append(json.RawMessage(nil), value...)
	}
	raw["type"] = mustJSON(coverType)
	raw["path"] = mustJSON(path)
	r.extraFields["portada"] = mustJSON(raw)
}

func (r *LegacyAnimeRaw) DeleteField(key string) {
	delete(r.extraFields, key)
}

type LegacyAnimeDay struct {
	Dia   string  `json:"dia"`
	Orden float64 `json:"orden"`
}

type legacyDateWrapper struct {
	Date int64 `json:"$$date"`
}

func (r *LegacyAnimeRaw) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return fmt.Errorf("unmarshal legacy anime payload: %w", err)
	}

	r.extraFields = cloneFields(fields)
	if err := unmarshalKnown(fields, "_id", &r.ID); err != nil {
		return err
	}
	if err := unmarshalKnown(fields, "nombre", &r.Nombre); err != nil {
		return err
	}
	if err := unmarshalKnown(fields, "nrocapvisto", &r.NroCapVisto); err != nil {
		return err
	}
	if err := validateKnownFields(fields); err != nil {
		return err
	}

	return nil
}

func (r LegacyAnimeRaw) MarshalJSON() ([]byte, error) {
	fields := cloneFields(r.extraFields)
	fields["_id"] = mustJSON(r.ID)
	fields["nombre"] = mustJSON(r.Nombre)
	fields["nrocapvisto"] = mustJSON(r.NroCapVisto)
	return marshalFields(fields)
}

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

func validateKnownFields(fields map[string]json.RawMessage) error {
	for _, key := range []string{"estado", "totalcap", "duracion", "tipo", "orden"} {
		if err := validateNullableNumber(fields, key); err != nil {
			return err
		}
	}
	for _, key := range []string{"activo", "primeravez"} {
		if err := validateNullableBool(fields, key); err != nil {
			return err
		}
	}
	for _, key := range []string{"pagina", "carpeta", "origen", "dia"} {
		if err := validateNullableString(fields, key); err != nil {
			return err
		}
	}
	for _, key := range []string{"fechaEstreno", "fechaUltCapVisto", "fechaCreacion", "fechaEliminacion"} {
		if err := validateNullableDate(fields, key); err != nil {
			return err
		}
	}
	for _, key := range []string{"estudios", "generos"} {
		if err := validateNullableArray(fields, key); err != nil {
			return err
		}
	}
	if err := validateDays(fields); err != nil {
		return err
	}
	if err := validateRepetitions(fields); err != nil {
		return err
	}
	return nil
}

func validateNullableNumber(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var decoded float64
	if err := json.Unmarshal(value, &decoded); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

func validateNullableBool(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var decoded bool
	if err := json.Unmarshal(value, &decoded); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

func validateNullableString(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var decoded string
	if err := json.Unmarshal(value, &decoded); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

func validateNullableDate(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}

	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(value, &wrapper); err != nil {
		return fmt.Errorf("unmarshal %s: unmarshal legacy date wrapper: %w", key, err)
	}
	dateValue, ok := wrapper["$$date"]
	if !ok || len(wrapper) != 1 {
		return fmt.Errorf("unmarshal %s: unmarshal legacy date wrapper: expected object with only $$date", key)
	}
	var date int64
	if err := json.Unmarshal(dateValue, &date); err != nil {
		return fmt.Errorf("unmarshal %s: unmarshal legacy date wrapper: %w", key, err)
	}
	return nil
}

func validateNullableArray(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var empty string
	if err := json.Unmarshal(value, &empty); err == nil && empty == "" {
		return nil
	}
	var decoded []json.RawMessage
	if err := json.Unmarshal(value, &decoded); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

func validateDays(fields map[string]json.RawMessage) error {
	value, ok := nonNullField(fields, "dias")
	if !ok {
		return nil
	}
	var days []LegacyAnimeDay
	if err := json.Unmarshal(value, &days); err != nil {
		return fmt.Errorf("unmarshal dias: %w", err)
	}
	return nil
}

func validateRepetitions(fields map[string]json.RawMessage) error {
	value, ok := nonNullField(fields, "repetir")
	if !ok {
		return nil
	}
	var repetitions []map[string]json.RawMessage
	if err := json.Unmarshal(value, &repetitions); err != nil {
		return fmt.Errorf("unmarshal repetir: %w", err)
	}
	for index, repetition := range repetitions {
		for _, key := range []string{"numrepeticion", "nrocapvisto", "estado"} {
			if err := validateNullableNumber(repetition, key); err != nil {
				return fmt.Errorf("unmarshal repetir[%d]: %w", index, err)
			}
		}
		for _, key := range []string{"fechaCreacion", "fechaEstreno", "fechaUltCapVisto", "fechaEliminacion", "fechaRepeticion"} {
			if err := validateNullableDate(repetition, key); err != nil {
				return fmt.Errorf("unmarshal repetir[%d]: %w", index, err)
			}
		}
	}
	return nil
}

func nonNullField(fields map[string]json.RawMessage, key string) (json.RawMessage, bool) {
	value, ok := fields[key]
	if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return nil, false
	}
	return value, true
}

func (r LegacyAnimeRaw) number(key string) *float64 {
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

func (r LegacyAnimeRaw) integer(key string) *int {
	value := r.number(key)
	if value == nil {
		return nil
	}
	decoded := int(*value)
	return &decoded
}

func (r LegacyAnimeRaw) stringValue(key string) *string {
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

func (r LegacyAnimeRaw) date(key string) *time.Time {
	value, ok := nonNullField(r.extraFields, key)
	if !ok {
		return nil
	}
	var wrapper legacyDateWrapper
	if json.Unmarshal(value, &wrapper) != nil {
		return nil
	}
	decoded := time.UnixMilli(wrapper.Date).UTC()
	return &decoded
}

func (r LegacyAnimeRaw) triState(key string) domain.TriState {
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

func (r LegacyAnimeRaw) days() []LegacyAnimeDay {
	value, ok := nonNullField(r.extraFields, "dias")
	if ok {
		var days []LegacyAnimeDay
		if json.Unmarshal(value, &days) == nil && len(days) > 0 {
			return days
		}
	}
	day := r.stringValue("dia")
	order := r.number("orden")
	if day == nil || order == nil {
		return nil
	}
	return []LegacyAnimeDay{{Dia: *day, Orden: *order}}
}

func cloneFields(input map[string]json.RawMessage) map[string]json.RawMessage {
	fields := make(map[string]json.RawMessage, len(input))
	for key, value := range input {
		fields[key] = append(json.RawMessage(nil), value...)
	}
	return fields
}

func mustJSON(value any) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}

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

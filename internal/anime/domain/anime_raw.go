package domain

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

type LegacyAnimeRaw struct {
	ID               string               `json:"_id"`
	Nombre           string               `json:"nombre"`
	NroCapVisto      float64              `json:"nrocapvisto"`
	Estado           LegacyNumberField    `json:"estado,omitempty"`
	TotalCap         LegacyNumberField    `json:"totalcap,omitempty"`
	Activo           LegacyBoolField      `json:"activo,omitempty"`
	Primeravez       LegacyBoolField      `json:"primeravez,omitempty"`
	FechaEstreno     LegacyDateField      `json:"fechaEstreno,omitempty"`
	FechaUltCapVisto LegacyDateField      `json:"fechaUltCapVisto,omitempty"`
	FechaCreacion    LegacyDateField      `json:"fechaCreacion,omitempty"`
	FechaEliminacion LegacyDateField      `json:"fechaEliminacion,omitempty"`
	Duracion         LegacyNumberField    `json:"duracion,omitempty"`
	Tipo             LegacyNumberField    `json:"tipo,omitempty"`
	Pagina           LegacyStringField    `json:"pagina,omitempty"`
	Carpeta          LegacyStringField    `json:"carpeta,omitempty"`
	Origen           LegacyStringField    `json:"origen,omitempty"`
	Estudios         LegacyJSONArrayField `json:"estudios,omitempty"`
	Generos          LegacyJSONArrayField `json:"generos,omitempty"`
	Dia              LegacyStringField    `json:"dia,omitempty"`
	Orden            LegacyNumberField    `json:"orden,omitempty"`
	Dias             LegacyAnimeDaysField `json:"dias,omitempty"`
	Portada          json.RawMessage      `json:"portada,omitempty"`

	extraFields map[string]json.RawMessage
}

type LegacyAnimeDay struct {
	Dia   string  `json:"dia"`
	Orden float64 `json:"orden"`
}

type LegacyAnimeDaysField struct {
	raw rawField
	val []LegacyAnimeDay
}

type LegacyDateField struct {
	raw   rawField
	value time.Time
}

type LegacyBoolField struct {
	raw   rawField
	value bool
}

type LegacyStringField struct {
	raw   rawField
	value string
}

type LegacyNumberField struct {
	raw   rawField
	value float64
}

type LegacyJSONArrayField struct {
	raw   rawField
	value []json.RawMessage
}

type rawField struct {
	state rawFieldState
	bytes []byte
}

type rawFieldState int

const (
	rawFieldAbsent rawFieldState = iota
	rawFieldNull
	rawFieldValue
)

type legacyDateWrapper struct {
	Date int64 `json:"$$date"`
}

func (r *LegacyAnimeRaw) UnmarshalJSON(data []byte) error {
	type payloadMap map[string]json.RawMessage

	var raw payloadMap
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("unmarshal legacy anime payload: %w", err)
	}

	r.extraFields = make(map[string]json.RawMessage, len(raw))
	for key, value := range raw {
		r.extraFields[key] = cloneJSON(value)
	}

	if value, ok := raw["_id"]; ok {
		if err := json.Unmarshal(value, &r.ID); err != nil {
			return fmt.Errorf("unmarshal _id: %w", err)
		}
	}

	if value, ok := raw["nombre"]; ok {
		if err := json.Unmarshal(value, &r.Nombre); err != nil {
			return fmt.Errorf("unmarshal nombre: %w", err)
		}
	}

	if value, ok := raw["nrocapvisto"]; ok {
		if err := json.Unmarshal(value, &r.NroCapVisto); err != nil {
			return fmt.Errorf("unmarshal nrocapvisto: %w", err)
		}
	}

	if value, ok := raw["estado"]; ok {
		if err := r.Estado.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal estado: %w", err)
		}
	}

	if value, ok := raw["totalcap"]; ok {
		if err := r.TotalCap.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal totalcap: %w", err)
		}
	}

	if value, ok := raw["activo"]; ok {
		if err := r.Activo.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal activo: %w", err)
		}
	}

	if value, ok := raw["primeravez"]; ok {
		if err := r.Primeravez.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal primeravez: %w", err)
		}
	}

	if value, ok := raw["fechaEstreno"]; ok {
		if err := r.FechaEstreno.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal fechaEstreno: %w", err)
		}
	}

	if value, ok := raw["fechaUltCapVisto"]; ok {
		if err := r.FechaUltCapVisto.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal fechaUltCapVisto: %w", err)
		}
	}

	if value, ok := raw["fechaCreacion"]; ok {
		if err := r.FechaCreacion.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal fechaCreacion: %w", err)
		}
	}

	if value, ok := raw["fechaEliminacion"]; ok {
		if err := r.FechaEliminacion.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal fechaEliminacion: %w", err)
		}
	}

	if value, ok := raw["duracion"]; ok {
		if err := r.Duracion.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal duracion: %w", err)
		}
	}

	if value, ok := raw["tipo"]; ok {
		if err := r.Tipo.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal tipo: %w", err)
		}
	}

	if value, ok := raw["pagina"]; ok {
		if err := r.Pagina.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal pagina: %w", err)
		}
	}

	if value, ok := raw["carpeta"]; ok {
		if err := r.Carpeta.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal carpeta: %w", err)
		}
	}

	if value, ok := raw["origen"]; ok {
		if err := r.Origen.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal origen: %w", err)
		}
	}

	if value, ok := raw["estudios"]; ok {
		if err := r.Estudios.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal estudios: %w", err)
		}
	}

	if value, ok := raw["generos"]; ok {
		if err := r.Generos.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal generos: %w", err)
		}
	}

	if value, ok := raw["dia"]; ok {
		if err := r.Dia.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal dia: %w", err)
		}
	}

	if value, ok := raw["orden"]; ok {
		if err := r.Orden.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal orden: %w", err)
		}
	}

	if value, ok := raw["dias"]; ok {
		if err := r.Dias.UnmarshalJSON(value); err != nil {
			return fmt.Errorf("unmarshal dias: %w", err)
		}
	}

	if value, ok := raw["portada"]; ok {
		r.Portada = cloneJSON(value)
	}

	return nil
}

func (r LegacyAnimeRaw) MarshalJSON() ([]byte, error) {
	fields := make(map[string]json.RawMessage, len(r.extraFields)+15)
	for key, value := range r.extraFields {
		fields[key] = cloneJSON(value)
	}

	assignJSON(fields, "_id", mustMarshalJSON(r.ID))
	assignJSON(fields, "nombre", mustMarshalJSON(r.Nombre))
	assignJSON(fields, "nrocapvisto", mustMarshalJSON(r.NroCapVisto))
	assignOptionalField(fields, "estado", r.Estado.raw)
	assignOptionalField(fields, "totalcap", r.TotalCap.raw)
	assignOptionalField(fields, "activo", r.Activo.raw)
	assignOptionalField(fields, "primeravez", r.Primeravez.raw)
	assignOptionalField(fields, "fechaEstreno", r.FechaEstreno.raw)
	assignOptionalField(fields, "fechaUltCapVisto", r.FechaUltCapVisto.raw)
	assignOptionalField(fields, "fechaCreacion", r.FechaCreacion.raw)
	assignOptionalField(fields, "fechaEliminacion", r.FechaEliminacion.raw)
	assignOptionalField(fields, "duracion", r.Duracion.raw)
	assignOptionalField(fields, "tipo", r.Tipo.raw)
	assignOptionalField(fields, "pagina", r.Pagina.raw)
	assignOptionalField(fields, "carpeta", r.Carpeta.raw)
	assignOptionalField(fields, "origen", r.Origen.raw)
	assignOptionalField(fields, "estudios", r.Estudios.raw)
	assignOptionalField(fields, "generos", r.Generos.raw)
	assignOptionalField(fields, "dia", r.Dia.raw)
	assignOptionalField(fields, "orden", r.Orden.raw)
	assignOptionalField(fields, "dias", r.Dias.raw)

	if len(r.Portada) > 0 {
		assignJSON(fields, "portada", r.Portada)
	}

	return marshalJSONObject(fields)
}

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

func (f LegacyDateField) MarshalJSON() ([]byte, error) {
	return f.raw.marshal(), nil
}

func (f LegacyDateField) IsAbsent() bool { return f.raw.IsAbsent() }
func (f LegacyDateField) IsNull() bool   { return f.raw.IsNull() }

func (f LegacyDateField) Time() *time.Time {
	if !f.raw.IsValue() {
		return nil
	}

	value := f.value
	return &value
}

func (f LegacyDateField) IsZero() bool { return f.raw.IsAbsent() }

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
	if err := json.Unmarshal(f.raw.bytes, &emptyString); err == nil {
		if emptyString == "" {
			f.value = nil
			return nil
		}
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

func (r LegacyAnimeRaw) EstadoValue() *int {
	value := r.Estado.Float64()
	if value == nil {
		return nil
	}

	result := int(*value)
	return &result
}

func (r LegacyAnimeRaw) TotalCapValue() *float64 {
	return r.TotalCap.Float64()
}

func (r LegacyAnimeRaw) GenerosStrings() []string {
	return rawMessagesToStrings(r.Generos.Values())
}

func (r LegacyAnimeRaw) EstudiosString() *string {
	return joinLegacyStrings(r.Estudios.Values())
}

func (r LegacyAnimeRaw) PortadaPath() *string {
	if len(r.Portada) == 0 {
		return nil
	}
	var payload struct {
		Path *string `json:"path"`
	}
	if err := json.Unmarshal(r.Portada, &payload); err != nil {
		return nil
	}
	return payload.Path
}

func (r LegacyAnimeRaw) DiasStrings() []string {
	values := r.Dias.Values()
	if len(values) > 0 {
		result := make([]string, 0, len(values))
		for _, value := range values {
			result = append(result, value.Dia)
		}
		return result
	}

	legacyDay := r.Dia.String()
	if legacyDay == nil {
		return nil
	}

	return []string{*legacyDay}
}

func (r *LegacyAnimeRaw) SetEstado(value int) {
	r.Estado = newLegacyNumberField(float64(value))
}

func (r *LegacyAnimeRaw) SetNroCapVisto(value float64) {
	r.NroCapVisto = value
	assignJSON(r.ensureExtraFields(), "nrocapvisto", mustMarshalJSON(value))
}

func (r *LegacyAnimeRaw) SetDias(days []string) {
	legacyDays := make([]LegacyAnimeDay, 0, len(days))
	for index, day := range days {
		legacyDays = append(legacyDays, LegacyAnimeDay{Dia: day, Orden: float64(index + 1)})
	}

	r.Dias = newLegacyAnimeDaysField(legacyDays)
	r.Dia = LegacyStringField{}
	r.Orden = LegacyNumberField{}
}

func (r *LegacyAnimeRaw) StampServerTimestamp(at time.Time) {
	r.FechaUltCapVisto = newLegacyDateField(at)
}

func (r *LegacyAnimeRaw) ensureExtraFields() map[string]json.RawMessage {
	if r.extraFields == nil {
		r.extraFields = make(map[string]json.RawMessage)
	}

	return r.extraFields
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

func rawMessagesToStrings(values []json.RawMessage) []string {
	if len(values) == 0 {
		return []string{}
	}
	result := make([]string, 0, len(values))
	for _, raw := range values {
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			continue
		}
		result = append(result, value)
	}
	if len(result) == 0 {
		return []string{}
	}
	return result
}

func joinLegacyStrings(values []json.RawMessage) *string {
	parts := rawMessagesToStrings(values)
	if len(parts) == 0 {
		return nil
	}
	joined := strings.Join(parts, ", ")
	return &joined
}

func (r LegacyAnimeRaw) ToAnime() Anime {
	anime := Anime{
		ID:          r.ID,
		Nombre:      r.Nombre,
		NroCapVisto: r.NroCapVisto,
		ActivoState: r.Activo.TriState(),
	}

	if value := r.FechaEstreno.Time(); value != nil {
		anime.FechaEstreno = value
	}

	if value := r.FechaUltCapVisto.Time(); value != nil {
		anime.FechaUltCapVisto = value
	}

	if days := r.Dias.Values(); len(days) > 0 {
		anime.Dias = make([]AnimeDay, 0, len(days))
		for _, day := range days {
			anime.Dias = append(anime.Dias, AnimeDay{Day: day.Dia, Order: day.Orden})
		}
		return anime
	}

	day := r.Dia.String()
	order := r.Orden.Float64()
	if day != nil && order != nil {
		anime.Dias = []AnimeDay{{Day: *day, Order: *order}}
	}

	return anime
}

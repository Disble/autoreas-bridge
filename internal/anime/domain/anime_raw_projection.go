package domain

import (
	"encoding/json"
	"strings"
	"time"

	"autoreas-bridge/internal/api/contracts"
)

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

// Repeticiones projects the typed Repetir field to the contract DTO
// (mirrors EstudiosString/DiasStrings). Absent, null, and empty-array shapes
// all collapse to an empty (non-nil) slice -- the timeline is either present
// with entries or it isn't, there is no meaningful "absent vs empty" signal
// to preserve at the mobile boundary.
func (r LegacyAnimeRaw) Repeticiones() []contracts.MobileRepeticion {
	entries := r.Repetir.Values()
	if len(entries) == 0 {
		return []contracts.MobileRepeticion{}
	}

	result := make([]contracts.MobileRepeticion, 0, len(entries))
	for _, entry := range entries {
		numRepeticion := 0
		if value := entry.NumRepeticion.Int(); value != nil {
			numRepeticion = *value
		}
		estado := 0
		if value := entry.Estado.Int(); value != nil {
			estado = *value
		}
		nroCapVisto := 0.0
		if value := entry.NroCapVisto.Float64(); value != nil {
			nroCapVisto = *value
		}

		result = append(result, contracts.MobileRepeticion{
			NumRepeticion:    numRepeticion,
			NroCapVisto:      nroCapVisto,
			Estado:           estado,
			FechaCreacion:    millisFromLegacyDate(entry.FechaCreacion),
			FechaEstreno:     millisFromLegacyDate(entry.FechaEstreno),
			FechaUltCapVisto: millisFromLegacyDate(entry.FechaUltCapVisto),
			FechaEliminacion: millisFromLegacyDate(entry.FechaEliminacion),
			FechaRepeticion:  millisFromLegacyDate(entry.FechaRepeticion),
		})
	}
	return result
}

// millisFromLegacyDate mirrors the timeToMillis seam in internal/anime/mobile.go,
// duplicated here rather than imported: mobile.go depends on this domain
// package, so importing back from mobile.go would invert that dependency.
func millisFromLegacyDate(field LegacyDateField) *int64 {
	value := field.Time()
	if value == nil {
		return nil
	}
	millis := value.UnixMilli()
	return &millis
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

func NewLegacyDateFieldFromUnixMilli(value int64) LegacyDateField {
	return newLegacyDateField(time.UnixMilli(value).UTC())
}

func (r *LegacyAnimeRaw) ensureExtraFields() map[string]json.RawMessage {
	if r.extraFields == nil {
		r.extraFields = make(map[string]json.RawMessage)
	}

	return r.extraFields
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

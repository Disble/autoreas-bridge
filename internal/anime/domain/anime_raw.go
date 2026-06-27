package domain

import (
	"encoding/json"
	"fmt"
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

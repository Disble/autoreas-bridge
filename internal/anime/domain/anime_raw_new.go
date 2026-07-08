package domain

import (
	"encoding/json"
	"fmt"
	"time"
)

// NewAnimeSpec is the input for building a brand-new anime record. It carries
// only what a create needs; every other field takes its Legacy default.
type NewAnimeSpec struct {
	ID           string
	Nombre       string
	Pagina       string
	Section      string // Estrenos section or weekday, e.g. "Sin ver"
	Orden        int
	CreatedAt    time.Time
	Tipo         *int
	FechaEstreno *int64 // epoch milliseconds
	Carpeta      string // absolute download folder; omitted from the record when empty
}

// NewAnimeRaw builds a complete, valid LegacyAnimeRaw for a new anime: estado 0
// (Viendo), nrocapvisto 0, activo true, primeravez true, a single dias entry in
// the given section, and the creation timestamp. It constructs the record via
// the exact Legacy JSON shapes (activo/primeravez as booleans, dates as
// {"$$date": ms}) and parses it back, so the result round-trips byte-stably
// through MarshalJSON and is readable by Legacy.
func NewAnimeRaw(spec NewAnimeSpec) (LegacyAnimeRaw, error) {
	obj := map[string]any{
		"_id":           spec.ID,
		"nombre":        spec.Nombre,
		"nrocapvisto":   0,
		"estado":        0,
		"activo":        true,
		"primeravez":    true,
		"fechaCreacion": map[string]int64{"$$date": spec.CreatedAt.UnixMilli()},
		"dias":          []map[string]any{{"dia": spec.Section, "orden": spec.Orden}},
		"pagina":        spec.Pagina,
	}
	if spec.Carpeta != "" {
		obj["carpeta"] = spec.Carpeta
	}
	if spec.Tipo != nil {
		obj["tipo"] = *spec.Tipo
	}
	if spec.FechaEstreno != nil {
		obj["fechaEstreno"] = map[string]int64{"$$date": *spec.FechaEstreno}
	}

	data, err := json.Marshal(obj)
	if err != nil {
		return LegacyAnimeRaw{}, fmt.Errorf("marshal new anime spec: %w", err)
	}
	var raw LegacyAnimeRaw
	if err := json.Unmarshal(data, &raw); err != nil {
		return LegacyAnimeRaw{}, fmt.Errorf("build new anime raw: %w", err)
	}
	return raw, nil
}

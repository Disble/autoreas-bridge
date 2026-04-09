package anime

import (
	"encoding/json"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

func mobileAnimeFromSnapshot(payload []byte) (contracts.MobileAnime, error) {
	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(payload, &raw); err != nil {
		return contracts.MobileAnime{}, err
	}

	item := contracts.MobileAnime{
		ID:               raw.ID,
		Nombre:           raw.Nombre,
		Estado:           intValueOrDefault(raw.EstadoValue(), 0),
		NroCapVisto:      raw.NroCapVisto,
		Activo:           triStateToInt(raw.Activo.TriState()),
		PrimeraVez:       triStateToInt(raw.Primeravez.TriState()),
		Dias:             mobileDays(raw),
		Generos:          raw.GenerosStrings(),
		Tipo:             raw.Tipo.Int(),
		FechaUltCapVisto: timeToMillis(raw.FechaUltCapVisto.Time()),
		FechaEstreno:     timeToMillis(raw.FechaEstreno.Time()),
		FechaCreacion:    timeToMillis(raw.FechaCreacion.Time()),
		FechaEliminacion: timeToMillis(raw.FechaEliminacion.Time()),
		Portada:          raw.PortadaPath(),
		Pagina:           raw.Pagina.String(),
		Carpeta:          raw.Carpeta.String(),
		Estudios:         raw.EstudiosString(),
		Origen:           raw.Origen.String(),
		Duracion:         raw.Duracion.Int(),
	}

	if value := raw.TotalCapValue(); value != nil {
		converted := int(*value)
		item.TotalCap = &converted
	}

	return item, nil
}

func MobileAnimeFromSnapshotForSync(payload []byte) (contracts.MobileAnime, error) {
	return mobileAnimeFromSnapshot(payload)
}

func mobileDays(raw domain.LegacyAnimeRaw) []contracts.MobileAnimeDay {
	values := raw.Dias.Values()
	if len(values) > 0 {
		result := make([]contracts.MobileAnimeDay, 0, len(values))
		for _, value := range values {
			result = append(result, contracts.MobileAnimeDay{Dia: value.Dia, Orden: int(value.Orden)})
		}
		return result
	}

	day := raw.Dia.String()
	order := raw.Orden.Int()
	if day != nil && order != nil {
		return []contracts.MobileAnimeDay{{Dia: *day, Orden: *order}}
	}

	return []contracts.MobileAnimeDay{}
}

func triStateToInt(value domain.TriState) int {
	if value == domain.TriStateTrue {
		return 1
	}
	return 0
}

func intValueOrDefault(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

func timeToMillis(value *time.Time) *int64 {
	if value == nil {
		return nil
	}
	result := value.UnixMilli()
	return &result
}

package anime

import (
	"strings"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/api/contracts"
)

// mobileAnimeFromSnapshot normalizes a canonical anime JSON payload into the
// mobile DTO. modifiedAt is the bridge-private OCC version token (SDD-30
// ADR-30-1/30-5, SnapshotRecord.ModifiedAt) for the CURRENT confirmed
// snapshot -- callers that only have a historical changelog payload (no
// access to the live anime_snapshots row) pass 0, which is itself a
// legitimate base value, not a sentinel for "unknown".
func mobileAnimeFromDomain(value domain.Anime, modifiedAt int64) contracts.MobileAnime {
	item := contracts.MobileAnime{
		ID:               value.ID,
		Nombre:           value.Title,
		Estado:           intValueOrDefault(value.Status, 0),
		NroCapVisto:      value.Progress,
		Activo:           triStateToInt(value.Active),
		PrimeraVez:       triStateToInt(value.FirstCycle),
		Dias:             mobileDays(value.Days),
		Generos:          cloneStrings(value.Genres),
		Tipo:             cloneInt(value.ContentType),
		FechaUltCapVisto: timeToMillis(value.LastWatchedAt),
		FechaEstreno:     timeToMillis(value.PremieredAt),
		FechaCreacion:    timeToMillis(value.CreatedAt),
		FechaEliminacion: timeToMillis(value.DeletedAt),
		Portada:          cloneString(value.CoverPath),
		Pagina:           cloneString(value.SourceURL),
		Carpeta:          cloneString(value.Folder),
		Estudios:         joinedStrings(value.Studios),
		Origen:           cloneString(value.Origin),
		Duracion:         floatToInt(value.DurationMinutes),
		Repetir:          mobileRepetitions(value.Repetitions),
		ModifiedAt:       modifiedAt,
	}

	if value.TotalEpisodes != nil {
		converted := int(*value.TotalEpisodes)
		item.TotalCap = &converted
	}

	return item
}

// MobileAnimeFromSnapshotForSync normalizes a historical changelog snapshot
// payload (sync.ChangelogEntry.SnapshotJSON) into the mobile DTO. These
// payloads are point-in-time copies of the canonical JSON captured at
// changelog-write time and carry no live OCC token of their own, so
// ModifiedAt echoes 0 (a legitimate base value, not a sentinel) -- mobile
// clients are not expected to use changelog/sync-feed snapshots as a base
// for writes; the query endpoints (GetMobileAnime/ListMobileAnimes) are the
// source of the live token.
func MobileAnimeFromSnapshotForSync(payload []byte) (contracts.MobileAnime, error) {
	value, _, err := store.DecodeDomain(payload)
	if err != nil {
		return contracts.MobileAnime{}, err
	}
	return mobileAnimeFromDomain(value, 0), nil
}

// mobileDays maps domain-level anime day entries into the mobile-contract slice.
func mobileDays(values []domain.AnimeDay) []contracts.MobileAnimeDay {
	result := make([]contracts.MobileAnimeDay, 0, len(values))
	for _, value := range values {
		result = append(result, contracts.MobileAnimeDay{Dia: value.Day, Orden: int(value.Order)})
	}
	return result
}

// triStateToInt converts a domain-level tri-state boolean into an integer suitable for the mobile contract.
func triStateToInt(value domain.TriState) int {
	if value == domain.TriStateTrue {
		return 1
	}
	return 0
}

// intValueOrDefault dereferences the pointer or returns fallback when nil.
func intValueOrDefault(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

// timeToMillis converts a nullable time value into a nullable Unix-millisecond pointer.
func timeToMillis(value *time.Time) *int64 {
	if value == nil {
		return nil
	}
	result := value.UnixMilli()
	return &result
}

// mobileRepetitions maps domain-level repetition entries into the mobile-contract slice.
func mobileRepetitions(values []domain.Repetition) []contracts.MobileRepeticion {
	result := make([]contracts.MobileRepeticion, 0, len(values))
	for _, value := range values {
		result = append(result, contracts.MobileRepeticion{
			NumRepeticion: value.Number, NroCapVisto: value.Progress, Estado: value.Status,
			FechaCreacion: timeToMillis(value.CreatedAt), FechaEstreno: timeToMillis(value.PremieredAt),
			FechaUltCapVisto: timeToMillis(value.LastWatchedAt), FechaEliminacion: timeToMillis(value.DeletedAt),
			FechaRepeticion: timeToMillis(nonZeroTime(value.RepeatedAt)),
		})
	}
	return result
}

// nonZeroTime returns a pointer to the time value, or nil when it is the zero instant.
func nonZeroTime(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	return &value
}

// cloneString returns a copy of the string pointer, or nil when given nil.
func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

// cloneStrings copies a string slice into a guaranteed non-nil slice. Empty and
// nil inputs both yield an empty (`[]`, never `null`) JSON array so the mobile
// client's array schema accepts the payload -- mirrors mobileDays.
func cloneStrings(values []string) []string {
	return append(make([]string, 0, len(values)), values...)
}

// cloneInt returns a copy of the int pointer, or nil when given nil.
func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

// floatToInt truncates a nullable float64 into a nullable int pointer.
func floatToInt(value *float64) *int {
	if value == nil {
		return nil
	}
	converted := int(*value)
	return &converted
}

// joinedStrings joins non-empty values into an optional string.
func joinedStrings(values []string) *string {
	if len(values) == 0 {
		return nil
	}
	joined := strings.Join(values, ", ")
	return &joined
}

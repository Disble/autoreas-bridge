package contracts

import (
	"encoding/json"
	"testing"
)

// TestMobileAnimeDayEnglishJSONTags guards SDD-56 Slice 2: MobileAnimeDay
// carries only English field names/json tags (day/order), never the legacy
// Spanish dia/orden.
func TestMobileAnimeDayEnglishJSONTags(t *testing.T) {
	day := MobileAnimeDay{Day: "Lunes", Order: 3}

	encoded, err := json.Marshal(day)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	for _, key := range []string{"day", "order"} {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected English JSON key %q, got %s", key, encoded)
		}
	}
	for _, key := range []string{"dia", "orden"} {
		if _, ok := raw[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q, got %s", key, encoded)
		}
	}
	if string(raw["day"]) != `"Lunes"` {
		t.Fatalf("expected weekday VALUE to remain Spanish literal, got %s", raw["day"])
	}
}

// TestMobileRepeticionEnglishJSONTags guards SDD-56 Slice 2: MobileRepeticion
// carries only English field names/json tags.
func TestMobileRepeticionEnglishJSONTags(t *testing.T) {
	createdAt := int64(1)
	premieredAt := int64(2)
	lastWatchedAt := int64(3)
	deletedAt := int64(4)
	repeatedAt := int64(5)
	rep := MobileRepeticion{
		NumRepetitions:  1,
		EpisodesWatched: 12,
		Status:          2,
		CreatedAt:       &createdAt,
		PremieredAt:     &premieredAt,
		LastWatchedAt:   &lastWatchedAt,
		DeletedAt:       &deletedAt,
		RepeatedAt:      &repeatedAt,
	}

	encoded, err := json.Marshal(rep)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	expectedKeys := []string{"numRepetitions", "episodesWatched", "status", "createdAt", "premieredAt", "lastWatchedAt", "deletedAt", "repeatedAt"}
	for _, key := range expectedKeys {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected English JSON key %q, got %s", key, encoded)
		}
	}
	staleKeys := []string{"numrepeticion", "nrocapvisto", "estado", "fechaCreacion", "fechaEstreno", "fechaUltCapVisto", "fechaEliminacion", "fechaRepeticion"}
	for _, key := range staleKeys {
		if _, ok := raw[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q, got %s", key, encoded)
		}
	}
}

// TestMobileAnimeEnglishJSONTags guards SDD-56 Slice 2: MobileAnime carries
// only English field names/json tags. VALUES (e.g. weekday strings) stay
// Spanish literals -- only field NAMES are renamed.
func TestMobileAnimeEnglishJSONTags(t *testing.T) {
	lastWatchedAt := int64(1)
	cover := "cover.jpg"
	sourceURL := "https://example.com"
	folder := "C:/anime"
	studios := "Madhouse"
	origin := "Japan"
	duration := 24
	kind := 0
	totalCap := 12

	item := MobileAnime{
		ID:              "anime-1",
		Name:            "Frieren",
		Status:          0,
		EpisodesWatched: 5,
		TotalEpisodes:   &totalCap,
		Active:          1,
		FirstCycle:      1,
		Days:            []MobileAnimeDay{{Day: "Lunes", Order: 1}},
		Genres:          []string{"Fantasy"},
		Kind:            &kind,
		LastWatchedAt:   &lastWatchedAt,
		Cover:           &cover,
		SourceURL:       &sourceURL,
		Folder:          &folder,
		Studios:         &studios,
		Origin:          &origin,
		DurationMinutes: &duration,
		Repetitions:     []MobileRepeticion{{NumRepetitions: 1, Status: 2}},
		ModifiedAt:      42,
	}

	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	expectedKeys := []string{
		"id", "name", "status", "episodesWatched", "totalEpisodes", "active",
		"firstCycle", "days", "genres", "kind", "lastWatchedAt", "cover",
		"sourceUrl", "folder", "studios", "origin", "durationMinutes",
		"repetitions", "modified_at",
	}
	for _, key := range expectedKeys {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected English JSON key %q, got %s", key, encoded)
		}
	}
	staleKeys := []string{
		"_id", "nombre", "estado", "nrocapvisto", "totalcap", "activo",
		"primeravez", "dias", "generos", "tipo", "fechaUltCapVisto",
		"portada", "pagina", "carpeta", "estudios", "origen", "duracion",
		"repetir",
	}
	for _, key := range staleKeys {
		if _, ok := raw[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q, got %s", key, encoded)
		}
	}
}

// TestAnimeListItemEnglishJSONTags guards the slim anime-list read model
// (the closest real DTO to the proposal's since-renamed "LegacyAnimeSummary").
func TestAnimeListItemEnglishJSONTags(t *testing.T) {
	kind := 1
	item := AnimeListItem{
		ID:              "anime-1",
		Name:            "Frieren",
		Status:          0,
		EpisodesWatched: 5,
		Active:          1,
		Kind:            &kind,
		Days:            []string{"Lunes"},
		Genres:          []string{"Fantasy"},
	}

	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	for _, key := range []string{"name", "status", "episodesWatched", "active", "kind", "days", "genres"} {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected English JSON key %q, got %s", key, encoded)
		}
	}
	for _, key := range []string{"nombre", "estado", "nrocapvisto", "activo", "tipo", "dias", "generos"} {
		if _, ok := raw[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q, got %s", key, encoded)
		}
	}
}

// TestAnimeHistoryItemEnglishJSONTags guards the History read model DTO
// (the closest real DTO to the proposal's since-renamed "AnimeChangeSummary").
func TestAnimeHistoryItemEnglishJSONTags(t *testing.T) {
	kind := 1
	createdAt := int64(2)
	item := AnimeHistoryItem{
		ID:              "anime-1",
		Name:            "Frieren",
		EpisodesWatched: 5,
		LastWatchedAt:   1,
		Status:          0,
		Kind:            &kind,
		CreatedAt:       &createdAt,
	}

	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	for _, key := range []string{"name", "episodesWatched", "lastWatchedAt", "status", "kind", "createdAt"} {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected English JSON key %q, got %s", key, encoded)
		}
	}
	for _, key := range []string{"nombre", "nrocapvisto", "fechaUltCapVisto", "estado", "tipo", "fechaCreacion"} {
		if _, ok := raw[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q, got %s", key, encoded)
		}
	}
}

// TestAnimeDetailEnglishJSONTags guards the detailed anime read model DTO,
// including its nested Content struct.
func TestAnimeDetailEnglishJSONTags(t *testing.T) {
	kind := 1
	duration := 24
	origin := "Japan"
	detail := AnimeDetail{
		ID:         "anime-1",
		Name:       "Frieren",
		Status:     0,
		Active:     1,
		FirstCycle: 1,
		Content: AnimeDetailContent{
			Kind:            &kind,
			DurationMinutes: &duration,
			Genres:          []string{"Fantasy"},
			Origin:          &origin,
		},
	}

	encoded, err := json.Marshal(detail)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	for _, key := range []string{"name", "status", "active", "firstCycle", "content"} {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected English JSON key %q, got %s", key, encoded)
		}
	}
	for _, key := range []string{"nombre", "estado", "activo", "primeravez"} {
		if _, ok := raw[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q, got %s", key, encoded)
		}
	}

	var content map[string]json.RawMessage
	if err := json.Unmarshal(raw["content"], &content); err != nil {
		t.Fatalf("unmarshal content: %v", err)
	}
	for _, key := range []string{"kind", "durationMinutes", "genres", "origin"} {
		if _, ok := content[key]; !ok {
			t.Fatalf("expected English JSON key %q in content, got %s", key, raw["content"])
		}
	}
	for _, key := range []string{"tipo", "duracion", "generos", "origen"} {
		if _, ok := content[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q in content, got %s", key, raw["content"])
		}
	}
}

// TestSyncingAnimeItemEnglishJSONTags guards SyncingAnimeItem's remaining
// Spanish field (Activo -> Active).
func TestSyncingAnimeItemEnglishJSONTags(t *testing.T) {
	item := SyncingAnimeItem{AnimeID: "anime-1", Active: 1}

	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	if _, ok := raw["active"]; !ok {
		t.Fatalf("expected English JSON key %q, got %s", "active", encoded)
	}
	if _, ok := raw["activo"]; ok {
		t.Fatalf("did not expect stale Spanish JSON key %q, got %s", "activo", encoded)
	}
}

// TestEpisodeScheduleItemEnglishJSONTags guards the episode-workflow DTO's
// remaining Spanish fields.
func TestEpisodeScheduleItemEnglishJSONTags(t *testing.T) {
	totalCap := 12
	item := EpisodeScheduleItem{
		AnimeID:         "anime-1",
		Status:          0,
		EpisodesWatched: 5,
		TotalEpisodes:   &totalCap,
	}

	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	for _, key := range []string{"status", "episodesWatched", "totalEpisodes"} {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected English JSON key %q, got %s", key, encoded)
		}
	}
	for _, key := range []string{"estado", "nrocapvisto", "totalcap"} {
		if _, ok := raw[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q, got %s", key, encoded)
		}
	}
}

// TestEpisodeCommandResultEnglishJSONTags guards the episode-command outcome
// DTO's remaining Spanish fields.
func TestEpisodeCommandResultEnglishJSONTags(t *testing.T) {
	result := EpisodeCommandResult{Status: "ok", AnimeStatus: 1, EpisodesWatched: 5}

	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	for _, key := range []string{"animeStatus", "episodesWatched"} {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected English JSON key %q, got %s", key, encoded)
		}
	}
	for _, key := range []string{"estado", "nrocapvisto"} {
		if _, ok := raw[key]; ok {
			t.Fatalf("did not expect stale Spanish JSON key %q, got %s", key, encoded)
		}
	}
}

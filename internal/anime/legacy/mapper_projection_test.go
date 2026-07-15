package legacy

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

func TestLegacyMapperProjectsCompleteEnglishReadModel(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"projection","nombre":"Projection","nrocapvisto":4.5,"estado":2,"activo":true,"primeravez":false,"fechaCreacion":{"$$date":1609459200000},"fechaEstreno":{"$$date":1612137600000},"fechaUltCapVisto":{"$$date":1612224000000},"fechaEliminacion":null,"totalcap":12,"duracion":24,"tipo":1,"pagina":"https://example.invalid/anime","carpeta":"Projection","origen":"Manga","estudios":["Studio A","Studio B"],"generos":["Action","Comedy"],"portada":{"type":"url","path":"https://example.invalid/cover.jpg"},"dias":[{"dia":"Ver hoy","orden":3}],"repetir":[{"numrepeticion":2,"nrocapvisto":12,"estado":4,"fechaCreacion":{"$$date":1500000000000},"fechaEstreno":null,"fechaUltCapVisto":{"$$date":1500000001000},"fechaEliminacion":null,"fechaRepeticion":{"$$date":1500000002000}}]}`

	var raw LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal Legacy wire: %v", err)
	}
	got, err := NewMapper().ToDomain(raw)
	if err != nil {
		t.Fatalf("map Legacy wire: %v", err)
	}

	if got.ContentType == nil || *got.ContentType != 1 {
		t.Fatalf("content type = %v, want 1", got.ContentType)
	}
	if got.Folder == nil || *got.Folder != "Projection" {
		t.Fatalf("folder = %v, want Projection", got.Folder)
	}
	if got.Origin == nil || *got.Origin != "Manga" {
		t.Fatalf("origin = %v, want Manga", got.Origin)
	}
	if !reflect.DeepEqual(got.Studios, []string{"Studio A", "Studio B"}) {
		t.Fatalf("studios = %v", got.Studios)
	}
	if !reflect.DeepEqual(got.Genres, []string{"Action", "Comedy"}) {
		t.Fatalf("genres = %v", got.Genres)
	}
	if got.CoverPath == nil || *got.CoverPath != "https://example.invalid/cover.jpg" {
		t.Fatalf("cover path = %v", got.CoverPath)
	}
	if len(got.Repetitions) != 1 {
		t.Fatalf("repetitions = %d, want 1", len(got.Repetitions))
	}
	repetition := got.Repetitions[0]
	if repetition.Number != 2 || repetition.Progress != 12 || repetition.Status != 4 {
		t.Fatalf("repetition core = %+v", repetition)
	}
	if repetition.RepeatedAt != time.UnixMilli(1_500_000_002_000).UTC() {
		t.Fatalf("repeated at = %v", repetition.RepeatedAt)
	}
}

package domain

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestLegacyAnimeRawToAnimeNormalizesSupportedFields(t *testing.T) {
	t.Parallel()

	const payload = `{
		"_id":"anime-domain",
		"nombre":"Domain Test",
		"nrocapvisto":10.5,
		"activo":false,
		"fechaEstreno":{"$$date":1609459200000},
		"fechaUltCapVisto":null,
		"dias":[{"dia":"Lunes","orden":1}],
		"dia":"Miércoles",
		"orden":3
	}`

	var raw LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal legacy anime raw: %v", err)
	}

	anime := raw.ToAnime()
	if anime.ID != "anime-domain" {
		t.Fatalf("expected anime ID anime-domain, got %q", anime.ID)
	}
	if anime.Nombre != "Domain Test" {
		t.Fatalf("expected anime nombre Domain Test, got %q", anime.Nombre)
	}
	if anime.NroCapVisto != 10.5 {
		t.Fatalf("expected anime nrocapvisto 10.5, got %v", anime.NroCapVisto)
	}
	if anime.ActivoState != TriStateFalse {
		t.Fatalf("expected anime activo false, got %v", anime.ActivoState)
	}
	if anime.FechaEstreno == nil || anime.FechaEstreno.UTC().UnixMilli() != 1609459200000 {
		t.Fatalf("expected anime fechaEstreno unix milli 1609459200000, got %v", anime.FechaEstreno)
	}
	if anime.FechaUltCapVisto != nil {
		t.Fatalf("expected anime fechaUltCapVisto nil, got %v", anime.FechaUltCapVisto)
	}
	if len(anime.Dias) != 1 || anime.Dias[0].Day != "Lunes" || anime.Dias[0].Order != 1 {
		t.Fatalf("expected anime dias normalized from dias array, got %+v", anime.Dias)
	}
}

func TestLegacyAnimeRawToAnimeFallsBackToLegacyDiaOrden(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"anime-domain","nombre":"Domain Test","nrocapvisto":0.5,"dia":"Viernes","orden":2}`

	var raw LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal legacy anime raw: %v", err)
	}

	anime := raw.ToAnime()
	if len(anime.Dias) != 1 {
		t.Fatalf("expected one normalized legacy day, got %+v", anime.Dias)
	}
	if anime.Dias[0].Day != "Viernes" || anime.Dias[0].Order != 2 {
		t.Fatalf("expected normalized legacy day Viernes/2, got %+v", anime.Dias[0])
	}
	if anime.ActivoState != TriStateAbsent {
		t.Fatalf("expected absent activo state, got %v", anime.ActivoState)
	}
}

func TestLegacyAnimeRawRejectsMalformedLegacyPayloads(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		payload string
		wantErr string
	}{
		{name: "invalid fechaEstreno wrapper", payload: `{"_id":"anime-1","nombre":"Broken","nrocapvisto":1,"fechaEstreno":{"bad":123}}`, wantErr: "unmarshal fechaEstreno"},
		{name: "invalid activo type", payload: `{"_id":"anime-1","nombre":"Broken","nrocapvisto":1,"activo":"yes"}`, wantErr: "unmarshal activo"},
		{name: "invalid dia type", payload: `{"_id":"anime-1","nombre":"Broken","nrocapvisto":1,"dia":7}`, wantErr: "unmarshal dia"},
		{name: "invalid dias array payload", payload: `{"_id":"anime-1","nombre":"Broken","nrocapvisto":1,"dias":{"dia":"Lunes"}}`, wantErr: "unmarshal dias"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var raw LegacyAnimeRaw
			err := json.Unmarshal([]byte(tt.payload), &raw)
			if err == nil {
				t.Fatalf("expected error for payload %s", tt.payload)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error to contain %q, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestLegacyAnimeRawTypedHelpers(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"anime-helpers","nombre":"Helpers","nrocapvisto":3,"estado":2,"totalcap":12,"dias":[{"dia":"Lunes","orden":1}]}`

	var raw LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal legacy anime raw: %v", err)
	}

	if got := raw.EstadoValue(); got == nil || *got != 2 {
		t.Fatalf("expected estado 2, got %v", got)
	}
	if got := raw.TotalCapValue(); got == nil || *got != 12 {
		t.Fatalf("expected totalcap 12, got %v", got)
	}

	raw.SetEstado(3)
	raw.SetNroCapVisto(10.5)
	raw.SetDias([]string{"Martes", "Jueves"})
	raw.StampServerTimestamp(time.UnixMilli(1710000000789).UTC())

	if got := raw.EstadoValue(); got == nil || *got != 3 {
		t.Fatalf("expected estado 3 after setter, got %v", got)
	}
	if raw.NroCapVisto != 10.5 {
		t.Fatalf("expected nrocapvisto 10.5 after setter, got %v", raw.NroCapVisto)
	}

	gotDias := raw.DiasStrings()
	if len(gotDias) != 2 || gotDias[0] != "Martes" || gotDias[1] != "Jueves" {
		t.Fatalf("expected dias [Martes Jueves], got %#v", gotDias)
	}

	stampedAt := raw.FechaUltCapVisto.Time()
	if stampedAt == nil || stampedAt.UnixMilli() != 1710000000789 {
		t.Fatalf("expected stamped timestamp 1710000000789, got %v", stampedAt)
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal legacy anime raw: %v", err)
	}

	assertJSONContains(t, string(encoded), `"estado":3`)
	assertJSONContains(t, string(encoded), `"totalcap":12`)
	assertJSONContains(t, string(encoded), `"nrocapvisto":10.5`)
	assertJSONContains(t, string(encoded), `"fechaUltCapVisto":{"$$date":1710000000789}`)
	assertJSONContains(t, string(encoded), `"dias":[{"dia":"Martes","orden":1},{"dia":"Jueves","orden":2}]`)
}

func TestLegacyFieldWrappersRejectInvalidTypes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		run     func() error
		wantErr string
	}{
		{name: "date wrapper rejects scalar", run: func() error { var field LegacyDateField; return field.UnmarshalJSON([]byte(`42`)) }, wantErr: "unmarshal legacy date wrapper"},
		{name: "string wrapper rejects object", run: func() error { var field LegacyStringField; return field.UnmarshalJSON([]byte(`{"value":"broken"}`)) }, wantErr: "cannot unmarshal object into Go value of type string"},
		{name: "number wrapper rejects string", run: func() error { var field LegacyNumberField; return field.UnmarshalJSON([]byte(`"oops"`)) }, wantErr: "cannot unmarshal string into Go value of type float64"},
		{name: "array wrapper rejects scalar", run: func() error { var field LegacyJSONArrayField; return field.UnmarshalJSON([]byte(`true`)) }, wantErr: "cannot unmarshal bool into Go value of type []json.RawMessage"},
		{name: "anime days wrapper rejects scalar", run: func() error { var field LegacyAnimeDaysField; return field.UnmarshalJSON([]byte(`"lunes"`)) }, wantErr: "cannot unmarshal string into Go value of type []domain.LegacyAnimeDay"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.run()
			if err == nil {
				t.Fatal("expected wrapper unmarshal error")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error to contain %q, got %v", tt.wantErr, err)
			}
		})
	}
}

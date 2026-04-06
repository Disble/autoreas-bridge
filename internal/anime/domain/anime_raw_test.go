package domain

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLegacyAnimeRawParsesDateWrapperAndMarshalsItBack(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"anime-1","nombre":"Test","nrocapvisto":1,"fechaEstreno":{"$$date":1609459200000}}`

	var raw LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal legacy anime raw: %v", err)
	}

	if raw.FechaEstreno.IsAbsent() {
		t.Fatal("expected fechaEstreno to be present")
	}

	if raw.FechaEstreno.IsNull() {
		t.Fatal("expected fechaEstreno to contain a date value")
	}

	want := time.UnixMilli(1609459200000).UTC()
	if got := raw.FechaEstreno.Time(); got == nil || !got.Equal(want) {
		t.Fatalf("expected fechaEstreno %v, got %v", want, got)
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal legacy anime raw: %v", err)
	}

	assertJSONSemanticallyEqual(t, payload, string(encoded))
	assertJSONContains(t, string(encoded), `"fechaEstreno":{"$$date":1609459200000}`)
}

func TestLegacyAnimeRawPreservesDateNullAndAbsence(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		payload        string
		checkField     func(t *testing.T, raw LegacyAnimeRaw)
		wantContain    string
		wantNotContain string
	}{
		{
			name:    "null date remains null",
			payload: `{"_id":"anime-1","nombre":"Test","nrocapvisto":1,"fechaEstreno":null}`,
			checkField: func(t *testing.T, raw LegacyAnimeRaw) {
				t.Helper()
				if !raw.FechaEstreno.IsNull() {
					t.Fatal("expected fechaEstreno null")
				}
			},
			wantContain: `"fechaEstreno":null`,
		},
		{
			name:    "absent date stays absent",
			payload: `{"_id":"anime-1","nombre":"Test","nrocapvisto":1}`,
			checkField: func(t *testing.T, raw LegacyAnimeRaw) {
				t.Helper()
				if !raw.FechaEstreno.IsAbsent() {
					t.Fatal("expected fechaEstreno absent")
				}
			},
			wantNotContain: `"fechaEstreno":`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var raw LegacyAnimeRaw
			if err := json.Unmarshal([]byte(tt.payload), &raw); err != nil {
				t.Fatalf("unmarshal legacy anime raw: %v", err)
			}

			tt.checkField(t, raw)

			encoded, err := json.Marshal(raw)
			if err != nil {
				t.Fatalf("marshal legacy anime raw: %v", err)
			}

			assertJSONSemanticallyEqual(t, tt.payload, string(encoded))

			if tt.wantContain != "" {
				assertJSONContains(t, string(encoded), tt.wantContain)
			}

			if tt.wantNotContain != "" && strings.Contains(string(encoded), tt.wantNotContain) {
				t.Fatalf("expected JSON %s not to contain %s", string(encoded), tt.wantNotContain)
			}
		})
	}
}

func TestLegacyAnimeRawPreservesOptionalNullableFields(t *testing.T) {
	t.Parallel()

	const payload = `{
		"_id":"anime-optional",
		"nombre":"Optional Test",
		"nrocapvisto":10.5,
		"duracion":null,
		"tipo":0,
		"pagina":"https://example.com/anime",
		"estudios":[],
		"generos":null
	}`

	var raw LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal legacy anime raw: %v", err)
	}

	if !raw.Duracion.IsNull() {
		t.Fatal("expected duracion null")
	}

	if raw.Tipo.IsAbsent() || raw.Tipo.IsNull() {
		t.Fatal("expected tipo numeric value to be present")
	}

	if got := raw.Tipo.Float64(); got == nil || *got != 0 {
		t.Fatalf("expected tipo 0, got %v", got)
	}

	if got := raw.Pagina.String(); got == nil || *got != "https://example.com/anime" {
		t.Fatalf("expected pagina value, got %v", got)
	}

	if raw.Carpeta.IsPresent() {
		t.Fatal("expected carpeta absent")
	}

	if raw.Estudios.IsAbsent() || raw.Estudios.IsNull() {
		t.Fatal("expected estudios empty array to be preserved")
	}

	if !raw.Generos.IsNull() {
		t.Fatal("expected generos null")
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal legacy anime raw: %v", err)
	}

	assertJSONSemanticallyEqual(t, compactJSON(t, payload), string(encoded))
	if strings.Contains(string(encoded), `"carpeta":`) {
		t.Fatalf("expected encoded JSON not to inject absent carpeta field: %s", string(encoded))
	}
}

func TestLegacyAnimeRawPreservesActivoTriState(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		payload        string
		wantState      TriState
		wantNotContain string
	}{
		{
			name:      "activo true",
			payload:   `{"_id":"anime-1","nombre":"Test","nrocapvisto":1,"activo":true}`,
			wantState: TriStateTrue,
		},
		{
			name:      "activo false",
			payload:   `{"_id":"anime-1","nombre":"Test","nrocapvisto":1,"activo":false}`,
			wantState: TriStateFalse,
		},
		{
			name:           "activo absent",
			payload:        `{"_id":"anime-1","nombre":"Test","nrocapvisto":1}`,
			wantState:      TriStateAbsent,
			wantNotContain: `"activo":`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var raw LegacyAnimeRaw
			if err := json.Unmarshal([]byte(tt.payload), &raw); err != nil {
				t.Fatalf("unmarshal legacy anime raw: %v", err)
			}

			if got := raw.Activo.TriState(); got != tt.wantState {
				t.Fatalf("expected activo state %v, got %v", tt.wantState, got)
			}

			encoded, err := json.Marshal(raw)
			if err != nil {
				t.Fatalf("marshal legacy anime raw: %v", err)
			}

			assertJSONSemanticallyEqual(t, tt.payload, string(encoded))
			if tt.wantNotContain != "" && strings.Contains(string(encoded), tt.wantNotContain) {
				t.Fatalf("expected JSON %s not to contain %s", string(encoded), tt.wantNotContain)
			}
		})
	}
}

func TestLegacyAnimeRawSupportsFractionalProgressAndDayVariants(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		payload string
		check   func(t *testing.T, raw LegacyAnimeRaw)
	}{
		{
			name: "current dias schema with fractional progress",
			payload: `{"_id":"anime-1","nombre":"Test","nrocapvisto":0.5,` +
				`"dias":[{"dia":"Domingo","orden":2},{"dia":"Viernes","orden":5}]}`,
			check: func(t *testing.T, raw LegacyAnimeRaw) {
				t.Helper()
				if raw.NroCapVisto != 0.5 {
					t.Fatalf("expected fractional progress 0.5, got %v", raw.NroCapVisto)
				}

				if len(raw.Dias.Values()) != 2 {
					t.Fatalf("expected 2 dias values, got %d", len(raw.Dias.Values()))
				}
			},
		},
		{
			name:    "legacy dia orden schema",
			payload: `{"_id":"anime-1","nombre":"Test","nrocapvisto":10.5,"dia":"Lunes","orden":3}`,
			check: func(t *testing.T, raw LegacyAnimeRaw) {
				t.Helper()
				if got := raw.Dia.String(); got == nil || *got != "Lunes" {
					t.Fatalf("expected dia Lunes, got %v", got)
				}

				if got := raw.Orden.Float64(); got == nil || *got != 3 {
					t.Fatalf("expected orden 3, got %v", got)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var raw LegacyAnimeRaw
			if err := json.Unmarshal([]byte(tt.payload), &raw); err != nil {
				t.Fatalf("unmarshal legacy anime raw: %v", err)
			}

			tt.check(t, raw)

			encoded, err := json.Marshal(raw)
			if err != nil {
				t.Fatalf("marshal legacy anime raw: %v", err)
			}

			assertJSONSemanticallyEqual(t, tt.payload, string(encoded))
		})
	}
}

func TestLegacyAnimeRawRoundTripsMixedLegacyPayload(t *testing.T) {
	t.Parallel()

	const payload = `{
		"_id":"anime-mixed",
		"nombre":"Mixed",
		"nrocapvisto":0.5,
		"dia":"Miércoles",
		"orden":4,
		"duracion":null,
		"tipo":1,
		"pagina":"Descargado",
		"fechaEstreno":{"$$date":1609459200000},
		"fechaUltCapVisto":null,
		"portada":{"type":"url","path":""}
	}`

	var raw LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal legacy anime raw: %v", err)
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal legacy anime raw: %v", err)
	}

	assertJSONSemanticallyEqual(t, compactJSON(t, payload), string(encoded))
	if strings.Contains(string(encoded), `"activo":`) {
		t.Fatalf("expected encoded JSON not to inject absent activo field: %s", string(encoded))
	}
}

func TestLegacyAnimeRawParsesRealFixtureWithoutMutatingOriginal(t *testing.T) {
	t.Parallel()

	sourcePath := filepath.Join("..", "..", "..", "resources", "autoreas-data", "animes.dat")
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	tempPath := filepath.Join(t.TempDir(), "animes.dat")
	if err := os.WriteFile(tempPath, data, 0o600); err != nil {
		t.Fatalf("write temp fixture copy: %v", err)
	}

	content, err := os.ReadFile(tempPath)
	if err != nil {
		t.Fatalf("read temp fixture copy: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(lines) == 0 {
		t.Fatal("expected fixture to contain at least one line")
	}

	for index, line := range lines {
		line := strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var raw LegacyAnimeRaw
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			t.Fatalf("line %d unmarshal legacy anime raw: %v", index+1, err)
		}

		encoded, err := json.Marshal(raw)
		if err != nil {
			t.Fatalf("line %d marshal legacy anime raw: %v", index+1, err)
		}

		assertJSONSemanticallyEqual(t, line, string(encoded))
	}
}

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
		{
			name:    "invalid fechaEstreno wrapper",
			payload: `{"_id":"anime-1","nombre":"Broken","nrocapvisto":1,"fechaEstreno":{"bad":123}}`,
			wantErr: "unmarshal fechaEstreno",
		},
		{
			name:    "invalid activo type",
			payload: `{"_id":"anime-1","nombre":"Broken","nrocapvisto":1,"activo":"yes"}`,
			wantErr: "unmarshal activo",
		},
		{
			name:    "invalid dia type",
			payload: `{"_id":"anime-1","nombre":"Broken","nrocapvisto":1,"dia":7}`,
			wantErr: "unmarshal dia",
		},
		{
			name:    "invalid dias array payload",
			payload: `{"_id":"anime-1","nombre":"Broken","nrocapvisto":1,"dias":{"dia":"Lunes"}}`,
			wantErr: "unmarshal dias",
		},
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

func TestLegacyFieldWrappersRejectInvalidTypes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		run     func() error
		wantErr string
	}{
		{
			name: "date wrapper rejects scalar",
			run: func() error {
				var field LegacyDateField
				return field.UnmarshalJSON([]byte(`42`))
			},
			wantErr: "unmarshal legacy date wrapper",
		},
		{
			name: "string wrapper rejects object",
			run: func() error {
				var field LegacyStringField
				return field.UnmarshalJSON([]byte(`{"value":"broken"}`))
			},
			wantErr: "cannot unmarshal object into Go value of type string",
		},
		{
			name: "number wrapper rejects string",
			run: func() error {
				var field LegacyNumberField
				return field.UnmarshalJSON([]byte(`"oops"`))
			},
			wantErr: "cannot unmarshal string into Go value of type float64",
		},
		{
			name: "array wrapper rejects scalar",
			run: func() error {
				var field LegacyJSONArrayField
				return field.UnmarshalJSON([]byte(`true`))
			},
			wantErr: "cannot unmarshal bool into Go value of type []json.RawMessage",
		},
		{
			name: "anime days wrapper rejects scalar",
			run: func() error {
				var field LegacyAnimeDaysField
				return field.UnmarshalJSON([]byte(`"lunes"`))
			},
			wantErr: "cannot unmarshal string into Go value of type []domain.LegacyAnimeDay",
		},
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

func assertJSONSemanticallyEqual(t *testing.T, want string, got string) {
	t.Helper()

	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("unmarshal wanted json: %v", err)
	}

	var gotValue any
	if err := json.Unmarshal([]byte(got), &gotValue); err != nil {
		t.Fatalf("unmarshal got json: %v", err)
	}

	if !deepEqualJSON(wantValue, gotValue) {
		t.Fatalf("expected JSON %s, got %s", want, got)
	}
}

func assertJSONContains(t *testing.T, got string, needle string) {
	t.Helper()

	if !containsJSON(got, needle) {
		t.Fatalf("expected JSON %s to contain %s", got, needle)
	}
}

func deepEqualJSON(want any, got any) bool {
	return jsonEqualValue(want, got)
}

func jsonEqualValue(want any, got any) bool {
	switch wantTyped := want.(type) {
	case map[string]any:
		gotTyped, ok := got.(map[string]any)
		if !ok || len(wantTyped) != len(gotTyped) {
			return false
		}

		for key, wantValue := range wantTyped {
			if !jsonEqualValue(wantValue, gotTyped[key]) {
				return false
			}
		}

		return true
	case []any:
		gotTyped, ok := got.([]any)
		if !ok || len(wantTyped) != len(gotTyped) {
			return false
		}

		for index := range wantTyped {
			if !jsonEqualValue(wantTyped[index], gotTyped[index]) {
				return false
			}
		}

		return true
	default:
		return want == got
	}
}

func containsJSON(got string, needle string) bool {
	return strings.Contains(got, needle)
}

func compactJSON(t *testing.T, value string) string {
	t.Helper()

	var raw any
	if err := json.Unmarshal([]byte(value), &raw); err != nil {
		t.Fatalf("compact json unmarshal: %v", err)
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("compact json marshal: %v", err)
	}

	return string(encoded)
}

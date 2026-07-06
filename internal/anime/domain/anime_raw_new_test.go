package domain

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNewAnimeRawProducesAValidSinVerRecord(t *testing.T) {
	created := time.UnixMilli(1_700_000_000_000)
	raw, err := NewAnimeRaw(NewAnimeSpec{
		ID:        "abc123",
		Nombre:    "Dr. Stone: Science Future Part 3",
		Pagina:    "https://jkanime.net/dr-stone-science-future-part-3/",
		Section:   "Sin ver",
		Orden:     4,
		CreatedAt: created,
	})
	if err != nil {
		t.Fatalf("NewAnimeRaw: %v", err)
	}

	if raw.ID != "abc123" || raw.Nombre != "Dr. Stone: Science Future Part 3" {
		t.Fatalf("identity mismatch: id=%q nombre=%q", raw.ID, raw.Nombre)
	}
	if got := raw.EstadoValue(); got == nil || *got != 0 {
		t.Fatalf("estado = %v, want 0 (Viendo)", got)
	}
	if raw.NroCapVisto != 0 {
		t.Fatalf("nrocapvisto = %v, want 0", raw.NroCapVisto)
	}
	if raw.Activo.TriState() != TriStateTrue {
		t.Fatalf("activo tri-state = %v, want true", raw.Activo.TriState())
	}
	if raw.Primeravez.TriState() != TriStateTrue {
		t.Fatalf("primeravez tri-state = %v, want true", raw.Primeravez.TriState())
	}

	// The record must serialize with the exact Legacy field shapes.
	payload, err := raw.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(payload, &obj); err != nil {
		t.Fatalf("payload not valid JSON: %v", err)
	}
	assertJSONField(t, obj, "_id", `"abc123"`)
	assertJSONField(t, obj, "estado", `0`)
	assertJSONField(t, obj, "nrocapvisto", `0`)
	assertJSONField(t, obj, "activo", `true`)
	assertJSONField(t, obj, "primeravez", `true`)
	assertJSONField(t, obj, "pagina", `"https://jkanime.net/dr-stone-science-future-part-3/"`)
	assertJSONField(t, obj, "dias", `[{"dia":"Sin ver","orden":4}]`)
	assertJSONField(t, obj, "fechaCreacion", `{"$$date":1700000000000}`)
}

func TestNewAnimeRawRoundTripsStably(t *testing.T) {
	raw, err := NewAnimeRaw(NewAnimeSpec{
		ID: "x", Nombre: "Some Anime", Pagina: "https://jkanime.net/some-anime/",
		Section: "Sin ver", Orden: 1, CreatedAt: time.UnixMilli(1_700_000_000_000),
	})
	if err != nil {
		t.Fatalf("NewAnimeRaw: %v", err)
	}
	first, _ := raw.MarshalJSON()

	var reparsed LegacyAnimeRaw
	if err := json.Unmarshal(first, &reparsed); err != nil {
		t.Fatalf("reparse: %v", err)
	}
	second, _ := reparsed.MarshalJSON()
	if string(first) != string(second) {
		t.Fatalf("payload not stable across a round trip:\n first=%s\nsecond=%s", first, second)
	}
}

func TestNewAnimeRawOptionalTipoAndFechaEstreno(t *testing.T) {
	tipo := 1
	estreno := int64(1_699_000_000_000)
	raw, err := NewAnimeRaw(NewAnimeSpec{
		ID: "y", Nombre: "Peli", Pagina: "https://jkanime.net/peli/",
		Section: "Sin ver", Orden: 1, CreatedAt: time.UnixMilli(1_700_000_000_000),
		Tipo: &tipo, FechaEstreno: &estreno,
	})
	if err != nil {
		t.Fatalf("NewAnimeRaw: %v", err)
	}
	payload, _ := raw.MarshalJSON()
	var obj map[string]json.RawMessage
	_ = json.Unmarshal(payload, &obj)
	assertJSONField(t, obj, "tipo", `1`)
	assertJSONField(t, obj, "fechaEstreno", `{"$$date":1699000000000}`)
}

func assertJSONField(t *testing.T, obj map[string]json.RawMessage, key, want string) {
	t.Helper()
	got, ok := obj[key]
	if !ok {
		t.Fatalf("missing field %q", key)
	}
	if string(got) != want {
		t.Fatalf("field %q = %s, want %s", key, got, want)
	}
}

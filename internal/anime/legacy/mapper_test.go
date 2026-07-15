package legacy

import (
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

func TestLegacyMapperRepeatPreservesNullableAndUnknownFields(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"anime-repeat","nombre":"Repeat","nrocapvisto":12,"estado":1,"activo":false,"primeravez":true,"fechaCreacion":{"$$date":1609459200000},"fechaEstreno":{"$$date":1612137600000},"fechaUltCapVisto":{"$$date":1612224000000},"fechaEliminacion":{"$$date":1612310400000},"repetir":[{"numrepeticion":0,"futureHistory":"keep"}],"totalcap":null,"duracion":null,"portada":{"type":"url","path":""},"future":{"nested":true}}`

	var wire LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &wire); err != nil {
		t.Fatalf("unmarshal Legacy wire: %v", err)
	}

	mapper := NewMapper()
	aggregate, err := mapper.ToDomain(wire)
	if err != nil {
		t.Fatalf("map Legacy wire to domain: %v", err)
	}
	aggregate.Repeat(time.UnixMilli(1_700_000_000_000).UTC())

	merged, err := mapper.Merge(wire, aggregate)
	if err != nil {
		t.Fatalf("merge repeated aggregate: %v", err)
	}
	encoded, err := json.Marshal(merged)
	if err != nil {
		t.Fatalf("marshal repeated wire: %v", err)
	}

	var got map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatalf("decode repeated wire: %v", err)
	}
	assertRawJSONField(t, got, "nrocapvisto", `0`)
	assertRawJSONField(t, got, "estado", `0`)
	assertRawJSONField(t, got, "activo", `true`)
	assertRawJSONField(t, got, "primeravez", `false`)
	assertRawJSONField(t, got, "fechaCreacion", `{"$$date":1700000000000}`)
	assertRawJSONField(t, got, "fechaEstreno", `null`)
	assertRawJSONField(t, got, "fechaUltCapVisto", `null`)
	assertRawJSONField(t, got, "fechaEliminacion", `null`)
	assertRawJSONField(t, got, "totalcap", `null`)
	assertRawJSONField(t, got, "duracion", `null`)
	assertRawJSONField(t, got, "portada", `{"type":"url","path":""}`)
	assertRawJSONField(t, got, "future", `{"nested":true}`)

	var repetitions []map[string]json.RawMessage
	if err := json.Unmarshal(got["repetir"], &repetitions); err != nil {
		t.Fatalf("decode repetition history: %v", err)
	}
	if len(repetitions) != 2 {
		t.Fatalf("repetition history length = %d, want 2", len(repetitions))
	}
	assertRawJSONField(t, repetitions[0], "futureHistory", `"keep"`)
	assertRawJSONField(t, repetitions[1], "nrocapvisto", `12`)
	assertRawJSONField(t, repetitions[1], "estado", `1`)
}

func TestLegacyMapperRestoreChangesOnlyActivation(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"anime-restore","nombre":"Restore","nrocapvisto":7.5,"estado":2,"activo":false,"fechaEliminacion":{"$$date":1612310400000},"repetir":[{"numrepeticion":0,"futureHistory":"keep"}],"totalcap":null,"future":"keep"}`

	var wire LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &wire); err != nil {
		t.Fatalf("unmarshal Legacy wire: %v", err)
	}

	mapper := NewMapper()
	aggregate, err := mapper.ToDomain(wire)
	if err != nil {
		t.Fatalf("map Legacy wire to domain: %v", err)
	}
	if aggregate.Active != domain.TriStateFalse {
		t.Fatalf("active state = %v, want false", aggregate.Active)
	}
	aggregate.Restore()

	merged, err := mapper.Merge(wire, aggregate)
	if err != nil {
		t.Fatalf("merge restored aggregate: %v", err)
	}
	encoded, err := json.Marshal(merged)
	if err != nil {
		t.Fatalf("marshal restored wire: %v", err)
	}

	var got map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatalf("decode restored wire: %v", err)
	}
	assertRawJSONField(t, got, "activo", `true`)
	assertRawJSONField(t, got, "fechaEliminacion", `null`)
	assertRawJSONField(t, got, "nrocapvisto", `7.5`)
	assertRawJSONField(t, got, "estado", `2`)
	assertRawJSONField(t, got, "repetir", `[{"numrepeticion":0,"futureHistory":"keep"}]`)
	assertRawJSONField(t, got, "totalcap", `null`)
	assertRawJSONField(t, got, "future", `"keep"`)
}

func assertRawJSONField(t *testing.T, object map[string]json.RawMessage, key string, want string) {
	t.Helper()

	got, ok := object[key]
	if !ok {
		t.Fatalf("missing JSON field %q", key)
	}
	assertLegacyJSONEqual(t, want, got)
}

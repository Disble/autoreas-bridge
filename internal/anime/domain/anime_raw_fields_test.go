package domain

import (
	"strings"
	"testing"
)

func TestLegacyRepetirFieldAbsent(t *testing.T) {
	t.Parallel()

	var field LegacyRepetirField
	if !field.raw.IsAbsent() {
		t.Fatal("expected zero-value LegacyRepetirField to be absent")
	}
	if !field.IsZero() {
		t.Fatal("expected absent repetir field to report IsZero true")
	}
	if got := field.Values(); got != nil {
		t.Fatalf("expected nil values for absent field, got %#v", got)
	}
}

func TestLegacyRepetirFieldNull(t *testing.T) {
	t.Parallel()

	var field LegacyRepetirField
	if err := field.UnmarshalJSON([]byte(`null`)); err != nil {
		t.Fatalf("unmarshal null repetir: %v", err)
	}
	if !field.raw.IsNull() {
		t.Fatal("expected repetir field to be null")
	}
	if field.IsZero() {
		t.Fatal("expected null repetir field IsZero to be false (distinguishable from absent)")
	}
	if got := field.Values(); got != nil {
		t.Fatalf("expected nil values for null field, got %#v", got)
	}
}

func TestLegacyRepetirFieldEmptyArray(t *testing.T) {
	t.Parallel()

	var field LegacyRepetirField
	if err := field.UnmarshalJSON([]byte(`[]`)); err != nil {
		t.Fatalf("unmarshal empty repetir array: %v", err)
	}

	values := field.Values()
	if values == nil {
		t.Fatal("expected non-nil empty slice for empty repetir array")
	}
	if len(values) != 0 {
		t.Fatalf("expected zero repeticion entries, got %d", len(values))
	}
}

func TestLegacyRepetirFieldSingleEntry(t *testing.T) {
	t.Parallel()

	const payload = `[{"numrepeticion":0,"nrocapvisto":1,"estado":2,` +
		`"fechaCreacion":{"$$date":1610685499207},` +
		`"fechaEstreno":{"$$date":1610780062522},` +
		`"fechaUltCapVisto":{"$$date":1610780062522},` +
		`"fechaEliminacion":{"$$date":1611290545239},` +
		`"fechaRepeticion":{"$$date":1618271545221}}]`

	var field LegacyRepetirField
	if err := field.UnmarshalJSON([]byte(payload)); err != nil {
		t.Fatalf("unmarshal single repetir entry: %v", err)
	}

	values := field.Values()
	if len(values) != 1 {
		t.Fatalf("expected 1 repeticion entry, got %d", len(values))
	}

	entry := values[0]
	if got := entry.NumRepeticion.Float64(); got == nil || *got != 0 {
		t.Fatalf("expected numrepeticion 0, got %v", got)
	}
	if got := entry.NroCapVisto.Float64(); got == nil || *got != 1 {
		t.Fatalf("expected nrocapvisto 1, got %v", got)
	}
	if got := entry.Estado.Float64(); got == nil || *got != 2 {
		t.Fatalf("expected estado 2, got %v", got)
	}
	if got := entry.FechaCreacion.Time(); got == nil || got.UnixMilli() != 1610685499207 {
		t.Fatalf("expected fechaCreacion 1610685499207, got %v", got)
	}
	if got := entry.FechaEstreno.Time(); got == nil || got.UnixMilli() != 1610780062522 {
		t.Fatalf("expected fechaEstreno 1610780062522, got %v", got)
	}
	if got := entry.FechaUltCapVisto.Time(); got == nil || got.UnixMilli() != 1610780062522 {
		t.Fatalf("expected fechaUltCapVisto 1610780062522, got %v", got)
	}
	if got := entry.FechaEliminacion.Time(); got == nil || got.UnixMilli() != 1611290545239 {
		t.Fatalf("expected fechaEliminacion 1611290545239, got %v", got)
	}
	if got := entry.FechaRepeticion.Time(); got == nil || got.UnixMilli() != 1618271545221 {
		t.Fatalf("expected fechaRepeticion 1618271545221, got %v", got)
	}
}

func TestLegacyRepetirFieldMultiEntry(t *testing.T) {
	t.Parallel()

	const payload = `[` +
		`{"numrepeticion":0,"nrocapvisto":1,"estado":2},` +
		`{"numrepeticion":1,"nrocapvisto":3,"estado":0}` +
		`]`

	var field LegacyRepetirField
	if err := field.UnmarshalJSON([]byte(payload)); err != nil {
		t.Fatalf("unmarshal multi repetir entries: %v", err)
	}

	values := field.Values()
	if len(values) != 2 {
		t.Fatalf("expected 2 repeticion entries, got %d", len(values))
	}
	if got := values[0].NumRepeticion.Float64(); got == nil || *got != 0 {
		t.Fatalf("expected first numrepeticion 0, got %v", got)
	}
	if got := values[1].NumRepeticion.Float64(); got == nil || *got != 1 {
		t.Fatalf("expected second numrepeticion 1, got %v", got)
	}
}

func TestLegacyRepetirFieldNullFechaDegradesToNilTime(t *testing.T) {
	t.Parallel()

	const payload = `[{"numrepeticion":0,"nrocapvisto":1,"estado":1,"fechaEliminacion":null}]`

	var field LegacyRepetirField
	if err := field.UnmarshalJSON([]byte(payload)); err != nil {
		t.Fatalf("unmarshal repetir entry with null fecha: %v", err)
	}

	values := field.Values()
	if len(values) != 1 {
		t.Fatalf("expected 1 repeticion entry, got %d", len(values))
	}
	if got := values[0].FechaEliminacion.Time(); got != nil {
		t.Fatalf("expected fechaEliminacion nil time for explicit null, got %v", got)
	}
	if got := values[0].FechaCreacion.Time(); got != nil {
		t.Fatalf("expected fechaCreacion nil time for absent field, got %v", got)
	}
}

func TestLegacyRepetirFieldMalformedNonArrayFailsLoud(t *testing.T) {
	t.Parallel()

	var field LegacyRepetirField
	err := field.UnmarshalJSON([]byte(`42`))
	if err == nil {
		t.Fatal("expected error for malformed non-array repetir")
	}
	if !strings.Contains(err.Error(), "cannot unmarshal number into Go value of type []domain.LegacyRepeticion") {
		t.Fatalf("expected type-mismatch error, got %v", err)
	}
}

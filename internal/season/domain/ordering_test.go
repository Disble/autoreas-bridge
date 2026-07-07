package domain

import "testing"

func TestPlanScheduleEmitsIntentsOnlyForChangedAnimes(t *testing.T) {
	current := map[string][]Placement{
		"a": {{Dia: "Visto", Orden: 1}},   // approved, sitting in Visto → gets placed
		"b": {{Dia: "Jueves", Orden: 1}},  // continuing title, unchanged
		"c": {{Dia: "Viernes", Orden: 2}}, // continuing title, reordered
	}
	draft := map[string][]Placement{
		"a": {{Dia: "Domingo", Orden: 1}}, // Visto → Domingo 1
		"b": {{Dia: "Jueves", Orden: 1}},  // no change
		"c": {{Dia: "Viernes", Orden: 3}}, // Viernes 2 → 3
	}

	intents := PlanSchedule(current, draft)

	if len(intents) != 2 {
		t.Fatalf("expected 2 intents (a moved, c reordered), got %d: %+v", len(intents), intents)
	}
	// Sorted by anime id → a, then c.
	if intents[0].AnimeID != "a" || intents[0].Dias[0] != (Placement{Dia: "Domingo", Orden: 1}) {
		t.Fatalf("intent a wrong: %+v", intents[0])
	}
	if intents[1].AnimeID != "c" || intents[1].Dias[0] != (Placement{Dia: "Viernes", Orden: 3}) {
		t.Fatalf("intent c wrong: %+v", intents[1])
	}
}

func TestPlanScheduleNoOpWhenDraftMatchesCurrent(t *testing.T) {
	current := map[string][]Placement{"a": {{Dia: "Jueves", Orden: 2}}}
	draft := map[string][]Placement{"a": {{Dia: "Jueves", Orden: 2}}}
	if intents := PlanSchedule(current, draft); len(intents) != 0 {
		t.Fatalf("identical draft must be a no-op, got %+v", intents)
	}
}

func TestPlanScheduleLeavesUndraftedAnimesUntouched(t *testing.T) {
	current := map[string][]Placement{
		"placed":  {{Dia: "Visto", Orden: 1}},
		"in-rail": {{Dia: "Visto", Orden: 2}}, // still awaiting placement, not in draft
	}
	draft := map[string][]Placement{
		"placed": {{Dia: "Lunes", Orden: 1}},
	}
	intents := PlanSchedule(current, draft)
	if len(intents) != 1 || intents[0].AnimeID != "placed" {
		t.Fatalf("only the drafted anime should get an intent, got %+v", intents)
	}
}

func TestPlanScheduleIsPositionInsensitiveWithinTheArray(t *testing.T) {
	current := map[string][]Placement{"a": {{Dia: "Lunes", Orden: 1}, {Dia: "Jueves", Orden: 2}}}
	draft := map[string][]Placement{"a": {{Dia: "Jueves", Orden: 2}, {Dia: "Lunes", Orden: 1}}} // same mapping, reordered slice
	if intents := PlanSchedule(current, draft); len(intents) != 0 {
		t.Fatalf("same {dia→orden} mapping must be a no-op regardless of slice order, got %+v", intents)
	}
}

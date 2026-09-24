package telemetry

import "testing"

// stubKind is a minimal Kind. It proves the registry dispatches by name
// without dragging a real kind implementation into the lookup's blast
// radius, and it answers with an identity no real kind would produce, so a
// test can tell which registered kind actually served the request.
type stubKind struct {
	name    KindName
	eventID string
	limit   int
}

// Name reports the stub's declared kind name.
func (k stubKind) Name() KindName { return k.name }

// Decode answers with the stub's own fixed event, ignoring the body: the
// registry's job is dispatch, not decoding.
func (k stubKind) Decode([]byte) (Validated, error) {
	return Validated{EventID: k.eventID, Payload: []byte("{}")}, nil
}

// RetentionLimit reports the stub's declared row cap.
func (k stubKind) RetentionLimit() int { return k.limit }

// TestRegistryMissesUnregisteredKind asserts a name nobody registered is a
// miss with no kind, never a fallback to some default kind -- an absent
// declaration must not silently inherit another kind's decoder.
func TestRegistryMissesUnregisteredKind(t *testing.T) {
	t.Parallel()

	registry := NewRegistry(CycleReportKind{})
	kind, ok := registry.Lookup("never_registered_kind")
	if ok {
		t.Fatalf("expected never_registered_kind to miss the registry, got %v", kind)
	}
	if kind != nil {
		t.Fatalf("expected a nil kind on a registry miss, got %v", kind)
	}
}

// TestRegistryKeepsFirstDeclarationOnDuplicateName asserts a duplicate
// registration cannot silently shadow the kind already declared under that
// name: shadowing would change what is stored for every client that already
// sends it.
func TestRegistryKeepsFirstDeclarationOnDuplicateName(t *testing.T) {
	t.Parallel()

	first := stubKind{name: "stub_kind", eventID: "first-declaration", limit: 1}
	second := stubKind{name: "stub_kind", eventID: "second-declaration", limit: 2}
	other := stubKind{name: "other_kind", eventID: "other-declaration", limit: 3}
	registry := NewRegistry(first, second, other)

	kind, ok := registry.Lookup("stub_kind")
	if !ok {
		t.Fatal("expected stub_kind to be registered")
	}
	validated, err := kind.Decode(nil)
	if err != nil {
		t.Fatalf("decode through the registry: %v", err)
	}
	if validated.EventID != "first-declaration" {
		t.Fatalf("expected the first declaration to win, got event id %q", validated.EventID)
	}
	if got := kind.RetentionLimit(); got != 1 {
		t.Fatalf("expected the first declaration's retention limit 1, got %d", got)
	}
	// A duplicate must be skipped, not treated as the end of the
	// declarations: every kind after it still has to be registered.
	if _, ok := registry.Lookup("other_kind"); !ok {
		t.Fatal("expected a kind declared after a duplicate to still be registered")
	}
}

// TestRegistryDispatchesRegisteredKindByItsOwnName asserts one name selects
// exactly one kind's own decoder, retention budget included, and that the
// cycle_report kind is reachable by its declared name.
func TestRegistryDispatchesRegisteredKindByItsOwnName(t *testing.T) {
	t.Parallel()

	stub := stubKind{name: "stub_kind", eventID: "stub-event", limit: 7}
	registry := NewRegistry(CycleReportKind{}, stub)

	kind, ok := registry.Lookup("stub_kind")
	if !ok {
		t.Fatal("expected stub_kind to be registered")
	}
	if got := kind.Name(); got != "stub_kind" {
		t.Fatalf("expected the stub kind to be reached by its own name, got %q", got)
	}
	if got := kind.RetentionLimit(); got != 7 {
		t.Fatalf("expected the stub's own retention limit 7, got %d", got)
	}
	validated, err := kind.Decode([]byte(`{"ignored":true}`))
	if err != nil {
		t.Fatalf("decode through the registry: %v", err)
	}
	if validated.EventID != "stub-event" {
		t.Fatalf("expected the stub's own decoder to serve the request, got event id %q", validated.EventID)
	}

	cycleReport, ok := registry.Lookup(KindCycleReport)
	if !ok {
		t.Fatalf("expected %s to be reachable by name", KindCycleReport)
	}
	if got := cycleReport.Name(); got != KindCycleReport {
		t.Fatalf("expected the registered %s kind, got %q", KindCycleReport, got)
	}
}

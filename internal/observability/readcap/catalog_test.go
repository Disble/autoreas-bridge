package readcap

import "testing"

// TestAllCapabilitiesHaveUniqueNamesAndDeclaredClassifications verifies every
// catalog entry has a unique name and uses one of the declared classifications.
func TestAllCapabilitiesHaveUniqueNamesAndDeclaredClassifications(t *testing.T) {
	t.Parallel()

	validStores := map[Store]struct{}{
		StoreRequestCaptures: {},
		StoreRuntimeEvents:   {},
		StoreSyncDiagnostics: {},
	}
	validKinds := map[Kind]struct{}{
		KindQuery:     {},
		KindAggregate: {},
		KindResolve:   {},
		KindTimeline:  {},
	}
	seenNames := make(map[string]struct{})
	cases := All()

	for _, capability := range cases {
		capability := capability
		t.Run(capability.Name, func(t *testing.T) {
			t.Parallel()

			if capability.Name == "" {
				t.Fatal("capability name is empty")
			}
			if _, found := validStores[capability.Store]; !found {
				t.Fatalf("Store = %q, want a declared store", capability.Store)
			}
			if _, found := validKinds[capability.Kind]; !found {
				t.Fatalf("Kind = %q, want a declared kind", capability.Kind)
			}
		})

		if _, duplicate := seenNames[capability.Name]; duplicate {
			t.Errorf("duplicate capability name %q", capability.Name)
		}
		seenNames[capability.Name] = struct{}{}
	}
}

// TestAllReturnsExpectedNameSet pins the catalog's complete read surface.
func TestAllReturnsExpectedNameSet(t *testing.T) {
	t.Parallel()

	wantNames := map[string]struct{}{
		"search_requests":              {},
		"resolve_request_context":      {},
		"get_request_context":          {},
		"summary_requests":             {},
		"search_events":                {},
		"get_correlation_timeline":     {},
		"summary_events":               {},
		"list_device_sync_diagnostics": {},
	}
	got := All()
	gotNames := make(map[string]struct{}, len(got))
	for _, capability := range got {
		gotNames[capability.Name] = struct{}{}
	}

	if len(gotNames) != len(wantNames) {
		t.Fatalf("capability name count = %d, want %d", len(gotNames), len(wantNames))
	}
	for name := range wantNames {
		if _, found := gotNames[name]; !found {
			t.Errorf("missing capability name %q", name)
		}
	}
}

// TestNamesMatchesAllNameForNameAndInOrder keeps the two catalog views aligned.
func TestNamesMatchesAllNameForNameAndInOrder(t *testing.T) {
	t.Parallel()

	capabilities := All()
	names := Names()
	if len(names) != len(capabilities) {
		t.Fatalf("Names() length = %d, want %d", len(names), len(capabilities))
	}

	for index, capability := range capabilities {
		if names[index] != capability.Name {
			t.Errorf("Names()[%d] = %q, want %q", index, names[index], capability.Name)
		}
	}
}

// TestListDeviceSyncDiagnosticsCapability pins the sync-diagnostics entry's
// identity so a store or kind drift fails loudly instead of silently
// changing what adapters declare against.
func TestListDeviceSyncDiagnosticsCapability(t *testing.T) {
	t.Parallel()

	for _, capability := range All() {
		if capability.Name != "list_device_sync_diagnostics" {
			continue
		}
		if capability.Store != StoreSyncDiagnostics {
			t.Fatalf("Store = %q, want %q", capability.Store, StoreSyncDiagnostics)
		}
		if capability.Kind != KindQuery {
			t.Fatalf("Kind = %q, want %q", capability.Kind, KindQuery)
		}
		return
	}
	t.Fatal("catalog is missing list_device_sync_diagnostics")
}

// TestAllReturnsFreshSlice ensures a caller cannot mutate the catalog.
func TestAllReturnsFreshSlice(t *testing.T) {
	t.Parallel()

	first := All()
	first[0].Name = "mutated"
	second := All()

	if second[0].Name == "mutated" {
		t.Fatal("All() returned a slice affected by a prior caller mutation")
	}
}

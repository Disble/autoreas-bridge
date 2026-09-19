package readparity

import (
	"testing"

	"autoreas-bridge/internal/desktop"
	"autoreas-bridge/internal/mcp/requestcapture"
	"autoreas-bridge/internal/observability/readcap"
)

type adapterDescriptor struct {
	name     string
	exposed  []string
	excluded map[string]string
}

func TestAdaptersDeclareCatalogConformance(t *testing.T) {
	t.Parallel()

	adapters := []adapterDescriptor{
		{
			name:     "mcp request capture sidecar",
			exposed:  requestcapture.ExposedCapabilities(),
			excluded: requestcapture.ExcludedCapabilities(),
		},
		{
			name:     "desktop",
			exposed:  desktop.ObservabilityCapabilities(),
			excluded: desktop.ObservabilityExcludedCapabilities(),
		},
	}
	for _, adapter := range adapters {
		t.Run(adapter.name, func(t *testing.T) {
			assertAdapterConformance(t, adapter)
		})
	}
}

// assertAdapterConformance pins that each adapter completely and consistently declares its catalog coverage.
func assertAdapterConformance(t *testing.T, adapter adapterDescriptor) {
	t.Helper()

	catalogSet := catalogCapabilities()
	declared := make(map[string]struct{}, len(adapter.exposed)+len(adapter.excluded))
	for _, capability := range adapter.exposed {
		assertCatalogMembership(t, adapter, capability, "exposes", catalogSet)
		assertNoDuplicateCapability(t, adapter, capability, declared)
		declared[capability] = struct{}{}
	}
	for capability, reason := range adapter.excluded {
		assertCatalogMembership(t, adapter, capability, "excludes", catalogSet)
		assertExposedAndExcludedDisjoint(t, adapter, capability, declared)
		assertExclusionReason(t, adapter, capability, reason)
		declared[capability] = struct{}{}
	}

	assertCapabilityPartition(t, adapter, declared, catalogSet)
}

// catalogCapabilities pins the canonical capability catalog used to assess adapter declarations.
func catalogCapabilities() map[string]struct{} {
	catalog := readcap.Names()
	catalogSet := make(map[string]struct{}, len(catalog))
	for _, capability := range catalog {
		catalogSet[capability] = struct{}{}
	}
	return catalogSet
}

// assertCatalogMembership pins that every adapter declaration refers to a catalogued capability.
func assertCatalogMembership(
	t *testing.T,
	adapter adapterDescriptor,
	capability string,
	declaration string,
	catalogSet map[string]struct{},
) {
	t.Helper()

	if _, exists := catalogSet[capability]; !exists {
		t.Fatalf("%s %s unknown capability %q", adapter.name, declaration, capability)
	}
}

// assertNoDuplicateCapability pins that an adapter declares each capability at most once.
func assertNoDuplicateCapability(
	t *testing.T,
	adapter adapterDescriptor,
	capability string,
	declared map[string]struct{},
) {
	t.Helper()

	if _, duplicate := declared[capability]; duplicate {
		t.Fatalf("%s exposes duplicate capability %q", adapter.name, capability)
	}
}

// assertExposedAndExcludedDisjoint pins that an adapter cannot both expose and exclude one capability.
func assertExposedAndExcludedDisjoint(
	t *testing.T,
	adapter adapterDescriptor,
	capability string,
	declared map[string]struct{},
) {
	t.Helper()

	if _, alsoExposed := declared[capability]; alsoExposed {
		t.Fatalf("%s both exposes and excludes capability %q", adapter.name, capability)
	}
}

// assertExclusionReason pins that an exclusion never hides a capability without a stated mechanical reason.
func assertExclusionReason(
	t *testing.T,
	adapter adapterDescriptor,
	capability string,
	reason string,
) {
	t.Helper()

	if reason == "" {
		t.Fatalf("%s excludes capability %q without a mechanical reason", adapter.name, capability)
	}
}

// assertCapabilityPartition pins that an adapter accounts for every catalogued capability exactly once.
func assertCapabilityPartition(
	t *testing.T,
	adapter adapterDescriptor,
	declared map[string]struct{},
	catalogSet map[string]struct{},
) {
	t.Helper()

	if len(declared) != len(catalogSet) {
		for capability := range catalogSet {
			if _, exists := declared[capability]; !exists {
				t.Fatalf(
					"%s does not declare catalog capability %q: declares %d capabilities, want catalog size %d",
					adapter.name,
					capability,
					len(declared),
					len(catalogSet),
				)
			}
		}
	}
	for capability := range catalogSet {
		if _, exists := declared[capability]; !exists {
			t.Fatalf("%s does not declare catalog capability %q", adapter.name, capability)
		}
	}
}

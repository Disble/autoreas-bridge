package desktop

import (
	"maps"
	"slices"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/readcap"
)

// ObservabilityCapabilities declares the catalog capabilities exposed by the
// desktop adapter. An absence without a registered mechanical reason is debt,
// which the parity check exists to catch.
func ObservabilityCapabilities() []string {
	return []string{
		"search_requests",
		"resolve_request_context",
		"get_request_context",
		"summary_requests",
		"search_events",
		"summary_events",
		"list_device_sync_diagnostics",
	}
}

// ObservabilityExcludedCapabilities declares catalog capabilities intentionally
// absent from the desktop adapter. An absence without a registered mechanical
// reason is debt, which the parity check exists to catch.
func ObservabilityExcludedCapabilities() map[string]string {
	return map[string]string{
		"get_correlation_timeline": "The merged request+event timeline is excluded because the two stores are keyed on different values, so its request side would render empty by construction.",
	}
}

// ObservabilityParityFacts returns the desktop declaration as data: the
// exposed capability names in declaration order, the excluded names with
// their mechanical reasons sorted by name, and the canonical catalog total
// from readcap. The parity check exists to catch an absence without a
// registered mechanical reason; returning the declaration as a value lets a
// surface state it without copying the prose by hand.
func ObservabilityParityFacts() contracts.ObservabilityParityFacts {
	excluded := ObservabilityExcludedCapabilities()
	exclusions := make([]contracts.ObservabilityExcludedCapability, 0, len(excluded))
	for _, name := range slices.Sorted(maps.Keys(excluded)) {
		exclusions = append(exclusions, contracts.ObservabilityExcludedCapability{Name: name, Reason: excluded[name]})
	}

	return contracts.ObservabilityParityFacts{
		ExposedCapabilities:  ObservabilityCapabilities(),
		ExcludedCapabilities: exclusions,
		CatalogTotal:         len(readcap.Names()),
	}
}

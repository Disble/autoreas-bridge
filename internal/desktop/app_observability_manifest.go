package desktop

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

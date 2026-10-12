// Package identity decides which folder file is the next pending episode.
//
// The application depends on the Identifier port only. The port takes typed
// values (observed entries plus stored context) and returns a decision. This
// unit performs no I/O: no folder reads, no clock, no randomness.
//
// Coverage tiers (binding for this package):
//
//	CORE (100%): the decision logic and the validation it depends on —
//	filename parsing, watched partitioning, resolution, elimination,
//	chronology, reconciliation, selection, and every guard whose failure
//	changes or crashes the decision. Every mutation survivor here is killed
//	or proven equivalent.
//	IMPORTANT (80%): the human-facing Reason and the Diagnostic set,
//	asserted on structure and content kind, never by pinning sentences.
//	INFRASTRUCTURE (0%): the Go type definitions and exported constants in
//	port.go, the package doc, and the adapter wiring. No tests, no mutation
//	chasing, out of the mutation scope.
package identity

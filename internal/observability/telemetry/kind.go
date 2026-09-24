package telemetry

// KindName is a wire discriminator and a member of the closed kind
// vocabulary. It is an alias of string rather than a defined type because it
// crosses the wire and the database as a plain string: a defined type would
// force a conversion at every boundary while adding no safety the vocabulary
// itself does not provide.
type KindName = string

// KindCycleReport is the frozen legacy kind: one sync-cycle diagnostics
// report. It is also the kind an absent kind key decodes as, byte-identical
// to every already-deployed mobile build, which makes it the one kind that
// must never require its name on the wire.
const KindCycleReport KindName = "cycle_report"

// Validated is one kind's contribution to a stored event, produced only by a
// Kind -- the store accepts no other shape, so an unvalidated payload can
// never reach the table.
type Validated struct {
	// EventID is the kind-scoped idempotency key, required. It is unique
	// within its kind, never across kinds: two kinds may legitimately mint
	// the same key string, and one shared key space would silently drop one
	// of them.
	EventID string
	// ObservedAtMS is the nullable client event time, distinct from the
	// receipt clock the envelope records.
	ObservedAtMS *int64
	// Degraded is the nullable fidelity signal: it reports how complete this
	// record is, never how the device is doing.
	Degraded *string
	// Payload is the stored JSON, re-serialized from validated values --
	// never the client's raw request bytes, which validation has already
	// proven can carry undeclared and unvalidated content.
	Payload []byte
}

// Kind is one registered telemetry event kind: one complete declaration
// point. A new kind is an implementation of this interface and nothing else
// -- no table, no column, no migration, no sibling endpoint.
type Kind interface {
	// Name is the wire discriminator this kind answers to.
	Name() KindName
	// Decode strict-decodes and validates one request body of this kind. It
	// rejects, never coerces, and its error names the offending field.
	Decode(body []byte) (Validated, error)
	// RetentionLimit is this kind's own row cap. Retention is per kind so a
	// high-frequency kind cannot evict a low-frequency one.
	RetentionLimit() int
}

// Registry maps a wire kind name to exactly one kind implementation. It is
// the only place that knows the full vocabulary, so the endpoint dispatches
// on a name without naming a kind itself and the store resolves a
// retention cap without importing a kind implementation.
type Registry struct {
	kinds map[KindName]Kind
}

// NewRegistry builds a registry from the declared kinds. The first
// declaration of a name wins and a later duplicate is ignored rather than
// replacing it: a duplicate is a wiring bug, and silently shadowing an
// already-shipped kind would change what is stored for every client that
// sends that name.
func NewRegistry(kinds ...Kind) *Registry {
	registry := &Registry{kinds: make(map[KindName]Kind, len(kinds))}
	for _, kind := range kinds {
		if _, exists := registry.kinds[kind.Name()]; exists {
			continue
		}
		registry.kinds[kind.Name()] = kind
	}
	return registry
}

// Lookup resolves one wire kind name. A miss is reported as a miss and never
// falls back to a default kind: an absent declaration must not inherit
// another kind's decoder and retention budget.
func (r *Registry) Lookup(name KindName) (Kind, bool) {
	kind, ok := r.kinds[name]
	return kind, ok
}

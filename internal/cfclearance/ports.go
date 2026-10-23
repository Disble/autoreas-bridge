package cfclearance

import (
	"context"
	"errors"

	"autoreas-bridge/internal/events"
)

// Solver clears the challenge for origin (scheme://host). rejected is the cf_clearance value
// the upstream just refused ("" when none was sent); a Solver must not return it again.
type Solver interface {
	Solve(ctx context.Context, origin, rejected string) (Clearance, error)
}

// ClearanceStore is the source of truth for the clearance of each registrable domain. A
// Clearance is saved and loaded as one value, so cookies never appear without the User-Agent
// that earned them.
type ClearanceStore interface {
	Load(domain string) (Clearance, bool)
	Save(domain string, c Clearance)
	Delete(domain string)
}

// Publisher announces clearance.* events on the bridge event bus.
type Publisher interface {
	Publish(events.Event)
}

// ErrUnsupported is the error UnsupportedSolver returns: no engine can clear a challenge here.
var ErrUnsupported = errors.New("cfclearance: no challenge solver is available on this platform")

// UnsupportedSolver is the Solver for platforms without an engine. Every solve fails with
// ErrUnsupported, so the transport answers with the challenge and opens a cooldown.
type UnsupportedSolver struct{}

// Solve always fails with ErrUnsupported.
func (UnsupportedSolver) Solve(context.Context, string, string) (Clearance, error) {
	return Clearance{}, ErrUnsupported
}

// nopPublisher drops every event; it stands in when no Publisher is wired.
type nopPublisher struct{}

// Publish drops the event.
func (nopPublisher) Publish(events.Event) {}

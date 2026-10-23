package cfclearance

import "time"

// Tunables accepted with the feature.
const (
	// DefaultSolveTimeout bounds one unattended solve, the wait for a solver slot included.
	DefaultSolveTimeout = 30 * time.Second
	// DefaultMaxSolvesPerRequest allows one solve for a stale stored clearance and one for a
	// genuinely new challenge before a request gives up.
	DefaultMaxSolvesPerRequest = 2
	// DefaultCooldown is how long a domain is left unsolved after a failed solve.
	DefaultCooldown = 10 * time.Minute
	// DefaultMaxConcurrentSolves bounds solver engines running at once across the transport.
	DefaultMaxConcurrentSolves = 1
)

// Policy tunes a Transport. The zero value means every default, and a field left zero keeps its
// default, so a caller can override one knob without restating the rest.
type Policy struct {
	// Eligible decides which hosts the transport may solve for; nil admits every host. Only
	// HTTPS requests are ever eligible, whatever Eligible answers.
	Eligible func(host string) bool
	// SolveTimeout bounds one solve, including the wait for a free solver slot.
	SolveTimeout time.Duration
	// MaxSolvesPerRequest bounds how many solves one request may wait for.
	MaxSolvesPerRequest int
	// Cooldown is how long a domain is left unsolved after a failed solve.
	Cooldown time.Duration
	// MaxConcurrentSolves bounds solver engines running at once, process-wide.
	MaxConcurrentSolves int
}

// DefaultPolicy returns the tunables accepted with the feature.
func DefaultPolicy() Policy {
	return Policy{
		Eligible:            everyHost,
		SolveTimeout:        DefaultSolveTimeout,
		MaxSolvesPerRequest: DefaultMaxSolvesPerRequest,
		Cooldown:            DefaultCooldown,
		MaxConcurrentSolves: DefaultMaxConcurrentSolves,
	}
}

// everyHost is the default eligibility: any host a provider calls over HTTPS.
func everyHost(string) bool {
	return true
}

// withDefaults fills every zero field of p from DefaultPolicy.
func (p Policy) withDefaults() Policy {
	defaults := DefaultPolicy()
	if p.Eligible == nil {
		p.Eligible = defaults.Eligible
	}
	if p.SolveTimeout == 0 {
		p.SolveTimeout = defaults.SolveTimeout
	}
	if p.MaxSolvesPerRequest == 0 {
		p.MaxSolvesPerRequest = defaults.MaxSolvesPerRequest
	}
	if p.Cooldown == 0 {
		p.Cooldown = defaults.Cooldown
	}
	if p.MaxConcurrentSolves == 0 {
		p.MaxConcurrentSolves = defaults.MaxConcurrentSolves
	}
	return p
}

// admits reports whether the policy lets the transport act on a request to scheme://host.
func (p Policy) admits(scheme, host string) bool {
	return scheme == "https" && p.Eligible(host)
}

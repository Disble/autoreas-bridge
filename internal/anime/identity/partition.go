package identity

import "math"

// maxExactOrdinal is the largest context ordinal this port admits: 2^53 - 1.
// The prototype (pending.ts integerProgress/usableNext) imposes no upper bound,
// so this is a Go-specific guard, not ported semantics.
//
// The bound is set one below the largest consecutive float64 integer on
// purpose. At 2^53 a float64 still represents the value exactly, but the
// prototype derives the next episode by adding one in float64, where 2^53 + 1
// rounds straight back to 2^53; Go's exact integer arithmetic would instead
// answer 2^53 + 1. Admitting 2^53 would therefore make the two disagree at the
// very boundary the guard admits. Admitting at most 2^53 - 1 keeps progress + 1
// exactly representable, so the guard removes the divergence instead of
// hiding one behind it. Readings above fail closed as unusable context, never
// truncated into an ordinal.
const maxExactOrdinal = 1<<53 - 1

// usableProgress reports exact integer progress >= 0. Fractional, negative,
// or out-of-range readings never truncate into an ordinal.
func usableProgress(c Context) (int, bool) {
	if !c.ProgressSet {
		return 0, false
	}
	return usableOrdinal(c.Progress, 0)
}

// usableExpected reports a usable positive-integer expected-next.
func usableExpected(c Context) (int, bool) {
	if !c.ExpectedNextSet {
		return 0, false
	}
	return usableOrdinal(c.ExpectedNext, 1)
}

// horizonUsable is the fail-closed inference-horizon guard: the widest
// inference (pending chronology) assigns the consecutive ordinals
// next..next+pendingCount-1, and the prototype computes each of those steps
// in float64, where 2^53+1 rounds back to 2^53 and two candidates collide
// into a reconciled abstention that exact integer arithmetic never sees.
// Requiring next+pendingCount itself to stay inside the admitted exact range
// keeps one spare ordinal of headroom past the widest assignment, so every
// float64 step the prototype takes lands on consecutive integers and the two
// agree. Past the horizon the context is unusable for inference: the caller
// abstains instead of inferring rounded ordinals. Written as a subtraction
// comparison so the addition itself cannot overflow.
func horizonUsable(next, pendingCount int) bool {
	return next <= maxExactOrdinal-pendingCount
}

// usableNext is the ordinal the decision aims at: an explicit usable
// expected-next wins, otherwise exact integer progress implies progress+1.
// Anything else yields no ordinal.
func usableNext(c Context) (int, bool) {
	if e, ok := usableExpected(c); ok {
		return e, true
	}
	if p, ok := usableProgress(c); ok {
		return p + 1, true
	}
	return 0, false
}

// usableOrdinal validates one context token against a minimum.
func usableOrdinal(f float64, min int) (int, bool) {
	if f != math.Trunc(f) {
		return 0, false
	}
	if f < float64(min) || f > maxExactOrdinal {
		return 0, false
	}
	return int(f), true
}

// fractionalProgress reports a numeric fractional progress reading, which
// earns its own abstention sentence.
func fractionalProgress(c Context) bool {
	if !c.ProgressSet || math.IsNaN(c.Progress) || math.IsInf(c.Progress, 0) {
		return false
	}
	return c.Progress != math.Trunc(c.Progress)
}

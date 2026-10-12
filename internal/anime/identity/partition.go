package identity

import "math"

// maxExactOrdinal bounds the ordinal the decision may AIM AT: an inferred or
// expected next must satisfy next <= 2^53 - 1. The prototype (pending.ts
// integerProgress/usableNext) imposes no bound, so this is a Go-specific
// guard rather than ported semantics.
//
// The bound is on the requested NEXT, not on the context value and not on the
// end of the assignment range, because only a collision at the requested next
// can change the decision. The prototype derives candidates in float64, where
// 2^53 + 1 rounds back onto 2^53: with next == 2^53 the first two claimants
// land on one value, reconciliation suspends both, and the prototype abstains
// while exact integer arithmetic would select the earliest. Collisions later
// in a long pending list suspend files that were never going to be selected,
// so they do not affect the outcome and need no guard. Admitting at most
// 2^53 - 1 therefore removes the divergence exactly where it can occur.
//
// Integer progress is admitted up to 2^53 - 2 so that progress + 1 stays inside
// this bound; a reading that would push the next past it yields no usable next
// and the decision abstains. Readings above fail closed, never truncated.
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

// usableNext is the ordinal the decision aims at: an explicit usable
// expected-next wins, otherwise exact integer progress implies progress+1.
// Anything else yields no ordinal, including a progress whose derived next
// would leave the admitted range.
func usableNext(c Context) (int, bool) {
	if e, ok := usableExpected(c); ok {
		return e, true
	}
	if p, ok := usableProgress(c); ok {
		if p+1 > maxExactOrdinal {
			return 0, false
		}
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

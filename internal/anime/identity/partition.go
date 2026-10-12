package identity

import "math"

// maxExactOrdinal is the largest float64 consecutive integer: 2^53. The
// prototype (pending.ts integerProgress/usableNext) imposes no upper bound,
// so this is a Go-specific guard, not ported semantics. Beyond 2^53 a
// float64 no longer represents consecutive integers (spacing grows to 2
// and doubles from there), so the integer check and the progress+1/next
// arithmetic stop being exact; converting such a value with int(f) is
// additionally outside the exactly convertible range and yields an
// implementation-defined result. Readings above fail closed as unusable
// context, never truncated into an ordinal.
const maxExactOrdinal = 1 << 53

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

// Package duration implements the fixed episode-duration rule from the
// episode-duration design (docs/episode-duration-notice.md section 5).
//
// The rule is a constant, not a computation: there is no catalogue lookup,
// no arithmetic mean, no per-folder median and no ratio test. A runtime under
// 20 minutes is Short, 20 to 30 minutes inclusive is Normal, and over 30
// minutes is Long. A runtime that cannot be read, or is not a positive
// finite value, is Unavailable and must never be guessed.
//
// The engine is pure: no I/O, no clock and no randomness.
package duration

import "time"

// ShortUpperBound is the exclusive upper bound of the Short band. Runtimes
// strictly below this value are Short; a runtime of exactly 20 minutes is
// Normal (design section 5: "20-30 min" is the normal band, inclusive).
const ShortUpperBound = 20 * time.Minute

// LongLowerBound is the inclusive upper bound of the Normal band. Runtimes at
// or below this value are Normal; anything strictly above is Long and is what
// triggers the duration notice (design section 5: "over 30 min" is long).
const LongLowerBound = 30 * time.Minute

// Kind is the classification of one episode runtime against the fixed rule.
type Kind int

const (
	// KindUnavailable means no runtime could be established. It is the zero
	// value so an uninitialized Kind fails closed instead of guessing.
	KindUnavailable Kind = iota
	// KindShort is a runtime strictly under 20 minutes. No notice.
	KindShort
	// KindNormal is a runtime from 20 to 30 minutes inclusive. No notice.
	KindNormal
	// KindLong is a runtime strictly over 30 minutes. This triggers the notice.
	KindLong
)

// String returns the printable name of the Kind for diagnostics.
func (k Kind) String() string {
	switch k {
	case KindShort:
		return "Short"
	case KindNormal:
		return "Normal"
	case KindLong:
		return "Long"
	default:
		return "Unavailable"
	}
}

// Classify compares one episode runtime against the fixed rule. It is pure
// and deterministic: no I/O, no clock, no randomness. A zero or negative
// runtime cannot be a real reading and yields KindUnavailable, never a guess.
func Classify(runtime time.Duration) Kind {
	if runtime <= 0 {
		return KindUnavailable
	}
	if runtime < ShortUpperBound {
		return KindShort
	}
	if runtime <= LongLowerBound {
		return KindNormal
	}
	return KindLong
}

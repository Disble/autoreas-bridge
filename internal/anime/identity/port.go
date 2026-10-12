package identity

// Basis names how the next-episode decision was reached. It is shown in the
// interface next to Reason so a conditional inference (elimination or
// chronology) is never mistaken for a clear file number.
type Basis string

// Decision bases. BasisNone always pairs with a nil Next.
const (
	BasisDirectNumber Basis = "direct-number"
	BasisElimination  Basis = "elimination"
	BasisChronology   Basis = "chronology"
	BasisNone         Basis = "none"
)

// AmbiguityKind names the label guard that barred an assignment. Each value
// is produced by exactly one filename guard in parse.go.
type AmbiguityKind string

// Typed ambiguity guards.
const (
	AmbiguityFractional AmbiguityKind = "fractional"
	AmbiguityRange      AmbiguityKind = "range"
	AmbiguityMulti      AmbiguityKind = "multi"
	AmbiguitySpecial    AmbiguityKind = "special"
	AmbiguityTotalHint  AmbiguityKind = "total-hint"
	AmbiguityConflict   AmbiguityKind = "conflict"
)

// DiagnosticKind names the small closed set of facts the decision keeps.
// A surface shows Reason; an operator inspects Diagnostics.
type DiagnosticKind string

// Bounded diagnostic taxonomy. No other kind is ever emitted.
const (
	// DiagnosticInversion keeps a creation-date inversion the clear number
	// beat. Detail names the counterpart basename (the file itself when its
	// own creation time is newer than its retained modification time).
	DiagnosticInversion DiagnosticKind = "inversion"
	// DiagnosticUnusableContext records a supplied progress or expected-next
	// token that was present but not a usable integer. Detail is "progress"
	// or "expected-next".
	DiagnosticUnusableContext DiagnosticKind = "unusable-context"
	// DiagnosticAmbiguity records a typed ambiguity that forced an
	// abstention. Detail is the AmbiguityKind value.
	DiagnosticAmbiguity DiagnosticKind = "ambiguity"
	// DiagnosticDuplicate records a claimant suspended by one-to-one
	// reconciliation. Episode is the contested ordinal.
	DiagnosticDuplicate DiagnosticKind = "duplicate"
)

// Diagnostic is one typed fact worth keeping. Field use per kind:
// inversion: Basename and Detail (counterpart); unusable-context: Detail
// ("progress"/"expected-next"); ambiguity: Basename, Episode when a single
// ordinal was redefined, Detail (ambiguity kind); duplicate: Basename and
// Episode (contested ordinal).
type Diagnostic struct {
	Kind     DiagnosticKind
	Basename string
	Episode  int
	Detail   string
}

// Entry is one observed folder file. Timestamps are decimal nanoseconds;
// empty means unavailable, never zero-filled. Tags are explicit episode
// labels; only a trimmed tag matching an optional episode keyword plus 1-3
// digits carries a claim.
type Entry struct {
	Basename string
	BirthNs  string
	MtimeNs  string
	Tags     []string
	Err      string
	Changed  bool
}

// Context is the stored decision context. Progress is watched progress;
// ExpectedNext is the cursor convention's expectation, a labelled hypothesis
// and never authority. Each value is usable only as an exact integer
// (progress >= 0, expected-next > 0); anything else is kept as an
// unusable-context diagnostic, never truncated.
type Context struct {
	ProgressSet     bool
	Progress        float64
	ExpectedNextSet bool
	ExpectedNext    float64
}

// Selection is the decided next episode: its ordinal plus the basename that
// carries it.
type Selection struct {
	Episode  int
	Basename string
}

// Request carries the observed entries and the stored context.
type Request struct {
	Entries []Entry
	Context Context
}

// Result is the whole decision the application needs back. Next is nil when
// the decision abstains. Reason is one short human sentence for the
// interface. Watched and Pending count the files considered on each side of
// the progress partition.
type Result struct {
	Next        *Selection
	Reason      string
	Basis       Basis
	Watched     int
	Pending     int
	Diagnostics []Diagnostic
}

// Identifier is the port the application depends on: decide which file is
// the next pending episode, or abstain with a reason.
type Identifier interface {
	Identify(Request) Result
}

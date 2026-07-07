// Package domain holds the season-selection aggregate and its pure decision
// logic. It has no I/O and no dependencies on other bounded contexts, so it is
// safe to unit-test in isolation and to import from the season service.
package domain

// Consideration is the fixed exception enum applied to a season anime during
// selection. It mirrors the 10-year Excel "Consideraciones" column and is the
// only override lever on the derived verdict. Identifiers and stored tokens are
// English (ADR-007); the UI maps them to display labels.
type Consideration string

const (
	// ConsiderationNone is the default: the verdict follows purely from the grade.
	ConsiderationNone Consideration = "none"
	// ConsiderationInsufficientQuota rejects a passing-grade anime (more approved
	// than slots) — the Excel "Falta Cupo".
	ConsiderationInsufficientQuota Consideration = "insufficient_quota"
	// ConsiderationTemporarilyApproved approves a failing-grade anime (fewer
	// approved than slots) — the Excel "Aprobado temporalmente".
	ConsiderationTemporarilyApproved Consideration = "temporarily_approved"
	// ConsiderationSpareQuota approves a failing-grade anime (spare slots) — the
	// Excel "Sobra Cupo".
	ConsiderationSpareQuota Consideration = "spare_quota"
)

// Verdict is the final approved/rejected outcome. It is ALWAYS derived from
// (grade, minApprovalGrade, consideration) and is never stored — changing the
// minimum approval grade re-derives the whole table instantly, exactly like the
// Excel it replaces.
type Verdict string

const (
	VerdictApproved Verdict = "approved"
	VerdictRejected Verdict = "rejected"
)

// Estado values applied to the underlying anime when a verdict is confirmed
// (SDD-40 canonical vocabulary): approved animes go to "Viendo" (0, active),
// rejected animes to "No me gusto" (2, inactive).
const (
	estadoViendo    = 0
	estadoNoMeGusto = 2
)

// Decision replicates the Excel selection formula verbatim. An ungraded anime
// (grade 0) fails the grade test and derives as rejected unless a consideration
// rescues it.
func Decision(grade, minApprovalGrade int, c Consideration) Verdict {
	if grade >= minApprovalGrade && c != ConsiderationInsufficientQuota {
		return VerdictApproved
	}
	if c == ConsiderationTemporarilyApproved || c == ConsiderationSpareQuota {
		return VerdictApproved
	}
	return VerdictRejected
}

// PatchIntent is one planned anime state change produced by Reconcile: the target
// estado/activo for a created season candidate given its derived verdict. The
// service turns each intent into an anime write; the write layer's value-equal
// no-op skips candidates already in the target state.
type PatchIntent struct {
	AnimeID string
	Estado  int
	Activo  bool
	Verdict Verdict
}

// Reconcile plans the full bidirectional selection reconciliation: for every
// created, anime-linked row it derives the verdict and the target anime state
// (approved → Viendo/active, rejected → No me gusto/inactive). Pure and
// idempotent — uncreated intake rows never produce an intent.
func Reconcile(rows []SeasonAnime, minApprovalGrade int) []PatchIntent {
	var intents []PatchIntent
	for _, r := range rows {
		if r.Availability != AvailabilityCreated || r.AnimeID == "" {
			continue
		}
		verdict := Decision(r.Grade, minApprovalGrade, r.Consideration)
		intent := PatchIntent{AnimeID: r.AnimeID, Verdict: verdict}
		if verdict == VerdictApproved {
			intent.Estado, intent.Activo = estadoViendo, true
		} else {
			intent.Estado, intent.Activo = estadoNoMeGusto, false
		}
		intents = append(intents, intent)
	}
	return intents
}

// ApprovedCount returns how many intents are approvals — the quota check input.
func ApprovedCount(intents []PatchIntent) int {
	n := 0
	for _, i := range intents {
		if i.Verdict == VerdictApproved {
			n++
		}
	}
	return n
}

package domain

import (
	"testing"
	"time"
)

// TestDecisionExcelParity replicates the 10-year Excel formula verbatim:
//
//	=IF(AND(C4>=grade, NOT(EXACT(F4,"Falta Cupo"))), "Aprobado",
//	    IF(OR(EXACT(F4,"Aprobado temporalmente"), EXACT(F4,"Sobra Cupo")),
//	       "Aprobado", "Reprobado"))
//
// Cases include the real Abril 2026 sheet rows (min approval grade 4).
func TestDecisionExcelParity(t *testing.T) {
	cases := []struct {
		name             string
		grade            int
		minApprovalGrade int
		consideration    Consideration
		want             Verdict
	}{
		// Real sheet rows, grade 4.
		{"MAO grade 3 rejects", 3, 4, ConsiderationNone, VerdictRejected},
		{"Honzuki grade 4 approves", 4, 4, ConsiderationNone, VerdictApproved},
		{"Akane-banashi grade 5 approves", 5, 4, ConsiderationNone, VerdictApproved},
		{"Koori no Jouheki grade 2 rejects", 2, 4, ConsiderationNone, VerdictRejected},
		{"Jishou Akuyaku grade 4 + Insufficient quota rejects", 4, 4, ConsiderationInsufficientQuota, VerdictRejected},

		// Consideration overrides.
		{"failing grade rescued by Spare quota", 3, 4, ConsiderationSpareQuota, VerdictApproved},
		{"failing grade rescued by Temporarily approved", 2, 4, ConsiderationTemporarilyApproved, VerdictApproved},
		{"passing grade with Spare quota still approves", 5, 4, ConsiderationSpareQuota, VerdictApproved},

		// Ungraded (grade 0) derives as rejected unless a consideration rescues it.
		{"ungraded rejects", 0, 4, ConsiderationNone, VerdictRejected},
		{"ungraded rescued by Spare quota", 0, 4, ConsiderationSpareQuota, VerdictApproved},

		// Boundary and alternate cutoffs.
		{"grade equal to cutoff approves", 4, 4, ConsiderationNone, VerdictApproved},
		{"cutoff 5: grade 4 rejects", 4, 5, ConsiderationNone, VerdictRejected},
		{"cutoff 5: grade 5 approves", 5, 5, ConsiderationNone, VerdictApproved},
		{"cutoff 3: grade 3 approves", 3, 3, ConsiderationNone, VerdictApproved},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Decision(tc.grade, tc.minApprovalGrade, tc.consideration)
			if got != tc.want {
				t.Fatalf("Decision(%d, %d, %q) = %q, want %q", tc.grade, tc.minApprovalGrade, tc.consideration, got, tc.want)
			}
		})
	}
}

func createdRow(id, animeID string, grade int, c Consideration) SeasonAnime {
	sa := NewSeasonAnime(id, "season-1", id, time.UnixMilli(0))
	sa.MatchStatus = MatchMatched
	sa.Availability = AvailabilityCreated
	sa.AnimeID = animeID
	sa.Grade = grade
	sa.Consideration = c
	return sa
}

func TestReconcilePlansApprovedAndRejectedStates(t *testing.T) {
	rows := []SeasonAnime{
		createdRow("a", "anime-a", 5, ConsiderationNone),                // approved → Viendo/active
		createdRow("b", "anime-b", 2, ConsiderationNone),                // rejected → No me gusto/inactive
		NewSeasonAnime("c", "season-1", "uncreated", time.UnixMilli(0)), // no intent
	}
	intents := Reconcile(rows, 4)

	if len(intents) != 2 {
		t.Fatalf("expected 2 intents (created only), got %d: %+v", len(intents), intents)
	}
	if intents[0].AnimeID != "anime-a" || intents[0].Estado != 0 || !intents[0].Activo || intents[0].Verdict != VerdictApproved {
		t.Fatalf("approved intent wrong: %+v", intents[0])
	}
	if intents[1].AnimeID != "anime-b" || intents[1].Estado != 2 || intents[1].Activo || intents[1].Verdict != VerdictRejected {
		t.Fatalf("rejected intent wrong: %+v", intents[1])
	}
}

func TestReconcileConsiderationFlipsVerdict(t *testing.T) {
	rows := []SeasonAnime{createdRow("a", "anime-a", 2, ConsiderationSpareQuota)}
	intents := Reconcile(rows, 4)
	if intents[0].Verdict != VerdictApproved || intents[0].Estado != 0 || !intents[0].Activo {
		t.Fatalf("spare-quota rescue not applied: %+v", intents[0])
	}
}

func TestApprovedCount(t *testing.T) {
	rows := []SeasonAnime{
		createdRow("a", "anime-a", 5, ConsiderationNone),
		createdRow("b", "anime-b", 2, ConsiderationNone),
		createdRow("c", "anime-c", 4, ConsiderationNone),
	}
	if got := ApprovedCount(Reconcile(rows, 4)); got != 2 {
		t.Fatalf("ApprovedCount = %d, want 2", got)
	}
}

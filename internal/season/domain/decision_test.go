package domain

import "testing"

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
		nota             int
		minApprovalGrade int
		consideracion    Consideracion
		want             Verdict
	}{
		// Real sheet rows, grade 4.
		{"MAO nota 3 rejects", 3, 4, ConsideracionNone, VerdictReprobado},
		{"Honzuki nota 4 approves", 4, 4, ConsideracionNone, VerdictAprobado},
		{"Akane-banashi nota 5 approves", 5, 4, ConsideracionNone, VerdictAprobado},
		{"Koori no Jouheki nota 2 rejects", 2, 4, ConsideracionNone, VerdictReprobado},
		{"Jishou Akuyaku nota 4 + Falta Cupo rejects", 4, 4, ConsideracionFaltaCupo, VerdictReprobado},

		// Consideration overrides.
		{"failing nota rescued by Sobra Cupo", 3, 4, ConsideracionSobraCupo, VerdictAprobado},
		{"failing nota rescued by Aprobado temporalmente", 2, 4, ConsideracionAprobadoTemporalmente, VerdictAprobado},
		{"passing nota with Sobra Cupo still approves", 5, 4, ConsideracionSobraCupo, VerdictAprobado},

		// Ungraded (nota 0) derives as Reprobado unless a consideration rescues it.
		{"ungraded rejects", 0, 4, ConsideracionNone, VerdictReprobado},
		{"ungraded rescued by Sobra Cupo", 0, 4, ConsideracionSobraCupo, VerdictAprobado},

		// Boundary and alternate cutoffs.
		{"nota equal to grade approves", 4, 4, ConsideracionNone, VerdictAprobado},
		{"grade 5: nota 4 rejects", 4, 5, ConsideracionNone, VerdictReprobado},
		{"grade 5: nota 5 approves", 5, 5, ConsideracionNone, VerdictAprobado},
		{"grade 3: nota 3 approves", 3, 3, ConsideracionNone, VerdictAprobado},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Decision(tc.nota, tc.minApprovalGrade, tc.consideracion)
			if got != tc.want {
				t.Fatalf("Decision(%d, %d, %q) = %q, want %q", tc.nota, tc.minApprovalGrade, tc.consideracion, got, tc.want)
			}
		})
	}
}

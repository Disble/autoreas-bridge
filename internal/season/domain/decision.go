// Package domain holds the season-selection aggregate and its pure decision
// logic. It has no I/O and no dependencies on other bounded contexts, so it is
// safe to unit-test in isolation and to import from the season service.
package domain

// Consideracion is the fixed exception enum applied to a season anime during
// selection. It mirrors the 10-year Excel "Consideraciones" column and is the
// only override lever on the derived verdict.
type Consideracion string

const (
	// ConsideracionNone is the default: the verdict follows purely from the grade.
	ConsideracionNone Consideracion = "none"
	// ConsideracionFaltaCupo rejects a passing-grade anime (more approved than slots).
	ConsideracionFaltaCupo Consideracion = "falta_cupo"
	// ConsideracionAprobadoTemporalmente approves a failing-grade anime (fewer approved than slots).
	ConsideracionAprobadoTemporalmente Consideracion = "aprobado_temporalmente"
	// ConsideracionSobraCupo approves a failing-grade anime (spare slots).
	ConsideracionSobraCupo Consideracion = "sobra_cupo"
)

// Verdict is the final Aprobado/Reprobado outcome. It is ALWAYS derived from
// (grade, minApprovalGrade, consideración) and is never stored — changing the
// minimum approval grade re-derives the whole table instantly, exactly like the
// Excel it replaces. The Aprobado/Reprobado value vocabulary is SDD-45's to
// English-ify when it wires selection persistence/UI (see ADR-007).
type Verdict string

const (
	VerdictAprobado  Verdict = "Aprobado"
	VerdictReprobado Verdict = "Reprobado"
)

// Decision replicates the Excel selection formula verbatim. An ungraded anime
// (grade 0) fails the grade test and derives as Reprobado unless a consideration
// rescues it.
func Decision(grade, minApprovalGrade int, c Consideracion) Verdict {
	if grade >= minApprovalGrade && c != ConsideracionFaltaCupo {
		return VerdictAprobado
	}
	if c == ConsideracionAprobadoTemporalmente || c == ConsideracionSobraCupo {
		return VerdictAprobado
	}
	return VerdictReprobado
}

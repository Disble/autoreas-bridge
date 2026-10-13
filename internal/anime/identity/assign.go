package identity

import (
	"cmp"
	"slices"
)

// assign publishes the whole-folder outcome from the same resolved rows the
// next-episode decision reads: every claimed row is an assignment, every
// other row is skipped with exactly one reason. The progress partition and
// the exact-next selection are not consulted, so watched episodes stay
// assigned.
func assign(req Request) Assignment {
	rows, byName, _, _ := resolveRows(req)
	var out Assignment
	for _, i := range byName {
		r := &rows[i]
		if r.claimed {
			out.Assigned = append(out.Assigned, Selection{Episode: r.single, Basename: r.entry.Basename})
			continue
		}
		out.Skipped = append(out.Skipped, skipOf(r))
	}
	slices.SortFunc(out.Assigned, func(a, b Selection) int { return cmp.Compare(a.Episode, b.Episode) })
	return out
}

// skipOf names why an unclaimed row took no episode: an unreliable capture
// first, then a suspended duplicate, then the typed ambiguity Identify would
// report, and otherwise the absence of any number.
func skipOf(r *file) Diagnostic {
	if !r.reliable {
		return Diagnostic{Kind: DiagnosticUnreadable, Basename: r.entry.Basename}
	}
	if r.hasDupEp {
		return duplicateOf(r)
	}
	if d, ok := ambiguityOf(r); ok {
		return d
	}
	return Diagnostic{Kind: DiagnosticUnnumbered, Basename: r.entry.Basename}
}

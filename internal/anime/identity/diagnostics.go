package identity

// diagnosticsOf keeps the bounded typed facts: unusable context tokens,
// suspended duplicate claimants, abstention-forcing ambiguities, and the
// creation-date inversions a clear number beat.
func diagnosticsOf(req Request, rows []file, byName []int, winner int) []Diagnostic {
	var out []Diagnostic
	out = appendContextDiagnostics(out, req.Context)
	out = appendDuplicateDiagnostics(out, rows, byName)
	if winner >= 0 {
		return appendInversions(out, rows, winner)
	}
	return appendAmbiguityDiagnostics(out, rows, byName)
}

// appendContextDiagnostics keeps the supplied progress or expected-next
// tokens that were present but not usable integers.
func appendContextDiagnostics(out []Diagnostic, c Context) []Diagnostic {
	if c.ProgressSet {
		if _, ok := usableProgress(c); !ok {
			out = append(out, Diagnostic{Kind: DiagnosticUnusableContext, Detail: "progress"})
		}
	}
	if c.ExpectedNextSet {
		if _, ok := usableExpected(c); !ok {
			out = append(out, Diagnostic{Kind: DiagnosticUnusableContext, Detail: "expected-next"})
		}
	}
	return out
}

// appendDuplicateDiagnostics keeps every claimant suspended by one-to-one
// reconciliation, in basename order.
func appendDuplicateDiagnostics(out []Diagnostic, rows []file, byName []int) []Diagnostic {
	for _, i := range byName {
		if rows[i].hasDupEp {
			out = append(out, duplicateOf(&rows[i]))
		}
	}
	return out
}

// duplicateOf is the duplicate fact of a suspended claimant.
func duplicateOf(r *file) Diagnostic {
	return Diagnostic{Kind: DiagnosticDuplicate, Basename: r.entry.Basename, Episode: r.dupEp}
}

// appendAmbiguityDiagnostics keeps the abstention-forcing ambiguities on
// rows no duplicate diagnostic already covers.
func appendAmbiguityDiagnostics(out []Diagnostic, rows []file, byName []int) []Diagnostic {
	for _, i := range byName {
		if rows[i].hasDupEp {
			continue
		}
		if d, ok := ambiguityOf(&rows[i]); ok {
			out = append(out, d)
		}
	}
	return out
}

// ambiguityOf returns a row's abstention-forcing ambiguity: a conflict, or a
// typed marker with the single redefined ordinal when one exists.
func ambiguityOf(r *file) (Diagnostic, bool) {
	switch {
	case r.conflict:
		return Diagnostic{Kind: DiagnosticAmbiguity, Basename: r.entry.Basename, Detail: string(AmbiguityConflict)}, true
	case r.hasAmbig:
		return Diagnostic{Kind: DiagnosticAmbiguity, Basename: r.entry.Basename, Episode: ambiguityEpisode(r), Detail: string(r.ambig)}, true
	}
	return Diagnostic{}, false
}

// ambiguityEpisode returns the single ordinal a marker redefined, or zero
// when the row carries no single ordinal.
func ambiguityEpisode(r *file) int {
	if len(r.ords) == 1 {
		return r.ords[0]
	}
	return 0
}

// appendInversions keeps every creation-date disagreement the winner's clear
// number beat: its own retained-mtime inversion plus any ordinal/birth
// disagreement with another accepted file. Comparison is exact big-integer.
func appendInversions(out []Diagnostic, rows []file, winner int) []Diagnostic {
	w := &rows[winner]
	wbirth, wok := parseNs(w.entry.BirthNs)
	wmtime, mok := parseNs(w.entry.MtimeNs)
	if wok && mok && wbirth.Cmp(wmtime) > 0 {
		out = append(out, Diagnostic{Kind: DiagnosticInversion, Basename: w.entry.Basename, Episode: w.single, Detail: w.entry.Basename})
	}
	if !wok {
		return out
	}
	for i := range rows {
		if i == winner || !rows[i].claimed {
			continue
		}
		obirth, ok := parseNs(rows[i].entry.BirthNs)
		if !ok {
			continue
		}
		o := rows[i].single
		if o < w.single && obirth.Cmp(wbirth) > 0 || o > w.single && obirth.Cmp(wbirth) < 0 {
			out = append(out, Diagnostic{Kind: DiagnosticInversion, Basename: w.entry.Basename, Episode: w.single, Detail: rows[i].entry.Basename})
		}
	}
	return out
}

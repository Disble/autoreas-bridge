package identity

// claimCopySuffixLeads runs right after the clear numbers and before any
// elimination or chronology. It reads the folder as columns: a file named
// "04(2).mp4" proposes the lead 4 and the parenthesized 2. On its own that
// 2 might be a total ("episode 1 of 24") or an absolute number, so a single
// file stays ambiguous. The folder settles it when the parenthesized number
// cannot be an episode:
//
//   - any value in the parenthesized column repeats across the candidates
//     (two files are never one episode, so that whole column is a total or a
//     copy counter, even on the file whose own counter happens to be unique:
//     "01(9)" beside "02(3)" and "03(3)"), or
//   - it is below the file's own lead (no total or absolute number is
//     smaller than the episode it labels; only a copy counter is).
//
// Either way the lead is the episode, and it is claimed as a direct number
// when no other file proposes it. A lead shared by two files, or one a clear
// number already holds, is left as it was.
func claimCopySuffixLeads(rows []file, byName []int, counts map[int]int) {
	cands := copySuffixCandidates(rows, byName)
	parens, leads := map[int]int{}, map[int]int{}
	columnRepeats := false
	for _, i := range cands {
		parens[rows[i].paren]++
		leads[rows[i].lead]++
		columnRepeats = columnRepeats || parens[rows[i].paren] > 1
	}
	for _, i := range cands {
		r := &rows[i]
		if !columnRepeats && r.paren >= r.lead {
			continue
		}
		if leads[r.lead] > 1 || counts[r.lead] > 0 {
			continue
		}
		r.claimed, r.single, r.basis = true, r.lead, BasisDirectNumber
		r.hasAmbig = false
	}
}

// copySuffixCandidates returns, in basename order, the reliable rows whose
// only obstacle is a trailing "(N)" with a usable lead before it. A row with
// no proposed ordinal is never claimed or in conflict yet, so those need no
// separate check.
func copySuffixCandidates(rows []file, byName []int) []int {
	var out []int
	for _, i := range byName {
		r := &rows[i]
		if r.reliable && len(r.ords) == 0 && r.ambig == AmbiguityTotalHint && r.hasLead {
			out = append(out, i)
		}
	}
	return out
}

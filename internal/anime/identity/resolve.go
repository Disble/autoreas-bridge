package identity

import (
	"fmt"
	"sort"
)

// file is one working row. It holds values copied from the request; ordering
// permutes indices only, so the request is never mutated.
type file struct {
	entry    Entry
	ords     []int
	single   int
	ambig    AmbiguityKind
	hasAmbig bool
	conflict bool
	dupEp    int
	hasDupEp bool
	reliable bool
	claimed  bool
	basis    Basis
	watched  bool
}

// eligible reports whether a row may take an inferred ordinal: reliable, no
// identity, no ambiguity, no conflict — an empty unnumbered candidate, never
// a typed ambiguity.
func eligible(r *file) bool {
	return !r.claimed && !r.conflict && !r.hasAmbig && r.reliable
}

// decide is the pure decision algorithm, kept as a fixed pass order: rows,
// basename order, ordinal proposals, clear numbers, watched partition,
// opaque-sibling elimination, single-pending elimination, pending
// chronology, global one-to-one reconciliation, then the exact-next
// selection. That order is the ported semantics; the steps below only name
// it, never reorder it.
func decide(req Request) Result {
	rows, byName, next, hasNext := resolveRows(req)
	winner := selectWinner(rows, byName, next, hasNext)
	watched := countWatched(rows)
	return assembleResult(req, rows, byName, winner, next, hasNext, watched)
}

// resolveRows runs every pass up to and including global reconciliation and
// returns the published rows, their basename order, and the usable next. Both
// the next-episode decision and the whole-folder assignment read these rows,
// so they can never disagree on a file.
func resolveRows(req Request) ([]file, []int, int, bool) {
	rows := initRows(req)
	byName := orderByName(rows)
	counts := proposeOrdinals(rows, byName)
	markClearNumbers(rows, byName, counts)
	progress, hasProgress := usableProgress(req.Context)
	next, hasNext := usableNext(req.Context)
	partitionWatched(rows, progress, hasProgress)
	eliminateOpaqueSibling(rows, byName, next, hasNext)
	eliminateSinglePending(rows, byName, req.Context, progress, hasProgress, next, hasNext)
	assignPendingChronology(rows, byName, next, hasNext)
	reconcileDuplicates(rows)
	return rows, byName, next, hasNext
}

// initRows copies the request entries into working rows, marking which rows
// are reliable enough to ever take an assignment.
func initRows(req Request) []file {
	rows := make([]file, len(req.Entries))
	for i, e := range req.Entries {
		rows[i].entry = e
		rows[i].reliable = e.Err == "" && !e.Changed
	}
	return rows
}

// orderByName returns the row indices in basename order, so input order
// never affects the decision. The sort is stable over input order.
func orderByName(rows []file) []int {
	byName := make([]int, len(rows))
	for i := range byName {
		byName[i] = i
	}
	sort.SliceStable(byName, func(a, b int) bool {
		return rows[byName[a]].entry.Basename < rows[byName[b]].entry.Basename
	})
	return byName
}

// proposeOrdinals parses every basename and explicit tag into per-entry
// ordinal proposals, returning how often each ordinal was proposed. Nothing
// is published yet.
func proposeOrdinals(rows []file, byName []int) map[int]int {
	counts := map[int]int{}
	for _, i := range byName {
		proposeRowOrdinals(&rows[i])
		for _, o := range rows[i].ords {
			counts[o]++
		}
	}
	return counts
}

// proposeRowOrdinals fills one row's ordinal proposals from its basename
// plus any explicit tag claims.
func proposeRowOrdinals(r *file) {
	l := parseName(r.entry.Basename)
	ords := append([]int(nil), l.ords...)
	for _, t := range r.entry.Tags {
		if o, ok := tagOrd(t); ok {
			ords = append(ords, o)
		}
	}
	r.ords = dedup(ords)
	r.ambig, r.hasAmbig = l.ambig, l.hasAmbig
}

// markClearNumbers accepts uncontested single ordinals as direct-number
// claims and flags competing or duplicated labels as conflicts.
func markClearNumbers(rows []file, byName []int, counts map[int]int) {
	for _, i := range byName {
		classifyRow(&rows[i], counts)
	}
}

// classifyRow applies the clear-number rules to one row: unreliable rows
// stay observed, competing or duplicated labels become conflicts, ambiguous
// markers never collapse, and a lone uncontested ordinal is claimed.
func classifyRow(r *file, counts map[int]int) {
	switch {
	case !r.reliable:
		// Observed but never accepted.
	case len(r.ords) > 1:
		// Competing claims stay visible; none is accepted.
		r.conflict = true
	case len(r.ords) == 1 && counts[r.ords[0]] > 1:
		// Duplicate label: no shared assignment.
		r.conflict = true
		r.dupEp, r.hasDupEp = r.ords[0], true
	case r.hasAmbig:
		// Ambiguous markers never collapse to an ordinary ordinal.
	case len(r.ords) == 1:
		// Clear number carries regardless of dates, which stay
		// diagnostic. Missing or tied timestamps never veto it.
		r.claimed = true
		r.single = r.ords[0]
		r.basis = BasisDirectNumber
	}
}

// partitionWatched marks claimed rows at or below usable progress as
// watched. Integer progress excludes already-watched ordinals from pending.
// Format alone never marks watched.
func partitionWatched(rows []file, progress int, hasProgress bool) {
	if !hasProgress {
		return
	}
	for i := range rows {
		if rows[i].claimed && rows[i].single <= progress {
			rows[i].watched = true
		}
	}
}

// claimedBy reports whether any row claims the given ordinal.
func claimedBy(rows []file, ep int) bool {
	for i := range rows {
		if rows[i].claimed && rows[i].single == ep {
			return true
		}
	}
	return false
}

// eliminateOpaqueSibling claims the usable next for exactly one opaque
// pending file beside identified numbered pending siblings, when nobody
// claims it.
func eliminateOpaqueSibling(rows []file, byName []int, next int, hasNext bool) {
	if !hasNext || claimedBy(rows, next) {
		return
	}
	var opaque, numbered, target int
	for _, i := range byName {
		switch {
		case rows[i].watched:
		case rows[i].claimed:
			numbered++
		case eligible(&rows[i]):
			opaque++
			target = i
		}
	}
	if opaque == 1 && numbered >= 1 {
		rows[target].claimed = true
		rows[target].single = next
		rows[target].basis = BasisElimination
	}
}

// eliminateSinglePending claims the usable next for the sole remaining
// opaque file under a complete watched prefix: integer progress exists, an
// explicit expected-next agrees with progress+1, and the watched files
// account for every ordinal 1..progress exactly once. A lone file without
// usable watched context never qualifies.
func eliminateSinglePending(rows []file, byName []int, c Context, progress int, hasProgress bool, next int, hasNext bool) {
	if !hasNext || claimedBy(rows, next) || !hasProgress || progress < 1 {
		return
	}
	pending := pendingRows(rows, byName)
	if len(pending) != 1 || !eligible(&rows[pending[0]]) || !expectedAgrees(c, progress) ||
		!watchedPrefixComplete(rows, progress) {
		return
	}
	rows[pending[0]].claimed = true
	rows[pending[0]].single = next
	rows[pending[0]].basis = BasisElimination
}

// pendingRows returns the unwatched row indices in basename order.
func pendingRows(rows []file, byName []int) []int {
	var pending []int
	for _, i := range byName {
		if !rows[i].watched {
			pending = append(pending, i)
		}
	}
	return pending
}

// assignPendingChronology assigns consecutive ordinals from the usable next
// to a fully opaque pending set in creation order. Watched rows never take
// part. Ties, unknowns, or inversions abstain.
func assignPendingChronology(rows []file, byName []int, next int, hasNext bool) {
	if !hasNext {
		return
	}
	pending := pendingRows(rows, byName)
	if len(pending) < 2 || !pendingAllOpaque(rows, pending) {
		return
	}
	stamps := make([]stamp, len(pending))
	for k, i := range pending {
		b, _ := parseNs(rows[i].entry.BirthNs)
		m, _ := parseNs(rows[i].entry.MtimeNs)
		stamps[k] = stamp{birth: b, mtime: m}
	}
	order, ok := chronologyOrder(stamps)
	if !ok {
		return
	}
	for k, pos := range order {
		i := pending[pos]
		rows[i].claimed = true
		rows[i].single = next + k
		rows[i].basis = BasisChronology
	}
}

// pendingAllOpaque reports whether every pending row may take an inferred
// ordinal.
func pendingAllOpaque(rows []file, pending []int) bool {
	for _, i := range pending {
		if !eligible(&rows[i]) {
			return false
		}
	}
	return true
}

// reconcileDuplicates suspends every claimant of a contested ordinal, so no
// hidden iteration-order winner survives publishing.
func reconcileDuplicates(rows []file) {
	byEp := map[int][]int{}
	for i := range rows {
		if rows[i].claimed {
			byEp[rows[i].single] = append(byEp[rows[i].single], i)
		}
	}
	for ep, list := range byEp {
		if len(list) > 1 {
			for _, i := range list {
				rows[i].claimed = false
				rows[i].dupEp, rows[i].hasDupEp = ep, true
			}
		}
	}
}

// selectWinner returns the published, unwatched assignment at the usable
// next ordinal, or -1 when abstaining. Never a nearby ordinal merely
// because the requested one is missing or watched.
func selectWinner(rows []file, byName []int, next int, hasNext bool) int {
	if !hasNext {
		return -1
	}
	for _, i := range byName {
		if rows[i].claimed && !rows[i].watched && rows[i].single == next {
			return i
		}
	}
	return -1
}

// countWatched counts the rows on the watched side of the progress
// partition.
func countWatched(rows []file) int {
	watched := 0
	for i := range rows {
		if rows[i].watched {
			watched++
		}
	}
	return watched
}

// assembleResult publishes the decision after reconciliation: the exact-next
// selection plus its reason, basis, partition counts, and diagnostics.
func assembleResult(req Request, rows []file, byName []int, winner, next int, hasNext bool, watched int) Result {
	return Result{
		Next:        selectionOf(rows, winner),
		Reason:      reasonOf(rows, winner, next, hasNext, req.Context),
		Basis:       basisOf(rows, winner),
		Watched:     watched,
		Pending:     len(rows) - watched,
		Diagnostics: diagnosticsOf(req, rows, byName, winner),
	}
}

// expectedAgrees reports that no usable expected-next contradicts progress+1.
func expectedAgrees(c Context, progress int) bool {
	e, ok := usableExpected(c)
	return !ok || e == progress+1
}

// watchedPrefixComplete reports that watched files account for every ordinal
// 1..progress exactly once.
func watchedPrefixComplete(rows []file, progress int) bool {
	seen := map[int]bool{}
	count := 0
	for i := range rows {
		if !rows[i].watched || !rows[i].claimed {
			continue
		}
		count++
		seen[rows[i].single] = true
	}
	if count != progress || len(seen) != progress {
		return false
	}
	for o := 1; o <= progress; o++ {
		if !seen[o] {
			return false
		}
	}
	return true
}

// selectionOf returns the decided selection, or nil when abstaining.
func selectionOf(rows []file, winner int) *Selection {
	if winner < 0 {
		return nil
	}
	return &Selection{Episode: rows[winner].single, Basename: rows[winner].entry.Basename}
}

// basisOf returns the winner's basis, or none when abstaining.
func basisOf(rows []file, winner int) Basis {
	if winner < 0 {
		return BasisNone
	}
	return rows[winner].basis
}

// reasonOf renders the one short human sentence for the interface.
func reasonOf(rows []file, winner, next int, hasNext bool, c Context) string {
	if winner >= 0 {
		switch rows[winner].basis {
		case BasisElimination:
			return fmt.Sprintf("Selected episode %d (%s) by elimination of the only unnumbered pending file.",
				rows[winner].single, rows[winner].entry.Basename)
		case BasisChronology:
			return fmt.Sprintf("Selected episode %d (%s) by pending file order.",
				rows[winner].single, rows[winner].entry.Basename)
		default:
			return fmt.Sprintf("Selected episode %d (%s) by clear file number.",
				rows[winner].single, rows[winner].entry.Basename)
		}
	}
	if !hasNext {
		if fractionalProgress(c) {
			return "No selection: fractional progress never resolves to an episode."
		}
		return "No selection: no usable next context."
	}
	for i := range rows {
		if rows[i].claimed && rows[i].watched && rows[i].single == next {
			return fmt.Sprintf("No selection: episode %d is already watched.", next)
		}
	}
	return fmt.Sprintf("No selection: episode %d has no accepted file.", next)
}

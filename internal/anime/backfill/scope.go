package backfill

import "slices"

// Scope names the anime one pass covers: every active anime, or only the listed ones.
type Scope struct {
	all bool
	ids []string
}

// All is the scope of every active anime, the one process start uses.
func All() Scope { return Scope{all: true} }

// Only is the scope of the listed anime. Listing none names nothing to do.
func Only(ids ...string) Scope { return Scope{ids: slices.Clone(ids)} }

// Merge returns the scope covering both s and other. "Every active anime" absorbs any list, so
// a queued repeat never narrows what was asked for.
func (s Scope) Merge(other Scope) Scope {
	if s.all || other.all {
		return All()
	}
	// A repeated id is harmless: Includes only asks whether it is listed.
	return Scope{ids: slices.Concat(s.ids, other.ids)}
}

// Includes reports whether the anime with this id is in the scope.
func (s Scope) Includes(id string) bool {
	return s.all || slices.Contains(s.ids, id)
}

// empty reports whether the scope names no anime at all.
func (s Scope) empty() bool {
	return !s.all && len(s.ids) == 0
}

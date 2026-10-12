package identity

import (
	"math/big"
	"sort"
)

// stamp is one file's exact timestamps; nil means unavailable, never zero.
type stamp struct {
	birth *big.Int
	mtime *big.Int
}

// parseNs parses decimal nanoseconds. Empty, malformed, or negative readings
// are unavailable, never zero-filled and never a crash.
func parseNs(s string) (*big.Int, bool) {
	if s == "" {
		return nil, false
	}
	v, ok := new(big.Int).SetString(s, 10)
	if !ok || v.Sign() < 0 {
		return nil, false
	}
	return v, true
}

// chronologyOrder returns the file positions earliest-first when every birth
// is present and distinct, every mtime is present, and modification order
// agrees with creation order. Ties, unknowns, or any inverted pair yield
// false: no lexical winner is manufactured. Comparison is exact big-integer.
func chronologyOrder(files []stamp) ([]int, bool) {
	if len(files) < 2 {
		return nil, false
	}
	for _, f := range files {
		if f.birth == nil || f.mtime == nil {
			return nil, false
		}
	}
	order := make([]int, len(files))
	for i := range order {
		order[i] = i
	}
	sort.Slice(order, func(a, b int) bool {
		return files[order[a]].birth.Cmp(files[order[b]].birth) < 0
	})
	for i := 1; i < len(order); i++ {
		if files[order[i]].birth.Cmp(files[order[i-1]].birth) == 0 {
			return nil, false
		}
		if files[order[i]].mtime.Cmp(files[order[i-1]].mtime) <= 0 {
			return nil, false
		}
	}
	return order, true
}

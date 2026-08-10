package mutation

import (
	"fmt"
	"go/ast"
	"go/token"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"

	"github.com/gtramontina/ooze/viruses"
)

// OffsetRange is a half-open [Start, End) byte range within a source file.
type OffsetRange struct {
	Start int
	End   int
}

// OffsetRanges is the set of byte ranges a mutation run is scoped to. The
// wrapper derives it from the staged diff, so it names the bytes this change
// actually touched.
//
// Ranges from every staged file are UNIONED into one set, because the seam ooze
// offers -- `Virus.Incubate(node ast.Node)` -- hands over a node and nothing
// else: there is no way to tell which file the node came from. The union is
// therefore an over-approximation whenever more than one file is staged: a node
// in file A may fall inside a range that belongs to file B and survive the
// filter. That direction is deliberate. Over-approximating keeps mutants that
// could have been dropped, which costs time; under-approximating would drop
// mutants that should have run, which costs truth.
type OffsetRanges []OffsetRange

// Contains reports whether offset falls inside any range, start-inclusive and
// end-exclusive.
func (r OffsetRanges) Contains(offset int) bool {
	index := sort.Search(len(r), func(i int) bool { return r[i].End > offset })
	return index < len(r) && offset >= r[index].Start
}

// ParseOffsetRanges decodes the `start-end,start-end` form the wrapper passes
// through the environment. Empty input is NOT an error: it means "no scope
// known", which the filter treats as "mutate everything".
func ParseOffsetRanges(encoded string) (OffsetRanges, error) {
	encoded = strings.TrimSpace(encoded)
	if encoded == "" {
		return nil, nil
	}

	parts := strings.Split(encoded, ",")
	ranges := make(OffsetRanges, 0, len(parts))
	for _, part := range parts {
		start, end, found := strings.Cut(strings.TrimSpace(part), "-")
		if !found {
			return nil, fmt.Errorf("offset range %q is not in start-end form", part)
		}
		startOffset, err := strconv.Atoi(start)
		if err != nil {
			return nil, fmt.Errorf("offset range %q has a non-numeric start: %w", part, err)
		}
		endOffset, err := strconv.Atoi(end)
		if err != nil {
			return nil, fmt.Errorf("offset range %q has a non-numeric end: %w", part, err)
		}
		if endOffset <= startOffset {
			return nil, fmt.Errorf("offset range %q ends at or before it starts", part)
		}
		ranges = append(ranges, OffsetRange{Start: startOffset, End: endOffset})
	}

	sort.Slice(ranges, func(i, j int) bool { return ranges[i].End < ranges[j].End })
	return ranges, nil
}

// ScopeCounter tallies the filter's decisions so a run can prove it actually
// mutated something. A scope that drops every mutant produces a flawless report
// over an empty run, which is indistinguishable from success unless someone
// counts -- the same silent-no-op shape as the ignore-pattern separator bug.
type ScopeCounter struct {
	kept    atomic.Int64
	dropped atomic.Int64
}

// Kept returns how many nodes the filter passed through.
func (c *ScopeCounter) Kept() int { return int(c.kept.Load()) }

// Dropped returns how many nodes the filter rejected as out of scope.
func (c *ScopeCounter) Dropped() int { return int(c.dropped.Load()) }

// lineScoped wraps a Virus and withholds every node outside the staged byte
// ranges, which is how a whole-file mutator is turned into a changed-lines one.
type lineScoped struct {
	inner   viruses.Virus
	ranges  OffsetRanges
	counter *ScopeCounter
}

// NewLineScoped returns inner, restricted to nodes inside ranges. An empty
// ranges set disables the restriction entirely rather than silencing the run.
func NewLineScoped(inner viruses.Virus, ranges OffsetRanges, counter *ScopeCounter) viruses.Virus {
	return &lineScoped{inner: inner, ranges: ranges, counter: counter}
}

// Incubate delegates to the wrapped virus only for in-scope nodes.
//
// The offset arithmetic relies on ooze parsing each source file with a fresh
// single-file token.FileSet (internal/gosourcefile), which puts the file's base
// at 1 and makes `int(node.Pos()) - 1` a plain byte offset.
// TestPositionMinusOneIsTheByteOffsetUnderAFreshFileSet pins the stdlib half of
// that; the ooze half is an upstream implementation detail, which is why the
// harness refuses a run that filtered everything away.
func (v *lineScoped) Incubate(node ast.Node) []*viruses.Infection {
	if len(v.ranges) == 0 {
		return v.inner.Incubate(node)
	}
	// An unpositioned node is unknown scope, not out of scope.
	if node.Pos() == token.NoPos {
		return v.inner.Incubate(node)
	}

	if !v.ranges.Contains(int(node.Pos()) - 1) {
		v.counter.dropped.Add(1)
		return nil
	}

	v.counter.kept.Add(1)
	return v.inner.Incubate(node)
}

// ScopeAll restricts every virus in the set to the same byte ranges, sharing one
// counter so the totals describe the run rather than a single mutator.
func ScopeAll(all []viruses.Virus, ranges OffsetRanges, counter *ScopeCounter) []viruses.Virus {
	scoped := make([]viruses.Virus, 0, len(all))
	for _, virus := range all {
		scoped = append(scoped, NewLineScoped(virus, ranges, counter))
	}
	return scoped
}

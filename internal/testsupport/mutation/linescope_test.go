package mutation

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
	"testing"

	"github.com/gtramontina/ooze/viruses"
)

// alwaysInfects is a Virus stand-in that yields one infection for every node it
// is handed, and records how many times it was consulted. A dropped node must
// never reach it -- filtering that still pays the inner virus buys nothing.
type alwaysInfects struct {
	calls int
}

func (v *alwaysInfects) Incubate(ast.Node) []*viruses.Infection {
	v.calls++
	return []*viruses.Infection{viruses.NewInfection("test", func() {}, func() {})}
}

// nodeAtOffset returns an ast.Node whose Pos() corresponds to the given byte
// offset under ooze's parsing scheme (a fresh single-file FileSet).
func nodeAtOffset(t *testing.T, offset int) ast.Node {
	t.Helper()
	return &ast.Ident{NamePos: token.Pos(offset + 1)}
}

// This pins the arithmetic the whole filter rests on: ooze parses each source
// file with a FRESH token.FileSet holding exactly that one file, so the file's
// base is 1 and `int(node.Pos()) - 1` is a plain byte offset into the content.
// If a future ooze shares one FileSet across files, this assumption breaks and
// the filter silently scopes to the wrong bytes.
func TestPositionMinusOneIsTheByteOffsetUnderAFreshFileSet(t *testing.T) {
	t.Parallel()

	source := "package p\n\nvar answer = 42\n"
	fileSet := token.NewFileSet()
	tree, err := parser.ParseFile(fileSet, "sample.go", source, parser.ParseComments|parser.AllErrors)
	if err != nil {
		t.Fatalf("parse sample: %v", err)
	}

	var found ast.Node
	ast.Inspect(tree, func(node ast.Node) bool {
		if lit, ok := node.(*ast.BasicLit); ok && lit.Value == "42" {
			found = lit
		}
		return true
	})
	if found == nil {
		t.Fatal("expected to find the 42 literal")
	}

	wantOffset := strings.Index(source, "42")
	if got := int(found.Pos()) - 1; got != wantOffset {
		t.Fatalf("offset from Pos() = %d, want %d", got, wantOffset)
	}
}

func TestOffsetRangesContainsIsStartInclusiveAndEndExclusive(t *testing.T) {
	t.Parallel()

	ranges := OffsetRanges{{Start: 10, End: 20}, {Start: 40, End: 45}}

	for _, test := range []struct {
		offset int
		want   bool
	}{
		{9, false}, {10, true}, {19, true}, {20, false},
		{30, false}, {40, true}, {44, true}, {45, false},
	} {
		if got := ranges.Contains(test.offset); got != test.want {
			t.Fatalf("Contains(%d) = %v, want %v", test.offset, got, test.want)
		}
	}
}

func TestParseOffsetRangesDecodesTheEncodedForm(t *testing.T) {
	t.Parallel()

	ranges, err := ParseOffsetRanges("10-20,40-45")
	if err != nil {
		t.Fatalf("ParseOffsetRanges: %v", err)
	}
	if len(ranges) != 2 {
		t.Fatalf("expected 2 ranges, got %d", len(ranges))
	}
	if ranges[0] != (OffsetRange{Start: 10, End: 20}) || ranges[1] != (OffsetRange{Start: 40, End: 45}) {
		t.Fatalf("unexpected ranges: %#v", ranges)
	}
}

func TestParseOffsetRangesRejectsMalformedInput(t *testing.T) {
	t.Parallel()

	for _, encoded := range []string{"10", "10-", "-20", "a-b", "20-10", "10-20,oops"} {
		if _, err := ParseOffsetRanges(encoded); err == nil {
			t.Fatalf("expected %q to be rejected", encoded)
		}
	}
}

func TestParseOffsetRangesTreatsEmptyInputAsNoScope(t *testing.T) {
	t.Parallel()

	ranges, err := ParseOffsetRanges("")
	if err != nil {
		t.Fatalf("empty input must not be an error: %v", err)
	}
	if len(ranges) != 0 {
		t.Fatalf("expected no ranges, got %#v", ranges)
	}
}

func TestLineScopedDelegatesNodesInsideTheScope(t *testing.T) {
	t.Parallel()

	inner := &alwaysInfects{}
	counter := &ScopeCounter{}
	scoped := NewLineScoped(inner, OffsetRanges{{Start: 100, End: 200}}, counter)

	infections := scoped.Incubate(nodeAtOffset(t, 150))

	if len(infections) != 1 {
		t.Fatalf("expected the inner infection to pass through, got %d", len(infections))
	}
	if inner.calls != 1 {
		t.Fatalf("expected the inner virus to be consulted once, got %d", inner.calls)
	}
	if counter.Kept() != 1 || counter.Dropped() != 0 {
		t.Fatalf("counter = kept %d / dropped %d, want 1/0", counter.Kept(), counter.Dropped())
	}
}

func TestLineScopedDropsNodesOutsideTheScopeWithoutConsultingInner(t *testing.T) {
	t.Parallel()

	inner := &alwaysInfects{}
	counter := &ScopeCounter{}
	scoped := NewLineScoped(inner, OffsetRanges{{Start: 100, End: 200}}, counter)

	if infections := scoped.Incubate(nodeAtOffset(t, 250)); len(infections) != 0 {
		t.Fatalf("expected no infections outside the scope, got %d", len(infections))
	}
	if inner.calls != 0 {
		t.Fatalf("a dropped node must not reach the inner virus, got %d calls", inner.calls)
	}
	if counter.Kept() != 0 || counter.Dropped() != 1 {
		t.Fatalf("counter = kept %d / dropped %d, want 0/1", counter.Kept(), counter.Dropped())
	}
}

// Fail OPEN, never closed. An empty scope means the wrapper could not work out
// which bytes changed, and mutating the whole file is the conservative answer.
// Filtering everything out would report a flawless run that tested nothing --
// the same silent-no-op failure the ignore-pattern separator bug once produced.
func TestLineScopedWithoutRangesMutatesEverything(t *testing.T) {
	t.Parallel()

	inner := &alwaysInfects{}
	scoped := NewLineScoped(inner, nil, &ScopeCounter{})

	if infections := scoped.Incubate(nodeAtOffset(t, 999999)); len(infections) != 1 {
		t.Fatalf("an empty scope must mutate everything, got %d infections", len(infections))
	}
}

// ast.Inspect calls its visitor with a nil node after every subtree, so ooze
// hands one to every virus roughly as often as it hands a real one. Calling
// Pos() on it panics -- and the first version of this filter did, which made
// ooze report a flawless zero-mutant run instead of crashing. Nothing in the
// unit tests reached it, because every test built a node.
func TestLineScopedSurvivesTheNilNodeAstInspectSends(t *testing.T) {
	t.Parallel()

	inner := &alwaysInfects{}
	scoped := NewLineScoped(inner, OffsetRanges{{Start: 100, End: 200}}, &ScopeCounter{})

	var node ast.Node
	if infections := scoped.Incubate(node); len(infections) != 1 {
		t.Fatalf("a nil node must pass through to the inner virus, got %d infections", len(infections))
	}
}

// A node ooze cannot position (Pos() == token.NoPos) must not be silently
// dropped: an unpositioned node is unknown scope, not out-of-scope.
func TestLineScopedKeepsUnpositionedNodes(t *testing.T) {
	t.Parallel()

	inner := &alwaysInfects{}
	scoped := NewLineScoped(inner, OffsetRanges{{Start: 100, End: 200}}, &ScopeCounter{})

	if infections := scoped.Incubate(&ast.Ident{NamePos: token.NoPos}); len(infections) != 1 {
		t.Fatalf("an unpositioned node must be kept, got %d infections", len(infections))
	}
}

func TestScopeAllWrapsEveryVirusItIsGiven(t *testing.T) {
	t.Parallel()

	first, second := &alwaysInfects{}, &alwaysInfects{}
	counter := &ScopeCounter{}

	wrapped := ScopeAll([]viruses.Virus{first, second}, OffsetRanges{{Start: 100, End: 200}}, counter)

	if len(wrapped) != 2 {
		t.Fatalf("expected 2 wrapped viruses, got %d", len(wrapped))
	}
	for i, virus := range wrapped {
		if infections := virus.Incubate(nodeAtOffset(t, 250)); len(infections) != 0 {
			t.Fatalf("wrapped virus %d did not filter, got %d infections", i, len(infections))
		}
	}
	if first.calls != 0 || second.calls != 0 {
		t.Fatalf("no inner virus should have been consulted, got %d/%d", first.calls, second.calls)
	}
}

package main

import (
	"reflect"
	"testing"
)

const modifiedFileDiff = `diff --git a/internal/pkg/thing.go b/internal/pkg/thing.go
index 1111111..2222222 100644
--- a/internal/pkg/thing.go
+++ b/internal/pkg/thing.go
@@ -3,0 +4,2 @@ package pkg
+// added
+var added = 1
@@ -20,1 +22,1 @@ func other() {
-	old := 1
+	replaced := 2
`

const newFileDiff = `diff --git a/internal/pkg/fresh.go b/internal/pkg/fresh.go
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/internal/pkg/fresh.go
@@ -0,0 +1,3 @@
+package pkg
+
+var fresh = 1
`

const pureDeletionDiff = `diff --git a/internal/pkg/thing.go b/internal/pkg/thing.go
index 1111111..2222222 100644
--- a/internal/pkg/thing.go
+++ b/internal/pkg/thing.go
@@ -9,2 +8,0 @@ func gone() {
-	removed := 1
-	_ = removed
`

func TestParseChangedLineRangesReadsEveryHunkOfEveryFile(t *testing.T) {
	t.Parallel()

	changed, err := parseChangedLineRanges(modifiedFileDiff + newFileDiff)
	if err != nil {
		t.Fatalf("parseChangedLineRanges: %v", err)
	}

	want := map[string][]lineRange{
		"internal/pkg/thing.go": {{first: 4, last: 5}, {first: 22, last: 22}},
		"internal/pkg/fresh.go": {{first: 1, last: 3}},
	}
	if !reflect.DeepEqual(changed, want) {
		t.Fatalf("changed = %#v, want %#v", changed, want)
	}
}

// A hunk with no added lines still gets a one-line neighbourhood. The deleted
// code cannot be mutated -- it is gone -- but the join it leaves behind is
// changed code, and scoping it out would be the unsafe direction.
func TestParseChangedLineRangesGivesPureDeletionsANeighbourhood(t *testing.T) {
	t.Parallel()

	changed, err := parseChangedLineRanges(pureDeletionDiff)
	if err != nil {
		t.Fatalf("parseChangedLineRanges: %v", err)
	}

	want := map[string][]lineRange{"internal/pkg/thing.go": {{first: 8, last: 9}}}
	if !reflect.DeepEqual(changed, want) {
		t.Fatalf("changed = %#v, want %#v", changed, want)
	}
}

func TestParseChangedLineRangesDefaultsAnOmittedCountToOneLine(t *testing.T) {
	t.Parallel()

	changed, err := parseChangedLineRanges("+++ b/a.go\n@@ -5 +7 @@\n-x\n+y\n")
	if err != nil {
		t.Fatalf("parseChangedLineRanges: %v", err)
	}

	want := map[string][]lineRange{"a.go": {{first: 7, last: 7}}}
	if !reflect.DeepEqual(changed, want) {
		t.Fatalf("changed = %#v, want %#v", changed, want)
	}
}

func TestParseChangedLineRangesRejectsAHunkWithNoFile(t *testing.T) {
	t.Parallel()

	if _, err := parseChangedLineRanges("@@ -1,1 +1,1 @@\n"); err == nil {
		t.Fatal("expected a hunk before any +++ header to be rejected")
	}
}

func TestLineRangesToOffsetsSpansWholeLinesIncludingTheirNewline(t *testing.T) {
	t.Parallel()

	// line 1 = "package p\n"  (offsets 0..9)
	// line 2 = "\n"           (offset 10)
	// line 3 = "var a = 1\n"  (offsets 11..20)
	content := []byte("package p\n\nvar a = 1\n")

	offsets := lineRangesToOffsets(content, []lineRange{{first: 3, last: 3}})

	if len(offsets) != 1 {
		t.Fatalf("expected 1 offset range, got %#v", offsets)
	}
	if offsets[0].start != 11 || offsets[0].end != 21 {
		t.Fatalf("offsets = %#v, want start 11 end 21", offsets[0])
	}
}

func TestLineRangesToOffsetsClampsRangesPastTheEndOfFile(t *testing.T) {
	t.Parallel()

	content := []byte("package p\n")

	offsets := lineRangesToOffsets(content, []lineRange{{first: 1, last: 99}})

	if len(offsets) != 1 || offsets[0].start != 0 || offsets[0].end != len(content) {
		t.Fatalf("offsets = %#v, want the whole file", offsets)
	}
}

func TestLineRangesToOffsetsDropsRangesEntirelyPastTheEndOfFile(t *testing.T) {
	t.Parallel()

	if offsets := lineRangesToOffsets([]byte("package p\n"), []lineRange{{first: 50, last: 60}}); len(offsets) != 0 {
		t.Fatalf("expected no offsets, got %#v", offsets)
	}
}

func TestMergeOffsetRangesCollapsesOverlappingAndAdjacentSpans(t *testing.T) {
	t.Parallel()

	merged := mergeOffsetRanges([]offsetRange{
		{start: 40, end: 50},
		{start: 0, end: 10},
		{start: 8, end: 20},
		{start: 20, end: 30},
	})

	want := []offsetRange{{start: 0, end: 30}, {start: 40, end: 50}}
	if !reflect.DeepEqual(merged, want) {
		t.Fatalf("merged = %#v, want %#v", merged, want)
	}
}

func TestEncodeOffsetRangesRendersTheEnvironmentForm(t *testing.T) {
	t.Parallel()

	if got := encodeOffsetRanges([]offsetRange{{start: 0, end: 30}, {start: 40, end: 50}}); got != "0-30,40-50" {
		t.Fatalf("encoded = %q, want \"0-30,40-50\"", got)
	}
}

func TestEncodeOffsetRangesRendersNothingForAnEmptySet(t *testing.T) {
	t.Parallel()

	if got := encodeOffsetRanges(nil); got != "" {
		t.Fatalf("encoded = %q, want empty", got)
	}
}

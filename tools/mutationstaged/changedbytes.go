package main

import (
	"bytes"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// hunkHeaderPattern matches the new-file side of a unified-diff hunk header:
// `@@ -old,count +new,count @@`. The count is optional and defaults to 1.
var hunkHeaderPattern = regexp.MustCompile(`^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@`)

// lineRange is an inclusive 1-based line span within a file.
type lineRange struct {
	first int
	last  int
}

// offsetRange is a half-open [start, end) byte span within a file.
type offsetRange struct {
	start int
	end   int
}

// parseChangedLineRanges reads `git diff --cached -U0` output and returns, per
// repository-relative path, the line spans the staged change touches on the NEW
// side of the diff. Only the new side matters: the old side names bytes that no
// longer exist and therefore cannot be mutated.
func parseChangedLineRanges(diff string) (map[string][]lineRange, error) {
	changed := map[string][]lineRange{}
	currentFile := ""

	for line := range strings.SplitSeq(diff, "\n") {
		if header, isFileHeader := strings.CutPrefix(line, "+++ "); isFileHeader {
			currentFile = strings.TrimPrefix(strings.TrimSpace(header), "b/")
			continue
		}

		span, isHunk, err := parseHunkNewSide(line)
		if err != nil {
			return nil, err
		}
		if !isHunk {
			continue
		}
		if currentFile == "" || currentFile == "/dev/null" {
			return nil, fmt.Errorf("hunk header %q appeared before any +++ file header", line)
		}

		changed[currentFile] = append(changed[currentFile], span)
	}

	return changed, nil
}

// parseHunkNewSide extracts the new-side line span from one unified-diff hunk
// header. A line that is not a hunk header reports isHunk false rather than an
// error, since diff bodies are full of lines this must simply walk past.
func parseHunkNewSide(line string) (span lineRange, isHunk bool, err error) {
	matches := hunkHeaderPattern.FindStringSubmatch(line)
	if matches == nil {
		return lineRange{}, false, nil
	}

	start, err := strconv.Atoi(matches[1])
	if err != nil {
		return lineRange{}, false, fmt.Errorf("hunk header %q has a non-numeric start: %w", line, err)
	}

	count := 1
	if matches[2] != "" {
		if count, err = strconv.Atoi(matches[2]); err != nil {
			return lineRange{}, false, fmt.Errorf("hunk header %q has a non-numeric count: %w", line, err)
		}
	}

	return newSideRange(start, count), true, nil
}

// newSideRange converts a hunk's new-side start and count into an inclusive line
// span. A zero count is a pure deletion, which occupies no line of the new file;
// it still gets the one-line neighbourhood around the join, because scoping a
// deletion's surroundings out is the unsafe direction.
func newSideRange(start, count int) lineRange {
	if count == 0 {
		return lineRange{first: max(start, 1), last: start + 1}
	}
	return lineRange{first: start, last: start + count - 1}
}

// lineRangesToOffsets converts inclusive line spans into half-open byte spans
// over content. A span reaching past the end of the file is clamped to it, and
// one starting past the end contributes nothing.
func lineRangesToOffsets(content []byte, ranges []lineRange) []offsetRange {
	lineStarts := lineStartOffsets(content)

	offsets := make([]offsetRange, 0, len(ranges))
	for _, r := range ranges {
		if r.first > len(lineStarts) {
			continue
		}
		start := lineStarts[max(r.first, 1)-1]
		end := len(content)
		if r.last < len(lineStarts) {
			end = lineStarts[r.last]
		}
		if end > start {
			offsets = append(offsets, offsetRange{start: start, end: end})
		}
	}
	return offsets
}

// lineStartOffsets returns the byte offset each 1-based line begins at.
func lineStartOffsets(content []byte) []int {
	starts := []int{0}
	for index, b := range content {
		if b == '\n' && index+1 < len(content) {
			starts = append(starts, index+1)
		}
	}
	return starts
}

// mergeOffsetRanges sorts and collapses overlapping or touching spans, so the
// filter's lookup stays a clean binary search over disjoint ranges.
func mergeOffsetRanges(ranges []offsetRange) []offsetRange {
	if len(ranges) == 0 {
		return nil
	}

	sorted := append([]offsetRange(nil), ranges...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].start != sorted[j].start {
			return sorted[i].start < sorted[j].start
		}
		return sorted[i].end < sorted[j].end
	})

	merged := []offsetRange{sorted[0]}
	for _, next := range sorted[1:] {
		last := &merged[len(merged)-1]
		if next.start <= last.end {
			if next.end > last.end {
				last.end = next.end
			}
			continue
		}
		merged = append(merged, next)
	}
	return merged
}

// encodeOffsetRanges renders the spans in the `start-end,start-end` form the
// harness decodes from the environment.
func encodeOffsetRanges(ranges []offsetRange) string {
	if len(ranges) == 0 {
		return ""
	}

	var encoded bytes.Buffer
	for index, r := range ranges {
		if index > 0 {
			encoded.WriteByte(',')
		}
		encoded.WriteString(strconv.Itoa(r.start))
		encoded.WriteByte('-')
		encoded.WriteString(strconv.Itoa(r.end))
	}
	return encoded.String()
}

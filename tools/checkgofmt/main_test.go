package main

import (
	"strings"
	"testing"
)

// joinLength is the characters one batch would put on a command line.
func joinLength(batch []string) int {
	size := 0
	for _, file := range batch {
		size += len(file) + 1
	}
	return size
}

func TestBatchesKeepsEveryGroupUnderTheLimit(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name  string
		files []string
		limit int
		want  int
	}{
		{name: "no files means no groups", files: nil, limit: 100, want: 0},
		{name: "one small file is one group", files: []string{"a.go"}, limit: 100, want: 1},
		{name: "files that fit stay together", files: []string{"a.go", "b.go", "c.go"}, limit: 100, want: 1},
		{name: "files that fit exactly stay together", files: []string{"aaaa.go", "bbbb.go", "cccc.go", "dddd.go"},
			limit: 16, want: 2},
		{name: "files one character over the limit are all split", files: []string{"aaaa.go", "bbbb.go", "cccc.go", "dddd.go"},
			limit: 15, want: 4},
		{name: "a file longer than the limit still gets its own group", files: []string{"a-very-long-name.go"},
			limit: 4, want: 1},
		{name: "a long file does not swallow the next one", files: []string{"a-very-long-name.go", "b.go"},
			limit: 4, want: 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := batches(tc.files, tc.limit)
			if len(got) != tc.want {
				t.Fatalf("want %d groups, got %d (%v)", tc.want, len(got), got)
			}

			// Every file is checked exactly once, in order, and no group but a single oversized file
			// may exceed the limit.
			var flat []string
			for _, group := range got {
				if len(group) > 1 && joinLength(group) > tc.limit {
					t.Errorf("group %v is %d characters, over the %d limit", group, joinLength(group), tc.limit)
				}
				flat = append(flat, group...)
			}
			if strings.Join(flat, ",") != strings.Join(tc.files, ",") {
				t.Errorf("the split lost or reordered files: want %v, got %v", tc.files, flat)
			}
		})
	}
}

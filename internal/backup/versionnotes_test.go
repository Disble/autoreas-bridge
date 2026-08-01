package backup

import (
	"reflect"
	"testing"
)

func TestVersionNotesSinceReturnsNotesInAscendingOrder(t *testing.T) {
	t.Parallel()

	notes := map[int][]string{
		3: {"v3 note"},
		2: {"v2 note"},
	}

	got := versionNotesSince(notes, 1, 3)
	want := []string{"v2 note", "v3 note"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected ascending-order notes %v, got %v", want, got)
	}
}

func TestVersionNotesSinceExcludesTheBundlesOwnVersion(t *testing.T) {
	t.Parallel()

	notes := map[int][]string{
		1: {"v1 note"},
		2: {"v2 note"},
	}

	got := versionNotesSince(notes, 1, 2)
	for _, n := range got {
		if n == "v1 note" {
			t.Fatalf("expected the bundle's own version note excluded, got %v", got)
		}
	}
	want := []string{"v2 note"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected only the newer version's note %v, got %v", want, got)
	}
}

func TestVersionNotesSinceIgnoresVersionsAboveSupported(t *testing.T) {
	t.Parallel()

	notes := map[int][]string{
		2: {"v2 note"},
		3: {"v3 note (not yet supported)"},
	}

	got := versionNotesSince(notes, 1, 2)
	want := []string{"v2 note"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected notes bounded by supported version %v, got %v", want, got)
	}
}

func TestVersionNotesSinceReturnsNilWhenBundleIsCurrent(t *testing.T) {
	t.Parallel()

	notes := map[int][]string{
		1: {"v1 note"},
	}

	got := versionNotesSince(notes, 1, 1)
	if len(got) != 0 {
		t.Fatalf("expected no notes for a bundle already at the supported version, got %v", got)
	}
}

func TestVersionNotesSinceMultipleNotesPerVersionPreserveOrder(t *testing.T) {
	t.Parallel()

	notes := map[int][]string{
		2: {"first", "second"},
	}

	got := versionNotesSince(notes, 1, 2)
	want := []string{"first", "second"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected notes within a version preserved in slice order %v, got %v", want, got)
	}
}

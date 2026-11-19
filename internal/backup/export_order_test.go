package backup

import (
	"archive/zip"
	"context"
	"path/filepath"
	"testing"
)

// TestExportWritesGroupsInSliceOrderWithTheirCountsThenTheManifestLast exports
// three groups and checks they run in slice order, each gets one data entry,
// the manifest lists them in that order with each reported count, and the
// manifest is the last zip entry.
func TestExportWritesGroupsInSliceOrderWithTheirCountsThenTheManifestLast(t *testing.T) {
	t.Parallel()

	var calls []string
	groups := []Group{
		fakeGroup("anime_snapshots", `{"a":1}`+"\n"+`{"a":2}`+"\n"+`{"a":3}`+"\n", 3, &calls),
		fakeGroup("seasons", `{"b":1}`+"\n", 1, &calls),
		fakeGroup("season_animes", `{"c":1}`+"\n", 1, &calls),
	}
	dest := filepath.Join(t.TempDir(), "bundle.zip")
	if err := Export(context.Background(), dest, "dev", groups); err != nil {
		t.Fatalf("Export: %v", err)
	}

	want := []string{"anime_snapshots", "seasons", "season_animes"}
	if len(calls) != len(want) {
		t.Fatalf("expected %d calls, got %d: %v", len(want), len(calls), calls)
	}
	for i := range want {
		if calls[i] != want[i] {
			t.Fatalf("expected call order %v, got %v", want, calls)
		}
	}
	assertManifestContexts(t, dest, want, []int{3, 1, 1})
	assertOneDataEntryPerGroupThenManifest(t, dest, want)
}

// assertManifestContexts checks the manifest lists the groups in order with their reported counts.
func assertManifestContexts(t *testing.T, dest string, names []string, counts []int) {
	t.Helper()

	m, err := ReadManifestFile(dest)
	if err != nil {
		t.Fatalf("ReadManifestFile: %v", err)
	}
	if len(m.Contexts) != len(names) {
		t.Fatalf("expected %d contexts, got %d", len(names), len(m.Contexts))
	}
	for i := range names {
		if m.Contexts[i].Name != names[i] || m.Contexts[i].RecordCount != counts[i] {
			t.Fatalf("contexts[%d] = %s/%d, want %s/%d", i, m.Contexts[i].Name, m.Contexts[i].RecordCount, names[i], counts[i])
		}
	}
}

// assertOneDataEntryPerGroupThenManifest checks the zip holds exactly one data
// entry per group and manifest.json as its single last entry.
func assertOneDataEntryPerGroupThenManifest(t *testing.T, dest string, names []string) {
	t.Helper()

	zr, err := zip.OpenReader(dest)
	if err != nil {
		t.Fatalf("zip.OpenReader: %v", err)
	}
	defer func() { _ = zr.Close() }()

	seen := map[string]int{}
	for _, f := range zr.File {
		seen[f.Name]++
	}
	for _, name := range names {
		if seen["data/"+name+".jsonl"] != 1 {
			t.Fatalf("expected exactly one data entry for %s, got entries %v", name, seen)
		}
	}
	if last := zr.File[len(zr.File)-1].Name; last != "manifest.json" || seen["manifest.json"] != 1 {
		t.Fatalf("expected manifest.json to be the single last entry, last is %q", last)
	}
}

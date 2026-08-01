package backup

import (
	"archive/zip"
	"context"
	"errors"
	"io"
	"path/filepath"
	"testing"
)

// fakeGroup builds a Group whose exportFn writes body and returns count,
// recording its own name into calls each time it runs.
func fakeGroup(name, body string, count int, calls *[]string) Group {
	return Group{
		Name: name,
		Export: func(_ context.Context, w io.Writer) (int, error) {
			*calls = append(*calls, name)
			if _, err := io.WriteString(w, body); err != nil {
				return 0, err
			}
			return count, nil
		},
	}
}

func TestExportIteratesGroupsInSliceOrder(t *testing.T) {
	t.Parallel()

	var calls []string
	groups := []Group{
		fakeGroup("anime_snapshots", `{"a":1}`+"\n", 1, &calls),
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

	m, err := ReadManifestFile(dest)
	if err != nil {
		t.Fatalf("ReadManifestFile: %v", err)
	}
	if len(m.Contexts) != len(want) {
		t.Fatalf("expected %d contexts, got %d", len(want), len(m.Contexts))
	}
	for i := range want {
		if m.Contexts[i].Name != want[i] {
			t.Fatalf("expected contexts[%d].Name == %q, got %q", i, want[i], m.Contexts[i].Name)
		}
	}
}

func TestExportRecordsEachGroupReportedCountInManifest(t *testing.T) {
	t.Parallel()

	var calls []string
	groups := []Group{
		fakeGroup("anime_snapshots", `{"a":1}`+"\n"+`{"a":2}`+"\n"+`{"a":3}`+"\n", 3, &calls),
		fakeGroup("seasons", `{"b":1}`+"\n", 1, &calls),
	}

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	if err := Export(context.Background(), dest, "dev", groups); err != nil {
		t.Fatalf("Export: %v", err)
	}

	m, err := ReadManifestFile(dest)
	if err != nil {
		t.Fatalf("ReadManifestFile: %v", err)
	}
	if m.Contexts[0].RecordCount != 3 {
		t.Fatalf("expected anime_snapshots recordCount 3, got %d", m.Contexts[0].RecordCount)
	}
	if m.Contexts[1].RecordCount != 1 {
		t.Fatalf("expected seasons recordCount 1, got %d", m.Contexts[1].RecordCount)
	}
}

func TestExportCreatesOneDataEntryPerGroup(t *testing.T) {
	t.Parallel()

	var calls []string
	groups := []Group{
		fakeGroup("anime_snapshots", `{"a":1}`+"\n", 1, &calls),
		fakeGroup("seasons", `{"b":1}`+"\n", 1, &calls),
	}

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	if err := Export(context.Background(), dest, "dev", groups); err != nil {
		t.Fatalf("Export: %v", err)
	}

	zr, err := zip.OpenReader(dest)
	if err != nil {
		t.Fatalf("zip.OpenReader: %v", err)
	}
	defer func() { _ = zr.Close() }()

	dataEntries := 0
	for _, f := range zr.File {
		if f.Name == "data/anime_snapshots.jsonl" || f.Name == "data/seasons.jsonl" {
			dataEntries++
		}
	}
	if dataEntries != 2 {
		t.Fatalf("expected exactly 2 data entries, got %d", dataEntries)
	}
}

func TestManifestIsWrittenAfterEveryDataEntry(t *testing.T) {
	t.Parallel()

	var calls []string
	groups := []Group{
		fakeGroup("anime_snapshots", `{"a":1}`+"\n", 1, &calls),
		fakeGroup("seasons", `{"b":1}`+"\n", 1, &calls),
	}

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	if err := Export(context.Background(), dest, "dev", groups); err != nil {
		t.Fatalf("Export: %v", err)
	}

	zr, err := zip.OpenReader(dest)
	if err != nil {
		t.Fatalf("zip.OpenReader: %v", err)
	}
	defer func() { _ = zr.Close() }()

	manifestIndex := -1
	for i, f := range zr.File {
		if f.Name == "manifest.json" {
			manifestIndex = i
		}
	}
	if manifestIndex == -1 {
		t.Fatal("expected manifest.json in the zip, not found")
	}
	for i, f := range zr.File {
		if f.Name == "manifest.json" {
			continue
		}
		if i > manifestIndex {
			t.Fatalf("expected manifest.json to be the last entry, but %q appears after it", f.Name)
		}
	}
}

func TestExportErrorWritesNoManifest(t *testing.T) {
	t.Parallel()

	failingErr := errors.New("boom")
	var calls []string
	groups := []Group{
		fakeGroup("anime_snapshots", `{"a":1}`+"\n", 1, &calls),
		{
			Name: "seasons",
			Export: func(context.Context, io.Writer) (int, error) {
				return 0, failingErr
			},
		},
	}

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	err := Export(context.Background(), dest, "dev", groups)
	if err == nil {
		t.Fatal("expected Export to return an error, got nil")
	}
	if !errors.Is(err, failingErr) {
		t.Fatalf("expected error to wrap the failing group's error, got: %v", err)
	}

	if _, readErr := ReadManifestFile(dest); !errors.Is(readErr, ErrMissingManifest) {
		t.Fatalf("expected ErrMissingManifest after a failed export, got: %v", readErr)
	}
}

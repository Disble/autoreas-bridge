package backup

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// appendGarbageToFile flips a byte in the middle of path's contents,
// simulating a bundle mutated on disk between preview and apply. A byte
// appended past the end-of-central-directory record would not reliably break
// a zip read, so this corrupts bytes inside an existing entry instead.
func appendGarbageToFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if len(data) == 0 {
		return errors.New("empty bundle file")
	}
	mid := len(data) / 2
	data[mid] ^= 0xFF
	return os.WriteFile(path, data, 0o600)
}

// fakeValidate builds a validateFn that records its own invocation into calls
// and returns count, or an error when err is non-nil.
func fakeValidate(name string, count int, err error, calls *[]string) validateFn {
	return func(_ context.Context, r io.Reader) (int, error) {
		*calls = append(*calls, "validate:"+name)
		if _, readErr := io.ReadAll(r); readErr != nil {
			return 0, readErr
		}
		return count, err
	}
}

// fakeImport builds an importFn that records its own invocation into calls
// and returns count, or an error when err is non-nil.
func fakeImport(name string, count int, err error, calls *[]string) importFn {
	return func(_ context.Context, r io.Reader) (int, error) {
		*calls = append(*calls, "import:"+name)
		if _, readErr := io.ReadAll(r); readErr != nil {
			return 0, readErr
		}
		return count, err
	}
}

// buildImportTestBundle writes a bundle carrying exactly the named groups,
// each with a single-line JSONL body, so import_test.go tests do not need to
// duplicate the bundleWriter dance for every scenario.
func buildImportTestBundle(t *testing.T, groupNames ...string) string {
	t.Helper()

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	data := make(map[string]string, len(groupNames))
	for _, name := range groupNames {
		data[name] = `{"id":"1"}` + "\n"
	}
	buildBundle(t, dest, SupportedFormatVersion, data)
	return dest
}

func TestPreviewReportsGroupsCountsAndBundleMetadata(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots", "seasons")

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
		{Name: "seasons", Validate: fakeValidate("seasons", 1, nil, &calls), Import: fakeImport("seasons", 1, nil, &calls)},
		{Name: "season_animes", Validate: fakeValidate("season_animes", 0, nil, &calls), Import: fakeImport("season_animes", 0, nil, &calls)},
	}

	report, err := Preview(context.Background(), dest, groups)
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}
	if report.FormatVersion != SupportedFormatVersion {
		t.Fatalf("unexpected FormatVersion: %d", report.FormatVersion)
	}
	if report.BridgeVersion != "dev" {
		t.Fatalf("unexpected BridgeVersion: %q", report.BridgeVersion)
	}
	if len(report.Groups) != 2 {
		t.Fatalf("expected 2 known+carried groups, got %d: %+v", len(report.Groups), report.Groups)
	}
	if report.Groups[0].Name != "anime_snapshots" || report.Groups[0].RecordCount != 1 {
		t.Fatalf("unexpected first group: %+v", report.Groups[0])
	}
	if report.Groups[1].Name != "seasons" || report.Groups[1].RecordCount != 1 {
		t.Fatalf("unexpected second group: %+v", report.Groups[1])
	}
}

func TestPreviewWritesNothing(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots")

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
	}

	if _, err := Preview(context.Background(), dest, groups); err != nil {
		t.Fatalf("Preview: %v", err)
	}

	for _, c := range calls {
		if strings.HasPrefix(c, "import:") {
			t.Fatalf("expected Preview to never invoke an Import function, but got call %q", c)
		}
	}
}

func TestPreviewFailsOnMalformedRecordBeforeAnyWrite(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "season_animes")

	var calls []string
	failingErr := errors.New("malformed record")
	groups := []ImportGroup{
		{Name: "season_animes", Validate: fakeValidate("season_animes", 0, failingErr, &calls), Import: fakeImport("season_animes", 0, nil, &calls)},
	}

	_, err := Preview(context.Background(), dest, groups)
	if !errors.Is(err, failingErr) {
		t.Fatalf("expected the validate error to propagate, got %v", err)
	}
	for _, c := range calls {
		if strings.HasPrefix(c, "import:") {
			t.Fatal("expected no Import call after a Validate failure")
		}
	}
}

func TestPreviewReportsAbsentGroupsAsUntouched(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots")

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
		{Name: "seasons", Validate: fakeValidate("seasons", 0, nil, &calls), Import: fakeImport("seasons", 0, nil, &calls)},
	}

	report, err := Preview(context.Background(), dest, groups)
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}
	if len(report.AbsentGroups) != 1 || report.AbsentGroups[0] != "seasons" {
		t.Fatalf("expected AbsentGroups == [\"seasons\"], got %v", report.AbsentGroups)
	}
	for _, c := range calls {
		if strings.Contains(c, "seasons") {
			t.Fatalf("expected the absent group's functions to never run, got call %q", c)
		}
	}
}

func TestUnknownGroupIsIgnoredNotFatal(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots", "future_table")

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
	}

	report, err := Preview(context.Background(), dest, groups)
	if err != nil {
		t.Fatalf("expected Preview to succeed with an unknown group present, got %v", err)
	}
	if len(report.UnknownGroups) != 1 || report.UnknownGroups[0] != "future_table" {
		t.Fatalf("expected UnknownGroups == [\"future_table\"], got %v", report.UnknownGroups)
	}
}

func TestPreviewReportsVersionNotesForOlderBundle(t *testing.T) {
	original := versionNotes
	versionNotes = map[int][]string{1: {"seasons gained ordering_draft_json"}}
	t.Cleanup(func() { versionNotes = original })

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	buildBundle(t, dest, 0, map[string]string{"anime_snapshots": `{"id":"1"}` + "\n"})

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
	}

	report, err := Preview(context.Background(), dest, groups)
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}
	if len(report.VersionNotes) != 1 || report.VersionNotes[0] != "seasons gained ordering_draft_json" {
		t.Fatalf("expected the note for version 1 to appear, got %v", report.VersionNotes)
	}
}

func TestApplyIteratesGroupsInSliceOrderNotManifestOrder(t *testing.T) {
	t.Parallel()

	// Manifest lists seasons before anime_snapshots (reverse of the build's
	// import group slice order below).
	dest := filepath.Join(t.TempDir(), "bundle.zip")
	bw, err := newBundleWriter(dest)
	if err != nil {
		t.Fatalf("newBundleWriter: %v", err)
	}
	var contexts []ContextEntry
	contexts = append(contexts, writeDataEntry(t, bw, "seasons", `{"id":"1"}`+"\n"))
	contexts = append(contexts, writeDataEntry(t, bw, "anime_snapshots", `{"id":"1"}`+"\n"))
	if err := bw.writeManifest(Manifest{
		FormatVersion:  SupportedFormatVersion,
		BridgeVersion:  "dev",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		Contexts:       contexts,
		BundleChecksum: computeBundleChecksum(contexts),
	}); err != nil {
		t.Fatalf("writeManifest: %v", err)
	}
	if err := bw.close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
		{Name: "seasons", Validate: fakeValidate("seasons", 1, nil, &calls), Import: fakeImport("seasons", 1, nil, &calls)},
	}

	if _, err := Apply(context.Background(), dest, groups); err != nil {
		t.Fatalf("Apply: %v", err)
	}

	want := []string{"import:anime_snapshots", "import:seasons"}
	var got []string
	for _, c := range calls {
		if strings.HasPrefix(c, "import:") {
			got = append(got, c)
		}
	}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("expected apply order %v (build's slice order), got %v", want, got)
	}
}

func TestAbsentGroupIsLeftUntouched(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots")

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
		{Name: "seasons", Validate: fakeValidate("seasons", 0, nil, &calls), Import: fakeImport("seasons", 0, nil, &calls)},
	}

	if _, err := Apply(context.Background(), dest, groups); err != nil {
		t.Fatalf("Apply: %v", err)
	}

	for _, c := range calls {
		if c == "import:seasons" {
			t.Fatal("expected the absent group's Import to never be invoked -- omission is not deletion")
		}
	}
}

func TestSecondGroupFailureLeavesFirstCommittedAndThirdUnattempted(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots", "seasons", "season_animes")

	var calls []string
	failingErr := errors.New("second group boom")
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
		{Name: "seasons", Validate: fakeValidate("seasons", 1, nil, &calls), Import: fakeImport("seasons", 1, failingErr, &calls)},
		{Name: "season_animes", Validate: fakeValidate("season_animes", 1, nil, &calls), Import: fakeImport("season_animes", 1, nil, &calls)},
	}

	report, err := Apply(context.Background(), dest, groups)
	if err == nil {
		t.Fatal("expected Apply to return the second group's error")
	}
	for _, c := range calls {
		if c == "import:season_animes" {
			t.Fatal("expected the third group's Import to never be invoked after the second group failed")
		}
	}
	if len(report.Imported) != 1 || report.Imported[0].Name != "anime_snapshots" {
		t.Fatalf("expected only anime_snapshots reported as imported, got %+v", report.Imported)
	}
	if report.Failed != "seasons" {
		t.Fatalf("expected Failed == \"seasons\", got %q", report.Failed)
	}
	if len(report.Unattempted) != 1 || report.Unattempted[0] != "season_animes" {
		t.Fatalf("expected Unattempted == [\"season_animes\"], got %v", report.Unattempted)
	}
}

func TestApplyReportNamesImportedFailedAndUnattemptedGroups(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots", "seasons")

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 2, nil, &calls), Import: fakeImport("anime_snapshots", 2, nil, &calls)},
		{Name: "seasons", Validate: fakeValidate("seasons", 3, nil, &calls), Import: fakeImport("seasons", 3, nil, &calls)},
	}

	report, err := Apply(context.Background(), dest, groups)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if report.Failed != "" {
		t.Fatalf("expected no failure, got Failed == %q", report.Failed)
	}
	if len(report.Unattempted) != 0 {
		t.Fatalf("expected no unattempted groups, got %v", report.Unattempted)
	}
	if len(report.Imported) != 2 || report.Imported[0].RecordCount != 2 || report.Imported[1].RecordCount != 3 {
		t.Fatalf("unexpected Imported: %+v", report.Imported)
	}
}

func TestApplyReVerifiesTheBundle(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots")

	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
	}

	// Preview first (this is the normal state-machine path).
	if _, err := Preview(context.Background(), dest, groups); err != nil {
		t.Fatalf("Preview: %v", err)
	}

	// Tamper the bundle on disk between preview and apply.
	if err := appendGarbageToFile(dest); err != nil {
		t.Fatalf("tamper bundle: %v", err)
	}

	if _, err := Apply(context.Background(), dest, groups); err == nil {
		t.Fatal("expected Apply to refuse a bundle tampered after preview")
	}
}

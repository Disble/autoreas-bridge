package backup

import (
	"context"
	"strings"
	"testing"
)

// TestPreviewReportsCarriedAbsentAndUnknownGroupsWithoutWriting previews a
// bundle carrying two known groups and one unknown group against three known
// groups: the report names the bundle metadata, each carried group with its
// count, the absent group whose functions never run, and the ignored unknown
// group, and no Import function is ever invoked.
func TestPreviewReportsCarriedAbsentAndUnknownGroupsWithoutWriting(t *testing.T) {
	t.Parallel()

	dest := buildImportTestBundle(t, "anime_snapshots", "seasons", "future_table")
	var calls []string
	groups := []ImportGroup{
		{Name: "anime_snapshots", Validate: fakeValidate("anime_snapshots", 1, nil, &calls), Import: fakeImport("anime_snapshots", 1, nil, &calls)},
		{Name: "seasons", Validate: fakeValidate("seasons", 1, nil, &calls), Import: fakeImport("seasons", 1, nil, &calls)},
		{Name: "season_animes", Validate: fakeValidate("season_animes", 0, nil, &calls), Import: fakeImport("season_animes", 0, nil, &calls)},
	}

	report, err := Preview(context.Background(), dest, groups)
	if err != nil {
		t.Fatalf("expected Preview to succeed with an unknown group present, got %v", err)
	}
	assertPreviewReportsCarriedAbsentAndUnknownGroups(t, report)
	for _, c := range calls {
		if strings.HasPrefix(c, "import:") || strings.Contains(c, "season_animes") {
			t.Fatalf("expected no Import call and no call for the absent group, got %q", c)
		}
	}
}

// assertPreviewReportsCarriedAbsentAndUnknownGroups checks the report names
// the bundle metadata, the carried anime_snapshots and seasons groups with one
// record each, season_animes as the only absent group, and future_table as the
// only unknown group.
func assertPreviewReportsCarriedAbsentAndUnknownGroups(t *testing.T, report PreviewReport) {
	t.Helper()

	if report.FormatVersion != SupportedFormatVersion || report.BridgeVersion != "dev" {
		t.Fatalf("unexpected bundle metadata: FormatVersion %d, BridgeVersion %q", report.FormatVersion, report.BridgeVersion)
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
	if len(report.AbsentGroups) != 1 || report.AbsentGroups[0] != "season_animes" {
		t.Fatalf("expected AbsentGroups == [\"season_animes\"], got %v", report.AbsentGroups)
	}
	if len(report.UnknownGroups) != 1 || report.UnknownGroups[0] != "future_table" {
		t.Fatalf("expected UnknownGroups == [\"future_table\"], got %v", report.UnknownGroups)
	}
}

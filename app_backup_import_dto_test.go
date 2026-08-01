package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"

	"autoreas-bridge/internal/backup"
)

func TestBackupImportDTOFieldsAreFlatAndEnglishJSONTagged(t *testing.T) {
	t.Run("preview result", func(t *testing.T) {
		assertBackupImportPreviewResultJSONKeys(t)
	})
	t.Run("apply result", func(t *testing.T) {
		assertBackupImportResultJSONKeys(t)
	})
}

// assertBackupImportPreviewResultJSONKeys marshals a fully populated
// BackupImportPreviewResult and asserts every field, including the nested
// group entries, round-trips under its flat English JSON key.
func assertBackupImportPreviewResultJSONKeys(t *testing.T) {
	t.Helper()

	preview := BackupImportPreviewResult{
		BundlePath:     "C:/backups/autoreas-backup-20260731-120000.zip",
		FormatVersion:  backup.SupportedFormatVersion,
		BridgeVersion:  "dev",
		CreatedAt:      "2026-07-31T12:00:00Z",
		BundleChecksum: "deadbeef",
		Groups: []BackupImportGroupResult{
			{Name: "anime_snapshots", RecordCount: 512},
		},
		UnknownGroups: []string{"future_table"},
		AbsentGroups:  []string{"seasons", "season_animes"},
		VersionNotes:  []string{"v2 added foo"},
	}

	raw, err := json.Marshal(preview)
	if err != nil {
		t.Fatalf("marshal BackupImportPreviewResult: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode BackupImportPreviewResult json: %v", err)
	}

	for _, key := range []string{
		"cancelled", "bundlePath", "formatVersion", "bridgeVersion", "createdAt",
		"bundleChecksum", "groups", "unknownGroups", "absentGroups", "versionNotes",
	} {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("expected flat English JSON key %q in %s", key, raw)
		}
	}

	groups, ok := decoded["groups"].([]any)
	if !ok || len(groups) != 1 {
		t.Fatalf("expected 1 group, got %v", decoded["groups"])
	}
	firstGroup, ok := groups[0].(map[string]any)
	if !ok {
		t.Fatalf("expected group entry to be an object, got %T", groups[0])
	}
	for _, key := range []string{"name", "recordCount"} {
		if _, ok := firstGroup[key]; !ok {
			t.Fatalf("expected flat English JSON key %q on group entry, got %v", key, firstGroup)
		}
	}
}

// assertBackupImportResultJSONKeys marshals a fully populated
// BackupImportResult and asserts every field round-trips under its flat
// English JSON key.
func assertBackupImportResultJSONKeys(t *testing.T) {
	t.Helper()

	result := BackupImportResult{
		ImportedGroups: []BackupImportGroupResult{
			{Name: "anime_snapshots", RecordCount: 512},
		},
		FailedGroup:       "seasons",
		UnattemptedGroups: []string{"season_animes"},
		RestorePointPath:  "C:/data/bridge-restore-point-20260731-120000.db",
		ErrorMessage:      "insert record 3: boom",
	}
	rawResult, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal BackupImportResult: %v", err)
	}
	var decodedResult map[string]any
	if err := json.Unmarshal(rawResult, &decodedResult); err != nil {
		t.Fatalf("decode BackupImportResult json: %v", err)
	}
	for _, key := range []string{
		"importedGroups", "failedGroup", "unattemptedGroups", "restorePointPath", "errorMessage",
	} {
		if _, ok := decodedResult[key]; !ok {
			t.Fatalf("expected flat English JSON key %q in %s", key, rawResult)
		}
	}
}

func TestPreviewResultMirrorsPreviewReport(t *testing.T) {
	report := backup.PreviewReport{
		FormatVersion:  backup.SupportedFormatVersion,
		BridgeVersion:  "dev",
		CreatedAt:      "2026-07-31T12:00:00Z",
		BundleChecksum: "deadbeef",
		Groups: []backup.PreviewGroup{
			{Name: "anime_snapshots", RecordCount: 512},
		},
		UnknownGroups: []string{"future_table"},
		AbsentGroups:  []string{"seasons", "season_animes"},
		VersionNotes:  []string{"v2 added foo"},
	}

	result := newBackupImportPreviewResult("C:/backups/dest.zip", report)

	assertPreviewResultScalarFields(t, result, report)
	assertPreviewResultGroupsMatch(t, result.Groups, report.Groups)

	if len(result.UnknownGroups) != 1 || result.UnknownGroups[0] != "future_table" {
		t.Fatalf("expected unknown groups to mirror the report, got %v", result.UnknownGroups)
	}
	if len(result.AbsentGroups) != 2 {
		t.Fatalf("expected absent groups to mirror the report, got %v", result.AbsentGroups)
	}
	if len(result.VersionNotes) != 1 || result.VersionNotes[0] != "v2 added foo" {
		t.Fatalf("expected version notes to mirror the report, got %v", result.VersionNotes)
	}
}

// assertPreviewResultScalarFields checks every non-slice field of a preview
// DTO against the report it was built from.
func assertPreviewResultScalarFields(t *testing.T, result BackupImportPreviewResult, report backup.PreviewReport) {
	t.Helper()

	if result.Cancelled {
		t.Fatalf("expected Cancelled to be false for a produced preview")
	}
	if result.BundlePath != "C:/backups/dest.zip" {
		t.Fatalf("unexpected bundle path: %q", result.BundlePath)
	}
	if result.FormatVersion != report.FormatVersion {
		t.Fatalf("expected FormatVersion %d, got %d", report.FormatVersion, result.FormatVersion)
	}
	if result.BridgeVersion != report.BridgeVersion {
		t.Fatalf("expected BridgeVersion %q, got %q", report.BridgeVersion, result.BridgeVersion)
	}
	if result.CreatedAt != report.CreatedAt {
		t.Fatalf("expected CreatedAt %q, got %q", report.CreatedAt, result.CreatedAt)
	}
	if result.BundleChecksum != report.BundleChecksum {
		t.Fatalf("expected BundleChecksum %q, got %q", report.BundleChecksum, result.BundleChecksum)
	}
}

// assertPreviewResultGroupsMatch checks that each DTO group mirrors its
// source report group, in order.
func assertPreviewResultGroupsMatch(t *testing.T, got []BackupImportGroupResult, want []backup.PreviewGroup) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("expected %d groups, got %d", len(want), len(got))
	}
	for i, g := range want {
		if got[i].Name != g.Name || got[i].RecordCount != g.RecordCount {
			t.Fatalf("group %d mismatch: want %+v, got %+v", i, g, got[i])
		}
	}
}

func TestImportResultCarriesRestorePointPathOnFailure(t *testing.T) {
	report := backup.ApplyReport{
		Imported:    []backup.GroupResult{{Name: "anime_snapshots", RecordCount: 512}},
		Failed:      "seasons",
		Unattempted: []string{"season_animes"},
	}

	groupFailure := errors.New("insert record 3: boom")
	result := newBackupImportResult(report, "C:/data/bridge-restore-point-20260731-120000.db", groupFailure)

	if len(result.ImportedGroups) != 1 || result.ImportedGroups[0].Name != "anime_snapshots" {
		t.Fatalf("expected imported groups to mirror the report, got %v", result.ImportedGroups)
	}
	if result.FailedGroup != "seasons" {
		t.Fatalf("expected failed group %q, got %q", "seasons", result.FailedGroup)
	}
	if len(result.UnattemptedGroups) != 1 || result.UnattemptedGroups[0] != "season_animes" {
		t.Fatalf("expected unattempted groups to mirror the report, got %v", result.UnattemptedGroups)
	}
	if result.RestorePointPath != "C:/data/bridge-restore-point-20260731-120000.db" {
		t.Fatalf("expected the restore point path to be carried on failure, got %q", result.RestorePointPath)
	}
	if result.ErrorMessage == "" {
		t.Fatalf("expected a non-empty error message on failure")
	}
}

// TestPreviewResultSerializesEmptySlicesAsArraysNotNull guards the wire shape
// the frontend actually receives. A nil Go slice marshals to JSON null, and
// the frontend reads these fields with .length and .map -- so a nil here
// blanks the whole UI with a TypeError on the single most common path: a
// successful same-version import, where all four are empty.
func TestPreviewResultSerializesEmptySlicesAsArraysNotNull(t *testing.T) {
	t.Parallel()

	// A report with no unknown groups, no absent groups and no version notes:
	// exactly what importing a current-version bundle produces.
	result := newBackupImportPreviewResult("C:/tmp/bundle.zip", backup.PreviewReport{})

	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal preview result: %v", err)
	}

	for _, field := range []string{"groups", "unknownGroups", "absentGroups", "versionNotes"} {
		if bytes.Contains(raw, []byte(`"`+field+`":null`)) {
			t.Fatalf("field %q serialized as null; the frontend calls .length/.map on it: %s", field, raw)
		}
	}
}

// TestImportResultSerializesEmptySlicesAsArraysNotNull is the apply-side twin
// of the preview guard above. On a successful import Unattempted is nil, and
// the frontend maps over it unconditionally.
func TestImportResultSerializesEmptySlicesAsArraysNotNull(t *testing.T) {
	t.Parallel()

	result := newBackupImportResult(backup.ApplyReport{}, "C:/data/restore.db", nil)

	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal import result: %v", err)
	}

	for _, field := range []string{"importedGroups", "unattemptedGroups"} {
		if bytes.Contains(raw, []byte(`"`+field+`":null`)) {
			t.Fatalf("field %q serialized as null; the frontend calls .length/.map on it: %s", field, raw)
		}
	}
}

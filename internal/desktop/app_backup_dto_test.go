package desktop

import (
	"encoding/json"
	"testing"

	"autoreas-bridge/internal/backup"
)

func TestBackupExportResultFieldsAreFlatAndEnglishJSONTagged(t *testing.T) {
	result := BackupExportResult{
		DestinationPath: "C:/backups/autoreas-backup-20260731-120000.zip",
		FormatVersion:   backup.SupportedFormatVersion,
		CreatedAt:       "2026-07-31T12:00:00Z",
		Groups: []BackupGroupResult{
			{Name: "anime_snapshots", RecordCount: 512},
			{Name: "seasons", RecordCount: 1},
			{Name: "season_animes", RecordCount: 12},
		},
		BundleChecksum: "deadbeef",
	}

	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal BackupExportResult: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode BackupExportResult json: %v", err)
	}

	for _, key := range []string{"cancelled", "destinationPath", "formatVersion", "createdAt", "groups", "bundleChecksum"} {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("expected flat English JSON key %q in %s", key, raw)
		}
	}

	groups, ok := decoded["groups"].([]any)
	if !ok || len(groups) != 3 {
		t.Fatalf("expected 3 groups, got %v", decoded["groups"])
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

func TestExportResultMirrorsManifestCountsAndChecksum(t *testing.T) {
	manifest := backup.Manifest{
		FormatVersion: backup.SupportedFormatVersion,
		BridgeVersion: "dev",
		CreatedAt:     "2026-07-31T12:00:00Z",
		Contexts: []backup.ContextEntry{
			{Name: "anime_snapshots", RecordCount: 512, SHA256: "aaa"},
			{Name: "seasons", RecordCount: 1, SHA256: "bbb"},
			{Name: "season_animes", RecordCount: 12, SHA256: "ccc"},
		},
		BundleChecksum: "deadbeef",
	}

	result := newExportResult("C:/backups/dest.zip", manifest)

	if result.Cancelled {
		t.Fatalf("expected Cancelled to be false for a completed export")
	}
	if result.DestinationPath != "C:/backups/dest.zip" {
		t.Fatalf("unexpected destination path: %q", result.DestinationPath)
	}
	if result.FormatVersion != manifest.FormatVersion {
		t.Fatalf("expected FormatVersion %d, got %d", manifest.FormatVersion, result.FormatVersion)
	}
	if result.CreatedAt != manifest.CreatedAt {
		t.Fatalf("expected CreatedAt %q, got %q", manifest.CreatedAt, result.CreatedAt)
	}
	if result.BundleChecksum != manifest.BundleChecksum {
		t.Fatalf("expected BundleChecksum %q, got %q", manifest.BundleChecksum, result.BundleChecksum)
	}
	if len(result.Groups) != len(manifest.Contexts) {
		t.Fatalf("expected %d groups, got %d", len(manifest.Contexts), len(result.Groups))
	}
	for i, ctx := range manifest.Contexts {
		if result.Groups[i].Name != ctx.Name {
			t.Fatalf("group %d: expected name %q, got %q", i, ctx.Name, result.Groups[i].Name)
		}
		if result.Groups[i].RecordCount != ctx.RecordCount {
			t.Fatalf("group %d: expected recordCount %d, got %d", i, ctx.RecordCount, result.Groups[i].RecordCount)
		}
	}
}

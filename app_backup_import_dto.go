package main

import "autoreas-bridge/internal/backup"

// BackupImportGroupResult reports one group's record count, shared between a
// preview's disclosed groups and an apply's imported groups -- the frontend
// only ever needs the name and the count.
type BackupImportGroupResult struct {
	Name        string `json:"name"`
	RecordCount int    `json:"recordCount"`
}

// BackupImportPreviewResult is the zero-write preview outcome returned to the
// frontend before any confirmation is possible. Cancelled is true when the
// user dismissed the open dialog without picking a bundle; every other field
// is then zero-valued and nothing was read.
type BackupImportPreviewResult struct {
	Cancelled      bool                      `json:"cancelled"`
	BundlePath     string                    `json:"bundlePath"`
	FormatVersion  int                       `json:"formatVersion"`
	BridgeVersion  string                    `json:"bridgeVersion"`
	CreatedAt      string                    `json:"createdAt"`
	BundleChecksum string                    `json:"bundleChecksum"`
	Groups         []BackupImportGroupResult `json:"groups"`
	UnknownGroups  []string                  `json:"unknownGroups"`
	AbsentGroups   []string                  `json:"absentGroups"`
	VersionNotes   []string                  `json:"versionNotes"`
}

// BackupImportResult is the apply outcome returned to the frontend. On
// success FailedGroup and ErrorMessage are empty and UnattemptedGroups is
// nil. On failure it names exactly which groups committed, which one failed,
// which were never attempted, and the restore point's path -- the
// information a user needs to decide whether to reach for it.
type BackupImportResult struct {
	ImportedGroups    []BackupImportGroupResult `json:"importedGroups"`
	FailedGroup       string                    `json:"failedGroup"`
	UnattemptedGroups []string                  `json:"unattemptedGroups"`
	RestorePointPath  string                    `json:"restorePointPath"`
	ErrorMessage      string                    `json:"errorMessage"`
}

// newBackupImportPreviewResult builds the DTO from a preview report computed
// against bundlePath, so the path a caller sees is the one the preview was
// actually run against.
func newBackupImportPreviewResult(bundlePath string, report backup.PreviewReport) BackupImportPreviewResult {
	groups := make([]BackupImportGroupResult, 0, len(report.Groups))
	for _, g := range report.Groups {
		groups = append(groups, BackupImportGroupResult{Name: g.Name, RecordCount: g.RecordCount})
	}
	return BackupImportPreviewResult{
		BundlePath:     bundlePath,
		FormatVersion:  report.FormatVersion,
		BridgeVersion:  report.BridgeVersion,
		CreatedAt:      report.CreatedAt,
		BundleChecksum: report.BundleChecksum,
		Groups:         groups,
		UnknownGroups:  report.UnknownGroups,
		AbsentGroups:   report.AbsentGroups,
		VersionNotes:   report.VersionNotes,
	}
}

// newBackupImportResult builds the DTO from an apply report and the restore
// point path it ran against. applyErr's message is surfaced verbatim -- the
// caller (ConfirmBackupImport) has already decided whether that error came
// from a group failure or from an earlier gate.
func newBackupImportResult(report backup.ApplyReport, restorePointPath string, applyErr error) BackupImportResult {
	imported := make([]BackupImportGroupResult, 0, len(report.Imported))
	for _, g := range report.Imported {
		imported = append(imported, BackupImportGroupResult{Name: g.Name, RecordCount: g.RecordCount})
	}
	result := BackupImportResult{
		ImportedGroups:    imported,
		FailedGroup:       report.Failed,
		UnattemptedGroups: report.Unattempted,
		RestorePointPath:  restorePointPath,
	}
	if applyErr != nil {
		result.ErrorMessage = applyErr.Error()
	}
	return result
}

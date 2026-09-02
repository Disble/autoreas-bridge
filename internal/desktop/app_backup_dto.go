package desktop

import "autoreas-bridge/internal/backup"

// BackupGroupResult reports the exported record count for one bundle group,
// mirroring backup.ContextEntry without the internal sha256 field -- the
// frontend only ever needs the name and count.
type BackupGroupResult struct {
	Name        string `json:"name"`
	RecordCount int    `json:"recordCount"`
}

// BackupExportResult is the desktop export outcome returned to the frontend.
// Cancelled is true when the user dismissed the save dialog without picking
// a destination; every other field is then zero-valued and no bundle was
// written.
type BackupExportResult struct {
	Cancelled       bool                `json:"cancelled"`
	DestinationPath string              `json:"destinationPath"`
	FormatVersion   int                 `json:"formatVersion"`
	CreatedAt       string              `json:"createdAt"`
	Groups          []BackupGroupResult `json:"groups"`
	BundleChecksum  string              `json:"bundleChecksum"`
}

// newExportResult builds the DTO from the manifest read back after a
// successful export -- the design's verify-after-write step, so the
// destination path and the counts a caller sees come from the file on disk,
// not from values Export happened to be given.
func newExportResult(dest string, m backup.Manifest) BackupExportResult {
	groups := make([]BackupGroupResult, 0, len(m.Contexts))
	for _, c := range m.Contexts {
		groups = append(groups, BackupGroupResult{Name: c.Name, RecordCount: c.RecordCount})
	}
	return BackupExportResult{
		DestinationPath: dest,
		FormatVersion:   m.FormatVersion,
		CreatedAt:       m.CreatedAt,
		Groups:          groups,
		BundleChecksum:  m.BundleChecksum,
	}
}

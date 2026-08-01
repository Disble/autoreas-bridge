package backup

import (
	"context"
	"fmt"
	"io"
)

// validateFn decodes one table group's JSONL stream and reports how many
// records it read, WITHOUT touching any database. It is the preview half of
// the seam: a group that cannot be decoded must fail before anything is
// written, not halfway through the apply.
type validateFn func(ctx context.Context, r io.Reader) (recordCount int, err error)

// importFn replaces one table group's rows with the records in r, inside its
// own transaction, and reports how many records it applied. Implementations
// MUST decode one record at a time -- nothing accumulates -- and MUST run
// every statement on their own transaction handle.
type importFn func(ctx context.Context, r io.Reader) (recordCount int, err error)

// ImportGroup binds a bundle entry name to the functions that preview and
// apply it. The slice order is the apply order.
type ImportGroup struct {
	Name     string
	Validate validateFn
	Import   importFn
}

// PreviewGroup is one known group the bundle carries.
type PreviewGroup struct {
	Name        string
	RecordCount int
}

// PreviewReport is what a bundle would do to this database, computed with
// zero writes. It names not only what will be applied but what will NOT come
// across -- the disclosure that has to happen before confirmation, not after.
type PreviewReport struct {
	FormatVersion  int
	BridgeVersion  string
	CreatedAt      string
	BundleChecksum string
	Groups         []PreviewGroup // carried by the bundle AND known to this build, in apply order
	UnknownGroups  []string       // carried by the bundle, no importer here -- ignored, a warning
	AbsentGroups   []string       // known here, not in the bundle -- left completely untouched
	VersionNotes   []string       // what this build added since the bundle's formatVersion
}

// GroupResult is one group's apply outcome.
type GroupResult struct {
	Name        string
	RecordCount int
}

// ApplyReport records what actually happened, in apply order. On success
// Failed is empty and Unattempted is nil. On failure it names exactly which
// groups committed, which one failed, and which were never started -- the
// information a user needs to decide whether to reach for the restore point.
type ApplyReport struct {
	Imported    []GroupResult
	Failed      string
	Unattempted []string
}

// Preview verifies src and decodes every known group through its Validate
// function without writing anything. A malformed record fails here, before
// any table has been touched.
func Preview(ctx context.Context, src string, groups []ImportGroup) (PreviewReport, error) {
	vb, err := VerifyBundle(ctx, src)
	if err != nil {
		return PreviewReport{}, err
	}
	defer func() { _ = vb.Close() }()

	report := PreviewReport{
		FormatVersion:  vb.Manifest.FormatVersion,
		BridgeVersion:  vb.Manifest.BridgeVersion,
		CreatedAt:      vb.Manifest.CreatedAt,
		BundleChecksum: vb.Manifest.BundleChecksum,
		VersionNotes:   VersionNotesSince(vb.Manifest.FormatVersion),
	}

	for _, g := range groups {
		r, ok, openErr := vb.OpenGroup(g.Name)
		if openErr != nil {
			return PreviewReport{}, fmt.Errorf("open group %q: %w", g.Name, openErr)
		}
		if !ok {
			report.AbsentGroups = append(report.AbsentGroups, g.Name)
			continue
		}

		count, validateErr := g.Validate(ctx, r)
		_ = r.Close()
		if validateErr != nil {
			return PreviewReport{}, fmt.Errorf("validate group %q: %w", g.Name, validateErr)
		}
		report.Groups = append(report.Groups, PreviewGroup{Name: g.Name, RecordCount: count})
	}

	report.UnknownGroups = unknownBundleGroups(vb.GroupNames(), groups)

	return report, nil
}

// unknownBundleGroups returns every group the bundle carries that has no
// matching entry in known -- carried but not importable, reported as a
// warning, never as an error.
func unknownBundleGroups(bundleGroupNames []string, known []ImportGroup) []string {
	knownNames := make(map[string]bool, len(known))
	for _, g := range known {
		knownNames[g.Name] = true
	}

	var unknown []string
	for _, name := range bundleGroupNames {
		if !knownNames[name] {
			unknown = append(unknown, name)
		}
	}
	return unknown
}

// Apply verifies src again -- Apply is safe to call standalone -- and then
// applies each group in SLICE order, each through its own Import function and
// therefore its own transaction. A group the bundle does not carry is skipped
// entirely: omission is not deletion. The first failure aborts the remaining
// groups and is returned alongside the report.
func Apply(ctx context.Context, src string, groups []ImportGroup) (ApplyReport, error) {
	vb, err := VerifyBundle(ctx, src)
	if err != nil {
		return ApplyReport{}, err
	}
	defer func() { _ = vb.Close() }()

	var report ApplyReport
	for i, g := range groups {
		r, ok, openErr := vb.OpenGroup(g.Name)
		if openErr != nil {
			return report, fmt.Errorf("open group %q: %w", g.Name, openErr)
		}
		if !ok {
			// The bundle does not carry this group: leave it COMPLETELY
			// untouched. This branch is load-bearing -- omission is not
			// deletion -- and must never call g.Import with a synthetic
			// empty reader, which would truncate a table the bundle never
			// mentioned.
			continue
		}

		count, importErr := g.Import(ctx, r)
		_ = r.Close()
		if importErr != nil {
			report.Failed = g.Name
			report.Unattempted = remainingGroupNames(groups[i+1:])
			return report, fmt.Errorf("import group %q: %w", g.Name, importErr)
		}
		report.Imported = append(report.Imported, GroupResult{Name: g.Name, RecordCount: count})
	}

	return report, nil
}

// remainingGroupNames extracts the Name of every group in rest, in order.
func remainingGroupNames(rest []ImportGroup) []string {
	if len(rest) == 0 {
		return nil
	}
	names := make([]string, 0, len(rest))
	for _, g := range rest {
		names = append(names, g.Name)
	}
	return names
}

package backup

import "sort"

// versionNotes records what each format version ADDED, keyed by the version
// that introduced it. It is written in the same change that bumps
// SupportedFormatVersion -- a bump without a note here is an incomplete
// change, because the preview would then silently default fields the user
// was never told about.
//
// Version 1 is the initial format; nothing precedes it, so it adds nothing to
// disclose and carries no entry.
var versionNotes = map[int][]string{}

// versionNotesSince returns every note introduced after bundleVersion and not
// later than supported, in ascending version order. It is the pure core:
// taking the map as a parameter makes it testable against a fabricated
// version history, which the real map cannot supply while only v1 exists.
func versionNotesSince(notes map[int][]string, bundleVersion, supported int) []string {
	versions := make([]int, 0, len(notes))
	for v := range notes {
		if v > bundleVersion && v <= supported {
			versions = append(versions, v)
		}
	}
	sort.Ints(versions)

	var result []string
	for _, v := range versions {
		result = append(result, notes[v]...)
	}
	return result
}

// VersionNotesSince reports what this build added since bundleVersion, so an
// import preview can tell the user which fields will take defaults.
func VersionNotesSince(bundleVersion int) []string {
	return versionNotesSince(versionNotes, bundleVersion, SupportedFormatVersion)
}

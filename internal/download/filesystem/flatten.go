package filesystem

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Flattener moves JD's per-package destination subfolders back to the anime root folder
// (design.md §3.4, PoC #11 cmd/poc/finder.go flattenDownloadFolder). JDownloader's AddAndStart
// is called WITHOUT a package name (PoC #13 quirk) specifically to avoid this subfolder
// behavior, but JD can still create one on its own in some link-grabber paths -- Flatten is
// the mop-up that keeps CountAtRoot accurate regardless.
type Flattener interface {
	// Flatten moves video files from immediate subdirectories of folder into folder's root,
	// then removes any subdirectory left empty by the move. Returns the number of files
	// moved. Errors encountered while moving individual files are NEVER silently swallowed --
	// they are aggregated and returned so the caller can observe and log them, even though a
	// single failed move does not abort the rest of the flatten pass.
	Flatten(ctx context.Context, folder string) (moved int, err error)
}

type flattener struct{}

// NewFlattener returns the Flattener adapter.
func NewFlattener() Flattener {
	return flattener{}
}

// Flatten mirrors cmd/poc/finder.go flattenDownloadFolder's move-then-remove-if-empty shape,
// but DELIBERATELY DIVERGES from the PoC on error handling: the PoC printed a warning and
// continued, swallowing the error from the caller's perspective. Per design's "errors
// observable, not silently swallowed" mandate, this adapter aggregates every per-file move
// error via errors.Join and returns it alongside the moved count, so the caller (service.go,
// later phase) can log/notify on partial flatten failures instead of losing them.
func (flattener) Flatten(ctx context.Context, folder string) (int, error) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		// "folder does not exist yet" is a normal pre-download state, not a failure -- mirrors
		// EpisodeCounter.CountAtRoot's same non-error treatment of a missing root.
		return 0, nil
	}

	moved := 0
	var moveErrs []error

	for _, entry := range entries {
		if ctx.Err() != nil {
			return moved, errors.Join(append(moveErrs, ctx.Err())...)
		}
		if !entry.IsDir() {
			continue
		}

		subDir := filepath.Join(folder, entry.Name())
		subEntries, err := os.ReadDir(subDir)
		if err != nil {
			moveErrs = append(moveErrs, fmt.Errorf("flatten: read subdir %s: %w", subDir, err))
			continue
		}

		subMoved, subErrs := flattenOneSubdir(subDir, folder, subEntries)
		moved += subMoved
		moveErrs = append(moveErrs, subErrs...)

		if subMoved > 0 {
			remaining, err := os.ReadDir(subDir)
			if err == nil && len(remaining) == 0 {
				if rmErr := os.Remove(subDir); rmErr != nil {
					moveErrs = append(moveErrs, fmt.Errorf("flatten: remove emptied subdir %s: %w", subDir, rmErr))
				}
			}
		}
	}

	if len(moveErrs) == 0 {
		return moved, nil
	}
	return moved, errors.Join(moveErrs...)
}

// flattenOneSubdir moves every non-directory entry from subDir into destRoot, returning the
// count of files actually moved and a slice of any per-file move errors encountered. Files
// nested deeper than one level (a directory inside subDir) are left untouched -- Flatten only
// flattens the immediate subdirectory layer JD creates, matching the PoC's one-level scope.
func flattenOneSubdir(subDir, destRoot string, subEntries []os.DirEntry) (int, []error) {
	moved := 0
	var errs []error

	for _, subEntry := range subEntries {
		if subEntry.IsDir() {
			continue
		}
		src := filepath.Join(subDir, subEntry.Name())
		dst := filepath.Join(destRoot, subEntry.Name())
		if err := os.Rename(src, dst); err != nil {
			errs = append(errs, fmt.Errorf("flatten: move %s -> %s: %w", src, dst, err))
			continue
		}
		moved++
	}

	return moved, errs
}

var _ Flattener = flattener{}

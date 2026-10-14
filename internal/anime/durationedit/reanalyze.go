package durationedit

import (
	"context"
	"path/filepath"
	"sort"

	"autoreas-bridge/internal/anime/duration/probe"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/lengths"
)

// Review status values: how the re-analysis as a whole ended.
const (
	// StatusOK means every recognized file was probed.
	StatusOK = "ok"
	// StatusNoFolder means the anime has no folder to analyze.
	StatusNoFolder = "no_folder"
	// StatusFolderMissing means the folder does not exist or cannot be read.
	StatusFolderMissing = "folder_missing"
	// StatusNoFiles means no file in the folder could be matched to an episode number.
	StatusNoFiles = "no_files"
	// StatusProbeUnavailable means ffprobe is not available, so nothing can be measured.
	StatusProbeUnavailable = "probe_unavailable"
	// StatusInterrupted means the folder stopped responding mid-analysis; what was measured can
	// still be applied.
	StatusInterrupted = "interrupted"
	// StatusCancelled means the user cancelled the analysis.
	StatusCancelled = "cancelled"
)

// Review row result values.
const (
	ResultUnchanged  = "unchanged"
	ResultUpdate     = "update"
	ResultAdd        = "add"
	ResultManualKept = "manual_kept"
	ResultSkipped    = "skipped"
	ResultUnreadable = "unreadable"
	ResultNotReached = "not_reached"
)

// ReviewRow is one line of the review: what is stored, what was measured now, and what confirming
// would do. Episode is zero for a skipped file whose number could not be read.
type ReviewRow struct {
	Episode         int
	Basename        string
	CurrentMS       int64
	CurrentMinutes  int
	CurrentSource   string
	MeasuredMS      int64
	MeasuredMinutes int
	Result          string
	// Detail names why a file was skipped, from the identity decision (for example "fractional").
	Detail string
}

// Review is the re-analysis the user confirms into the Editor draft. It never writes anything.
type Review struct {
	Status string
	// FilesRecognized counts the files matched to an episode number.
	FilesRecognized int
	Rows            []ReviewRow
}

// Progress reports the file about to be measured: the Index-th of Total, for Episode.
type Progress struct {
	Index   int
	Total   int
	Episode int
}

// Reanalyze measures every recognized file of the anime's folder and compares each reading with
// the stored duration (docs/episode-durations-editor-ui.md, section 4). It writes nothing: a
// failed or partial analysis can never delete or overwrite a stored duration. progress, when not
// nil, is called before each file is probed; a cancelled ctx ends the analysis as cancelled.
func (s *Service) Reanalyze(ctx context.Context, anime Anime, progress func(Progress)) (Review, error) {
	stored, err := s.durations.ByAnime(ctx, anime.ID)
	if err != nil {
		return Review{}, err
	}
	folder := s.readFolder(anime.Folder)
	switch folder.status {
	case FolderNone:
		return Review{Status: StatusNoFolder}, nil
	case FolderMissing:
		return Review{Status: StatusFolderMissing}, nil
	}

	current := make(map[int]episodes.Duration, len(stored))
	for _, row := range stored {
		current[row.Episode] = row
	}
	assigned := append([]identity.Selection(nil), folder.assignment.Assigned...)
	sort.Slice(assigned, func(i, j int) bool { return assigned[i].Episode < assigned[j].Episode })

	review := Review{Status: StatusNoFiles, FilesRecognized: len(assigned), Rows: skippedRows(folder.assignment.Skipped, current)}
	if len(assigned) == 0 {
		return review, nil
	}
	measured, status := s.measureAll(ctx, anime.Folder, assigned, current, progress)
	if status == StatusProbeUnavailable {
		return Review{Status: status, FilesRecognized: len(assigned)}, nil
	}
	review.Status = status
	review.Rows = append(review.Rows, measured...)
	sort.SliceStable(review.Rows, func(i, j int) bool { return review.Rows[i].Episode < review.Rows[j].Episode })
	return review, nil
}

// measureAll probes the assigned files in order and returns their rows and how the analysis
// ended. A cancel or a folder that stopped responding leaves the rest not reached; a missing probe
// returns no rows at all.
func (s *Service) measureAll(ctx context.Context, folder string, assigned []identity.Selection,
	current map[int]episodes.Duration, progress func(Progress)) ([]ReviewRow, string) {
	rows := make([]ReviewRow, 0, len(assigned))
	for i, selection := range assigned {
		if ctx.Err() != nil {
			return append(rows, notReached(assigned[i:], current)...), StatusCancelled
		}
		if progress != nil {
			progress(Progress{Index: i + 1, Total: len(assigned), Episode: selection.Episode})
		}
		row, status := s.measureOne(ctx, folder, selection, current)
		switch status {
		case StatusProbeUnavailable:
			return nil, status
		case StatusInterrupted:
			return append(rows, notReached(assigned[i:], current)...), status
		}
		rows = append(rows, row)
	}
	return rows, StatusOK
}

// measureOne probes one file. A failed probe is the file's alone unless the probe binary is
// missing or the folder itself stopped responding, which end the analysis.
func (s *Service) measureOne(ctx context.Context, folder string, selection identity.Selection,
	current map[int]episodes.Duration) (ReviewRow, string) {
	runtime, err := s.prober.Probe(ctx, filepath.Join(folder, selection.Basename))
	if err == nil {
		return compared(selection, runtime.Milliseconds(), current), StatusOK
	}
	if probe.Unavailable(err) {
		return ReviewRow{}, StatusProbeUnavailable
	}
	if _, gone := s.inventory.Capture(folder); gone != nil {
		return ReviewRow{}, StatusInterrupted
	}
	return withCurrent(ReviewRow{Episode: selection.Episode, Basename: selection.Basename, Result: ResultUnreadable}, current), StatusOK
}

// compared builds the row of one measured file against its stored duration.
func compared(selection identity.Selection, measuredMS int64, current map[int]episodes.Duration) ReviewRow {
	row := withCurrent(ReviewRow{Episode: selection.Episode, Basename: selection.Basename, MeasuredMS: measuredMS,
		MeasuredMinutes: minutesOf(measuredMS)}, current)
	switch {
	case measuredMS <= 0:
		// A runtime below one millisecond is no duration; storing it would be refused.
		row.Result = ResultUnreadable
		row.MeasuredMS, row.MeasuredMinutes = 0, 0
	case row.CurrentMS == 0:
		row.Result = ResultAdd
	case row.CurrentSource == episodes.SourceManual:
		row.Result = ResultManualKept
	case row.CurrentMinutes == row.MeasuredMinutes:
		// The review compares what the user sees: a reading within the same whole minute is no change.
		row.Result = ResultUnchanged
	default:
		row.Result = ResultUpdate
	}
	return row
}

// skippedRows lists the files the identity decision would not trust: unreadable files and files
// whose number is unclear (a half episode, two files claiming one episode). Each keeps its saved
// duration.
func skippedRows(skipped []identity.Diagnostic, current map[int]episodes.Duration) []ReviewRow {
	rows := make([]ReviewRow, 0, len(skipped))
	for _, diagnostic := range skipped {
		result := ResultSkipped
		if diagnostic.Kind == identity.DiagnosticUnreadable {
			result = ResultUnreadable
		}
		rows = append(rows, withCurrent(ReviewRow{
			Episode: diagnostic.Episode, Basename: diagnostic.Basename, Result: result, Detail: diagnostic.Detail,
		}, current))
	}
	return rows
}

// notReached lists the files an interrupted analysis never measured; each keeps its current value.
func notReached(rest []identity.Selection, current map[int]episodes.Duration) []ReviewRow {
	rows := make([]ReviewRow, 0, len(rest))
	for _, selection := range rest {
		rows = append(rows, withCurrent(ReviewRow{
			Episode: selection.Episode, Basename: selection.Basename, Result: ResultNotReached,
		}, current))
	}
	return rows
}

// withCurrent fills a row's stored duration, when its episode has one.
func withCurrent(row ReviewRow, current map[int]episodes.Duration) ReviewRow {
	if stored, ok := current[row.Episode]; ok {
		row.CurrentMS = stored.DurationMS
		row.CurrentMinutes = minutesOf(stored.DurationMS)
		row.CurrentSource = stored.Source
	}
	return row
}

// minutesOf rounds a runtime in milliseconds with the read model's rounding.
func minutesOf(ms int64) int {
	return lengths.WholeMinutes(runtimeOf(ms))
}

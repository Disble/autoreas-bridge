// Package durationedit is the Editor's view of an anime's episode durations: which episode rows
// exist and what each one shows (docs/episode-durations-editor-ui.md, section 2), and the
// re-analysis review the user confirms into the Editor draft (section 4, L15).
//
// It only reads: the stored durations, the folder and the probe. Every change the user makes is
// saved later, with the Editor's Save, through episodes.Store.ApplyEdits.
package durationedit

import (
	"context"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/lengths"
)

// Folder status values: what the anime's folder is right now.
const (
	FolderNone    = "none"
	FolderMissing = "missing"
	FolderFound   = "found"
)

// Row source values: who set the shown duration, and whether a file backs it.
const (
	SourceMeasured             = "measured"
	SourceManual               = "manual"
	SourceManualNoFile         = "manual_no_file"
	SourceNotMeasured          = "not_measured"
	SourceNotMeasuredFileFound = "not_measured_file_found"
)

// Anime is what the Editor knows about the anime being edited, taken from the draft so the section
// follows an unsaved folder, total or type.
type Anime struct {
	ID            string
	Folder        string
	TotalEpisodes *int
	Kind          *int
}

// Row is one episode row of the section. DurationMS and Minutes are zero when nothing is stored.
type Row struct {
	Episode    int
	DurationMS int64
	Minutes    int
	Long       bool
	Source     string
}

// Section is the Episodes section of the Editor.
type Section struct {
	FolderStatus string
	// Rows is the union of the stored durations, the episode files found and episodes 1..Total.
	Rows []Row
	// BeyondTotal lists the episodes whose file exists past TotalEpisodes.
	BeyondTotal []int
	// TV reports whether long marks apply to this anime.
	TV bool
}

// Durations reads one anime's stored durations. The episodes store implements it.
type Durations interface {
	ByAnime(ctx context.Context, animeID string) ([]episodes.Duration, error)
}

// Inventory lists the media files of a folder. media.Inventory implements it.
type Inventory interface {
	Capture(folder string) ([]identity.Entry, error)
}

// Prober reads the runtime of one media file.
type Prober interface {
	Probe(ctx context.Context, path string) (time.Duration, error)
}

// Service builds the section and runs re-analyses.
type Service struct {
	durations Durations
	inventory Inventory
	assigner  identity.Assigner
	prober    Prober
}

// New returns a Service.
func New(durations Durations, inventory Inventory, assigner identity.Assigner, prober Prober) *Service {
	return &Service{durations: durations, inventory: inventory, assigner: assigner, prober: prober}
}

// folderReading is what one look at the folder found.
type folderReading struct {
	status     string
	assignment identity.Assignment
}

// readFolder captures the folder and assigns its files with clear numbers only: the Editor shows
// and re-measures exactly the files an automatic path would trust.
func (s *Service) readFolder(folder string) folderReading {
	if folder == "" {
		return folderReading{status: FolderNone}
	}
	entries, err := s.inventory.Capture(folder)
	if err != nil {
		return folderReading{status: FolderMissing}
	}
	return folderReading{
		status:     FolderFound,
		assignment: s.assigner.Assign(identity.Request{Entries: entries, Context: identity.Context{}}),
	}
}

// Section builds the Episodes section of anime.
func (s *Service) Section(ctx context.Context, anime Anime) (Section, error) {
	stored, err := s.durations.ByAnime(ctx, anime.ID)
	if err != nil {
		return Section{}, err
	}
	folder := s.readFolder(anime.Folder)
	files := make(map[int]bool, len(folder.assignment.Assigned))
	for _, selection := range folder.assignment.Assigned {
		files[selection.Episode] = true
	}

	rows := map[int]Row{}
	for i, length := range lengths.EpisodeLengths(stored, anime.Kind) {
		rows[length.Episode] = Row{
			Episode: length.Episode, DurationMS: stored[i].DurationMS, Minutes: length.Minutes, Long: length.Long,
			Source: storedSource(stored[i].Source, folder.status == FolderFound && !files[length.Episode]),
		}
	}
	for episode := range files {
		if _, ok := rows[episode]; !ok {
			rows[episode] = Row{Episode: episode, Source: SourceNotMeasuredFileFound}
		}
	}
	if anime.TotalEpisodes != nil {
		for episode := 1; episode <= *anime.TotalEpisodes; episode++ {
			if _, ok := rows[episode]; !ok {
				rows[episode] = Row{Episode: episode, Source: SourceNotMeasured}
			}
		}
	}

	return Section{
		FolderStatus: folder.status,
		Rows:         sortedRows(rows),
		BeyondTotal:  beyondTotal(files, anime.TotalEpisodes),
		TV:           anime.Kind != nil && *anime.Kind == lengths.TVKind,
	}, nil
}

// storedSource names a stored row's source; a manual value with no file behind it in a found
// folder is one added by hand before its file exists.
func storedSource(source string, noFile bool) string {
	if source != episodes.SourceManual {
		return SourceMeasured
	}
	if noFile {
		return SourceManualNoFile
	}
	return SourceManual
}

// sortedRows returns the rows ordered by episode.
func sortedRows(rows map[int]Row) []Row {
	out := make([]Row, 0, len(rows))
	for _, row := range rows {
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Episode < out[j].Episode })
	return out
}

// beyondTotal lists, in order, the episodes with a file past total.
func beyondTotal(files map[int]bool, total *int) []int {
	if total == nil {
		return nil
	}
	var out []int
	for episode := range files {
		if episode > *total {
			out = append(out, episode)
		}
	}
	sort.Ints(out)
	return out
}

// runtimeOf converts a stored or measured duration in milliseconds into a runtime.
func runtimeOf(ms int64) time.Duration {
	return time.Duration(ms) * time.Millisecond
}

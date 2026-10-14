package desktop

import (
	"context"
	"fmt"
	"sync"
	"time"

	"autoreas-bridge/internal/anime/duration/probe"
	"autoreas-bridge/internal/anime/durationedit"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/config"
)

// episodeReanalysisProgressEvent is the frontend event a re-analysis emits before each file.
const episodeReanalysisProgressEvent = "episode.durations_reanalysis_progress"

// Editor binding outcomes.
const (
	episodeEditorOutcomeOK    = "ok"
	episodeEditorOutcomeBusy  = "busy"
	episodeEditorOutcomeError = "error"
)

// EpisodeDurationAnimeDTO is what the Editor draft says about the anime: its id and the folder,
// total and type it currently shows, saved or not.
type EpisodeDurationAnimeDTO struct {
	AnimeID       string `json:"animeId"`
	Folder        string `json:"folder"`
	TotalEpisodes *int   `json:"totalEpisodes,omitempty"`
	Kind          *int   `json:"kind,omitempty"`
}

// EpisodeDurationRowDTO is one row of the Episodes section.
type EpisodeDurationRowDTO struct {
	Episode    int    `json:"episode"`
	DurationMs int64  `json:"durationMs"`
	Minutes    int    `json:"minutes"`
	Long       bool   `json:"long"`
	Source     string `json:"source"`
}

// EpisodeDurationSectionResult is the Episodes section, or why it could not be read.
type EpisodeDurationSectionResult struct {
	Outcome      string                  `json:"outcome"`
	Message      string                  `json:"message,omitempty"`
	FolderStatus string                  `json:"folderStatus"`
	Rows         []EpisodeDurationRowDTO `json:"rows"`
	BeyondTotal  []int                   `json:"beyondTotal"`
	TV           bool                    `json:"tv"`
}

// EpisodeDurationReviewRowDTO is one row of the re-analysis review.
type EpisodeDurationReviewRowDTO struct {
	Episode         int    `json:"episode"`
	Basename        string `json:"basename"`
	CurrentMs       int64  `json:"currentMs"`
	CurrentMinutes  int    `json:"currentMinutes"`
	CurrentSource   string `json:"currentSource"`
	MeasuredMs      int64  `json:"measuredMs"`
	MeasuredMinutes int    `json:"measuredMinutes"`
	Result          string `json:"result"`
	Detail          string `json:"detail,omitempty"`
}

// EpisodeDurationReviewResult is the re-analysis review, or why none ran.
type EpisodeDurationReviewResult struct {
	Outcome         string                        `json:"outcome"`
	Message         string                        `json:"message,omitempty"`
	Status          string                        `json:"status"`
	FilesRecognized int                           `json:"filesRecognized"`
	Rows            []EpisodeDurationReviewRowDTO `json:"rows"`
}

// EpisodeDurationSaveResult is the outcome of saving the Episodes card: applied when a row
// changed, no-op when nothing did, error with its reason otherwise.
type EpisodeDurationSaveResult struct {
	Outcome contracts.AnimePatchOutcome `json:"outcome"`
	Message string                      `json:"message,omitempty"`
	Changed int                         `json:"changed"`
}

// EpisodeDurationReanalysisProgress is the payload of one progress event.
type EpisodeDurationReanalysisProgress struct {
	AnimeID string `json:"animeId"`
	Index   int    `json:"index"`
	Total   int    `json:"total"`
	Episode int    `json:"episode"`
}

// EpisodeDurationEditDTO is one Editor change to one episode, saved with SaveEpisodeDurations. Clear
// deletes the duration; otherwise source is "manual" or "measured" (a confirmed re-analysis).
type EpisodeDurationEditDTO struct {
	Episode    int    `json:"episode"`
	DurationMs int64  `json:"durationMs"`
	Source     string `json:"source"`
	Clear      bool   `json:"clear"`
}

// episodeReanalysis allows one re-analysis at a time and keeps its cancel.
type episodeReanalysis struct {
	running sync.Mutex
	mu      sync.Mutex
	cancel  context.CancelFunc
}

// newEpisodeDurationEditor builds the Editor's duration service from the same parts the download
// notice and the backfill use: the pipeline's extension set, the identity assigner and ffprobe.
func newEpisodeDurationEditor(store durationedit.Durations) *durationedit.Service {
	return durationedit.New(store, media.New(config.VideoFileExtensions), identity.NewAssigner(), probe.NewFFProbe(""))
}

// GetEpisodeDurationSection returns the Editor's Episodes section for what the draft shows.
func (a *App) GetEpisodeDurationSection(request EpisodeDurationAnimeDTO) EpisodeDurationSectionResult {
	if a.bridgeDB == nil {
		return EpisodeDurationSectionResult{Outcome: episodeEditorOutcomeError, Message: "episode durations unavailable"}
	}
	section, err := newEpisodeDurationEditor(episodes.NewStore(a.bridgeDB, time.Now)).
		Section(a.appContext(), request.toDomain())
	if err != nil {
		return EpisodeDurationSectionResult{Outcome: episodeEditorOutcomeError, Message: fmt.Sprintf("read episode durations: %v", err)}
	}
	rows := make([]EpisodeDurationRowDTO, len(section.Rows))
	for i, row := range section.Rows {
		rows[i] = EpisodeDurationRowDTO{Episode: row.Episode, DurationMs: row.DurationMS, Minutes: row.Minutes, Long: row.Long, Source: row.Source}
	}
	beyond := section.BeyondTotal
	if beyond == nil {
		beyond = []int{}
	}
	return EpisodeDurationSectionResult{Outcome: episodeEditorOutcomeOK, FolderStatus: section.FolderStatus, Rows: rows,
		BeyondTotal: beyond, TV: section.TV}
}

// ReanalyzeEpisodeDurations measures the draft's folder and returns the review the user confirms
// into the draft. It writes nothing. Progress is emitted before each file; only one re-analysis
// runs at a time, and CancelEpisodeReanalysis ends it.
func (a *App) ReanalyzeEpisodeDurations(request EpisodeDurationAnimeDTO) EpisodeDurationReviewResult {
	if a.bridgeDB == nil {
		return EpisodeDurationReviewResult{Outcome: episodeEditorOutcomeError, Message: "episode durations unavailable"}
	}
	state := &a.episodeDurations.reanalysis
	if !state.running.TryLock() {
		return EpisodeDurationReviewResult{Outcome: episodeEditorOutcomeBusy, Message: "a re-analysis is already running"}
	}
	defer state.running.Unlock()
	ctx, cancel := context.WithCancel(a.appContext())
	defer cancel()
	state.mu.Lock()
	state.cancel = cancel
	state.mu.Unlock()
	defer func() {
		state.mu.Lock()
		state.cancel = nil
		state.mu.Unlock()
	}()

	review, err := newEpisodeDurationEditor(episodes.NewStore(a.bridgeDB, time.Now)).
		Reanalyze(ctx, request.toDomain(), func(p durationedit.Progress) {
			if a.emitFn == nil {
				return
			}
			a.emitFn(a.appContext(), episodeReanalysisProgressEvent, EpisodeDurationReanalysisProgress{
				AnimeID: request.AnimeID, Index: p.Index, Total: p.Total, Episode: p.Episode,
			})
		})
	if err != nil {
		return EpisodeDurationReviewResult{Outcome: episodeEditorOutcomeError, Message: fmt.Sprintf("re-analyze episode durations: %v", err)}
	}
	return EpisodeDurationReviewResult{Outcome: episodeEditorOutcomeOK, Status: review.Status,
		FilesRecognized: review.FilesRecognized, Rows: toReviewRowDTOs(review.Rows)}
}

// CancelEpisodeReanalysis ends the running re-analysis, if any.
func (a *App) CancelEpisodeReanalysis() {
	state := &a.episodeDurations.reanalysis
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.cancel != nil {
		state.cancel()
	}
}

// SaveEpisodeDurations saves the Episodes card on its own, in one transaction: either every edit
// is stored or none is. It never touches the anime, so its modified_at does not move.
func (a *App) SaveEpisodeDurations(animeID string, edits []EpisodeDurationEditDTO) EpisodeDurationSaveResult {
	changed, err := a.saveEpisodeEdits(animeID, edits)
	if err != nil {
		return EpisodeDurationSaveResult{Outcome: contracts.AnimePatchOutcomeError, Message: fmt.Sprintf("save episode durations: %v", err)}
	}
	if changed == 0 {
		return EpisodeDurationSaveResult{Outcome: contracts.AnimePatchOutcomeNoOp}
	}
	return EpisodeDurationSaveResult{Outcome: contracts.AnimePatchOutcomeApplied, Changed: changed}
}

// saveEpisodeEdits stores the Editor's episode changes in one write, waking the announcer.
func (a *App) saveEpisodeEdits(animeID string, edits []EpisodeDurationEditDTO) (int, error) {
	if len(edits) == 0 {
		return 0, nil
	}
	if a.bridgeDB == nil {
		return 0, fmt.Errorf("episode durations unavailable")
	}
	domain := make([]episodes.Edit, len(edits))
	for i, edit := range edits {
		domain[i] = episodes.Edit{Episode: edit.Episode, DurationMS: edit.DurationMs, Source: edit.Source, Clear: edit.Clear}
	}
	return episodes.NewStore(a.bridgeDB, time.Now).OnPendingMarked(a.episodeDurations.wake).
		ApplyEdits(a.appContext(), animeID, domain)
}

// toDomain converts the draft's view of the anime.
func (d EpisodeDurationAnimeDTO) toDomain() durationedit.Anime {
	return durationedit.Anime{ID: d.AnimeID, Folder: d.Folder, TotalEpisodes: d.TotalEpisodes, Kind: d.Kind}
}

// toReviewRowDTOs converts the review rows; an empty review is an empty list, never null.
func toReviewRowDTOs(rows []durationedit.ReviewRow) []EpisodeDurationReviewRowDTO {
	out := make([]EpisodeDurationReviewRowDTO, len(rows))
	for i, row := range rows {
		out[i] = EpisodeDurationReviewRowDTO{
			Episode: row.Episode, Basename: row.Basename, CurrentMs: row.CurrentMS, CurrentMinutes: row.CurrentMinutes,
			CurrentSource: row.CurrentSource, MeasuredMs: row.MeasuredMS, MeasuredMinutes: row.MeasuredMinutes,
			Result: row.Result, Detail: row.Detail,
		}
	}
	return out
}

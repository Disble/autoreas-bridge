package events

const (
	EventNameAnimeChanged         = "anime.changed"
	EventNameAnimeUpdateRequested = "anime.update_requested"
	EventNameAnimeWriteFailed     = "anime.write.failed"
	EventNameSyncRequested        = "sync.requested"

	AnimeChangeTypeCreate = "create"
	AnimeChangeTypeUpdate = "update"
	AnimeChangeTypeDelete = "delete"
)

// download.* event names (design.md §8 "Download Events on the Event Bus", SDD-28 PR4b/Phase
// 6). These are domain events on the backend<->backend Bus, DISTINCT from the user-facing
// notification.Notifier calls the download orchestrator also makes for the same notable moments
// (design §14.1 -- a backend event is not a user notification).
const (
	EventNameDownloadRunStarted        = "download.run_started"
	EventNameDownloadRunProgress       = "download.run_progress"
	EventNameDownloadRunFinished       = "download.run_finished"
	EventNameDownloadEpisodeAvailable  = "download.episode_available"
	EventNameDownloadEpisodeDownloaded = "download.episode_downloaded"
	EventNameDownloadFailed            = "download.failed"
	EventNameDownloadSkipped           = "download.skipped"
	EventNameDownloadJDStatus          = "download.jd_status"
)

type Event interface {
	Name() string
}

type AnimeChangedEvent struct {
	AnimeID       string
	Payload       []byte
	ChangeType    string
	ChangedFields []string
	CorrelationID string
}

func (e AnimeChangedEvent) Name() string {
	return EventNameAnimeChanged
}

type AnimeUpdateRequestedEvent struct {
	AnimeID       string
	Payload       []byte
	CorrelationID string
}

func (e AnimeUpdateRequestedEvent) Name() string {
	return EventNameAnimeUpdateRequested
}

type AnimeWriteFailedEvent struct {
	AnimeID       string
	Path          string
	Err           string
	CorrelationID string
}

func (e AnimeWriteFailedEvent) Name() string {
	return EventNameAnimeWriteFailed
}

func (e AnimeWriteFailedEvent) EventName() string {
	return EventNameAnimeWriteFailed
}

type SyncRequestedEvent struct {
	Requester     string
	CorrelationID string
}

func (e SyncRequestedEvent) Name() string {
	return EventNameSyncRequested
}

// DownloadRunStartedEvent is published when Service.RunOnce opens a new download_runs row
// (design.md §8).
type DownloadRunStartedEvent struct {
	RunID         string
	Trigger       string
	CorrelationID string
}

func (e DownloadRunStartedEvent) Name() string {
	return EventNameDownloadRunStarted
}

// DownloadRunProgressEvent is published after the running download_runs row has been refreshed
// with the latest counters, so UI detail panes can re-fetch and show progress before finalization.
type DownloadRunProgressEvent struct {
	RunID         string
	CorrelationID string
}

func (e DownloadRunProgressEvent) Name() string {
	return EventNameDownloadRunProgress
}

// DownloadRunFinishedEvent is published when a download run reaches a terminal status (one of
// ok|partial|error|jd_offline|no_animes_today|interrupted, design.md §8 run-status taxonomy).
type DownloadRunFinishedEvent struct {
	RunID         string
	Status        string
	CorrelationID string
}

func (e DownloadRunFinishedEvent) Name() string {
	return EventNameDownloadRunFinished
}

// DownloadEpisodeAvailableEvent is published when the trigger decision (NeedsDownload) finds a
// new episode online for an anime, before any scrape/enqueue is attempted (design.md §5/§8).
type DownloadEpisodeAvailableEvent struct {
	RunID         string
	AnimeID       string
	Episode       int
	CorrelationID string
}

func (e DownloadEpisodeAvailableEvent) Name() string {
	return EventNameDownloadEpisodeAvailable
}

// DownloadEpisodeDownloadedEvent is published when the filesystem completion poll confirms an
// episode landed on disk (design.md §5/§8).
type DownloadEpisodeDownloadedEvent struct {
	RunID         string
	AnimeID       string
	Episode       int
	CorrelationID string
}

func (e DownloadEpisodeDownloadedEvent) Name() string {
	return EventNameDownloadEpisodeDownloaded
}

// DownloadFailedEvent is published on any per-anime/per-episode failure, carrying the
// failure-kind classification (design.md §8 "captcha|hoster_down|slow_or_timeout",
// download-sites spec "Failure-Cause Classification"). Publishing this event NEVER aborts the
// per-anime fan-out -- it is purely observational.
type DownloadFailedEvent struct {
	RunID         string
	AnimeID       string
	FailureKind   string
	CorrelationID string
}

func (e DownloadFailedEvent) Name() string {
	return EventNameDownloadFailed
}

// DownloadSkippedEvent is published when EvaluateAnimeForDownload (or site resolution) excludes
// an anime from a run, carrying the stable SkipReason code (design.md §8 "Skip Accounting";
// download-orchestration spec "Explicit Tipo 1/2 Skip", "Missing Pagina/Carpeta Surfaced as
// Actionable State"). A skip is always observable -- never a silent no-op.
type DownloadSkippedEvent struct {
	RunID         string
	AnimeID       string
	SkipReason    string
	CorrelationID string
}

func (e DownloadSkippedEvent) Name() string {
	return EventNameDownloadSkipped
}

// DownloadJDStatusEvent is published when the JDownloader liveness gate (ListDevices via
// EnsureOnline) changes observed status, e.g. transitioning online<->offline (design.md §8).
type DownloadJDStatusEvent struct {
	RunID         string
	Online        bool
	CorrelationID string
}

func (e DownloadJDStatusEvent) Name() string {
	return EventNameDownloadJDStatus
}

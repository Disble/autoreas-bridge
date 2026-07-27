package events

const (
	// EventNameAnimeChanged identifies anime change events.
	EventNameAnimeChanged = "anime.changed"
	// EventNameAnimeUpdateRequested identifies requested anime write events.
	EventNameAnimeUpdateRequested = "anime.update_requested"
	// EventNameAnimeWriteFailed identifies anime write failure events.
	EventNameAnimeWriteFailed = "anime.write.failed"
	// EventNameSyncRequested identifies sync-request events.
	EventNameSyncRequested = "sync.requested"

	// AnimeChangeTypeCreate marks a newly created anime snapshot.
	AnimeChangeTypeCreate = "create"
	// AnimeChangeTypeUpdate marks an updated anime snapshot.
	AnimeChangeTypeUpdate = "update"
	// AnimeChangeTypeDelete marks a deleted anime snapshot.
	AnimeChangeTypeDelete = "delete"
)

// download.* event names (design.md §8 "Download Events on the Event Bus", SDD-28 PR4b/Phase
// 6). These are domain events on the backend<->backend Bus, DISTINCT from the user-facing
// notification.Notifier calls the download orchestrator also makes for the same notable moments
// (design §14.1 -- a backend event is not a user notification).
const (
	// EventNameDownloadRunStarted identifies download run start events.
	EventNameDownloadRunStarted = "download.run_started"
	// EventNameDownloadRunProgress identifies download progress refresh events.
	EventNameDownloadRunProgress = "download.run_progress"
	// EventNameDownloadRunFinished identifies terminal download run events.
	EventNameDownloadRunFinished = "download.run_finished"
	// EventNameDownloadEpisodeAvailable identifies newly available episode events.
	EventNameDownloadEpisodeAvailable = "download.episode_available"
	// EventNameDownloadEpisodeDownloaded identifies completed episode download events.
	EventNameDownloadEpisodeDownloaded = "download.episode_downloaded"
	// EventNameDownloadFailed identifies per-episode or per-anime failure events.
	EventNameDownloadFailed = "download.failed"
	// EventNameDownloadSkipped identifies skip events.
	EventNameDownloadSkipped = "download.skipped"
	// EventNameDownloadJDStatus identifies JDownloader status events.
	EventNameDownloadJDStatus = "download.jd_status"
	// EventNameDownloadEpisodeDownloading identifies filesystem evidence that a download
	// has started transferring (a .part file was observed under the anime folder).
	EventNameDownloadEpisodeDownloading = "download.episode_downloading"
)

// Event is the base contract for all bridge bus events.
type Event interface {
	Name() string
}

// AnimeChangedEvent reports an effective anime snapshot mutation.
type AnimeChangedEvent struct {
	EventID       string
	AnimeID       string
	Payload       []byte
	ChangeType    string
	ChangedFields []string
	CorrelationID string
}

// Name returns the bus event name for AnimeChangedEvent.
func (e AnimeChangedEvent) Name() string {
	return EventNameAnimeChanged
}

// AnimeUpdateRequestedEvent requests a write-back into the legacy anime store.
type AnimeUpdateRequestedEvent struct {
	AnimeID       string
	Payload       []byte
	CorrelationID string
}

// Name returns the bus event name for AnimeUpdateRequestedEvent.
func (e AnimeUpdateRequestedEvent) Name() string {
	return EventNameAnimeUpdateRequested
}

// AnimeWriteFailedEvent reports a failed anime write attempt.
type AnimeWriteFailedEvent struct {
	AnimeID       string
	Path          string
	Err           string
	CorrelationID string
}

// Name returns the bus event name for AnimeWriteFailedEvent.
func (e AnimeWriteFailedEvent) Name() string {
	return EventNameAnimeWriteFailed
}

// EventName returns the stable event name string for AnimeWriteFailedEvent.
func (e AnimeWriteFailedEvent) EventName() string {
	return EventNameAnimeWriteFailed
}

// SyncRequestedEvent requests a sync cycle.
type SyncRequestedEvent struct {
	Requester     string
	CorrelationID string
}

// Name returns the bus event name for SyncRequestedEvent.
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

// Name returns the bus event name for DownloadRunStartedEvent.
func (e DownloadRunStartedEvent) Name() string {
	return EventNameDownloadRunStarted
}

// DownloadRunProgressEvent is published after the running download_runs row has been refreshed
// with the latest counters, so UI detail panes can re-fetch and show progress before finalization.
type DownloadRunProgressEvent struct {
	RunID         string
	CorrelationID string
}

// Name returns the bus event name for DownloadRunProgressEvent.
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

// Name returns the bus event name for DownloadRunFinishedEvent.
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

// Name returns the bus event name for DownloadEpisodeAvailableEvent.
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

// Name returns the bus event name for DownloadEpisodeDownloadedEvent.
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

// Name returns the bus event name for DownloadFailedEvent.
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

// Name returns the bus event name for DownloadSkippedEvent.
func (e DownloadSkippedEvent) Name() string {
	return EventNameDownloadSkipped
}

// DownloadEpisodeDownloadingEvent is published when filesystem evidence (a .part file)
// confirms a download has started transferring (design §X).
type DownloadEpisodeDownloadingEvent struct {
	RunID         string
	AnimeID       string
	Episode       int
	CorrelationID string
}

// Name returns the bus event name for DownloadEpisodeDownloadingEvent.
func (e DownloadEpisodeDownloadingEvent) Name() string {
	return EventNameDownloadEpisodeDownloading
}

// DownloadJDStatusEvent is published when the JDownloader liveness gate (ListDevices via
// EnsureOnline) changes observed status, e.g. transitioning online<->offline (design.md §8).
type DownloadJDStatusEvent struct {
	RunID         string
	Online        bool
	CorrelationID string
}

// Name returns the bus event name for DownloadJDStatusEvent.
func (e DownloadJDStatusEvent) Name() string {
	return EventNameDownloadJDStatus
}

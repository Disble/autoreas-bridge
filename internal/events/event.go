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
	// EventNameSyncDeviceAcknowledged identifies device changelog-acknowledgment events.
	EventNameSyncDeviceAcknowledged = "sync.device_acknowledged"
	// EventNameEpisodeDurationsChanged identifies episode-duration announcement events.
	EventNameEpisodeDurationsChanged = "episode.durations_changed"

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

// season.* event names (season-matching-resilience T3). These are domain events
// on the backend<->backend Bus, mirroring the download.* family above: the
// season service publishes per-row facts, the desktop run boundary publishes
// the terminal signal, and the desktop bridge forwards all three to the
// WebView so the Season panel follows a run live without a manual reload.
// Like the download family, a backend event is not a user notification.
const (
	// EventNameSeasonMatchingStarted identifies season matching run start events.
	EventNameSeasonMatchingStarted = "season.matching_started"
	// EventNameSeasonMatchingProgress identifies per-row season matching events.
	EventNameSeasonMatchingProgress = "season.matching_progress"
	// EventNameSeasonMatchingFinished identifies terminal season matching run events.
	EventNameSeasonMatchingFinished = "season.matching_finished"
)

// Season matching run phases (docs/ubiquitous-language.md: "name matching"
// and the "availability check"). A run is ONE run with TWO phases, and every
// progress event names the phase its row just resolved in, so the panel never
// claims to be matching while it is really checking episodes.
const (
	// SeasonMatchingPhaseMatching marks rows resolved by name matching
	// (each intake name resolved to a page URL).
	// The value mirrors the registered vocabulary's phase name, "name
	// matching": a phase called plain "matching" would not be distinguishable
	// from the matching RUN the phase belongs to.
	SeasonMatchingPhaseMatching = "name_matching"
	// SeasonMatchingPhaseAvailabilityCheck marks rows resolved by the
	// availability check (deciding which pages already serve an episode).
	SeasonMatchingPhaseAvailabilityCheck = "availability_check"
)

// Event is the base contract for all bridge bus events.
type Event interface { // NOSONAR godre:S8196 -- Event is the domain concept the whole bus is built on, implemented by every concrete event and named in the spec, docs and wire payloads. The agent noun for its Name() method is "Namer", which describes the accessor rather than the thing.
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

// EpisodeDurationsChangedEvent announces that the stored episode durations of one anime changed.
//
// It is NOT an anime write: the anime snapshot and its modified_at are untouched, so it never goes
// through anime_changed_outbox and never reaches the AnimeChangedEvent subscribers (analysis D6).
// Only the sync changelog recorder and the WebSocket hub subscribe to it. Payload is the anime's
// current snapshot, the same bytes an AnimeChangedEvent carries, so the changelog row it produces is
// an ordinary update row. EventID is deterministic per pending mark, so a re-announcement after a
// crash is deduplicated by the changelog's unique source_event_id.
type EpisodeDurationsChangedEvent struct {
	EventID string
	AnimeID string
	Payload []byte
}

// Name returns the bus event name for EpisodeDurationsChangedEvent.
func (e EpisodeDurationsChangedEvent) Name() string {
	return EventNameEpisodeDurationsChanged
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

// DeviceAcknowledgedEvent reports that a device's changelog acknowledgment
// was persisted (ChangelogStore.AcknowledgeDevice), carrying the fields the
// Connected Devices panel needs to refresh in place.
type DeviceAcknowledgedEvent struct {
	DeviceID           string
	LastAckChangelogID int64
	LastSeenAtMs       int64
	CorrelationID      string
}

// Name returns the bus event name for DeviceAcknowledgedEvent.
func (e DeviceAcknowledgedEvent) Name() string {
	return EventNameSyncDeviceAcknowledged
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

// SeasonMatchingStartedEvent is published when a season matching run opens:
// it carries the RUN TOTAL (how many rows this run will attempt), a run fact
// a screen that mounts mid-run cannot derive from the rows. It carries NO
// per-state counters -- the panel derives those from the rows it already
// holds, and repeating them would create a second source of truth. Nothing
// about the run is persisted: it is ephemeral, session only, no history row.
type SeasonMatchingStartedEvent struct {
	SeasonID string
	Total    int
}

// Name returns the bus event name for SeasonMatchingStartedEvent.
func (e SeasonMatchingStartedEvent) Name() string {
	return EventNameSeasonMatchingStarted
}

// SeasonMatchingCandidate is one retained candidate for a season intake row,
// mirroring domain.MatchCandidate without importing the season domain (the
// season service already imports this package for the Bus -- the reverse edge
// would be an import cycle).
type SeasonMatchingCandidate struct {
	Title   string
	PageURL string
	Score   float64
}

// SeasonMatchingProgressEvent is published once per attempted row, in the
// phase the row just resolved in -- including rows whose search FAILED (they
// become search_failed and the UI updates them live). It carries THE ROW
// (id, raw name, resulting match status, matched slug, candidates, plus the
// availability the row currently records) and NO per-state counters.
type SeasonMatchingProgressEvent struct {
	SeasonID          string
	Phase             string
	RowID             string
	RawName           string
	MatchStatus       string
	MatchedSlug       string
	Candidates        []SeasonMatchingCandidate
	Availability      string
	AvailableEpisodes int
}

// Name returns the bus event name for SeasonMatchingProgressEvent.
func (e SeasonMatchingProgressEvent) Name() string {
	return EventNameSeasonMatchingProgress
}

// SeasonMatchingFinishedEvent is the TERMINAL SIGNAL of a season matching
// run, published once by the desktop run boundary after BOTH phases (name
// matching and the availability check) have completed. It carries no
// counters and no history: the season's own rows are the record.
type SeasonMatchingFinishedEvent struct {
	SeasonID string
}

// Name returns the bus event name for SeasonMatchingFinishedEvent.
func (e SeasonMatchingFinishedEvent) Name() string {
	return EventNameSeasonMatchingFinished
}

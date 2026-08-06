package contracts

import (
	"context"
	"errors"
	"time"
)

// ErrAnimeNotFound indicates that no effective anime exists for an identifier.
var ErrAnimeNotFound = errors.New("anime not found")

// AnimePatch contains the supported partial anime mutations.
type AnimePatch struct {
	Estado                *int             `json:"estado,omitempty"`
	NroCapVisto           *float64         `json:"nrocapvisto,omitempty"`
	Activo                *bool            `json:"activo,omitempty"`
	FechaUltCapVisto      *int64           `json:"fechaUltCapVisto,omitempty"`
	FechaEstreno          *int64           `json:"fechaEstreno,omitempty"`
	FechaEliminacion      *int64           `json:"fechaEliminacion,omitempty"`
	RepeatAt              *int64           `json:"repeatAt,omitempty"`
	ClearFechaEliminacion bool             `json:"clearFechaEliminacion,omitempty"`
	PreserveLastWatched   bool             `json:"-"`
	Dias                  []string         `json:"dias,omitempty"`
	DiasOrdered           []MobileAnimeDay `json:"-"`
	Base                  *int64           `json:"base,omitempty"`
}

// AnimePatchOutcome identifies the semantic result of an anime mutation.
type AnimePatchOutcome string

// AnimePatchOutcome values classify patch outcomes.
const (
	AnimePatchOutcomeApplied  AnimePatchOutcome = "applied"
	AnimePatchOutcomeNoOp     AnimePatchOutcome = "no_op"
	AnimePatchOutcomeConflict AnimePatchOutcome = "conflict"
	AnimePatchOutcomeError    AnimePatchOutcome = "error"
)

// AnimePatchResult is the authoritative semantic result of an anime mutation.
type AnimePatchResult struct {
	Status     string            `json:"status,omitempty"`
	Message    string            `json:"message,omitempty"`
	AnimeID    string            `json:"animeId"`
	Outcome    AnimePatchOutcome `json:"outcome"`
	ModifiedAt int64             `json:"modifiedAt"`
	ConflictID string            `json:"conflictId,omitempty"`
}

// Placement is one schedule destination assignment: a weekday or a special
// queue (e.g. "Sin ver"), plus its order within that destination.
type Placement struct {
	Day   string `json:"day"`
	Order int    `json:"order"`
}

// AnimeCreate is the input for creating a brand-new anime. Premiere date is
// never user-provided here: it is an auto lifecycle field set only when the
// first episode is watched (see episode_service.go), never at create time.
type AnimeCreate struct {
	ID              string            `json:"id,omitempty"`
	Nombre          string            `json:"nombre"`
	Pagina          string            `json:"pagina"`
	Dias            []Placement       `json:"dias"`
	Carpeta         string            `json:"carpeta,omitempty"`
	Tipo            *int              `json:"tipo,omitempty"`
	EpisodesWatched *int              `json:"episodesWatched,omitempty"`
	TotalEpisodes   *int              `json:"totalEpisodes,omitempty"`
	DurationMinutes *int              `json:"durationMinutes,omitempty"`
	Origin          string            `json:"origin,omitempty"`
	Genres          []string          `json:"genres,omitempty"`
	Studios         []string          `json:"studios,omitempty"`
	Cover           *AnimeCreateCover `json:"cover,omitempty"`
}

// AnimeCreateCover is the optional user-provided cover for a manual anime create.
type AnimeCreateCover struct {
	Type string `json:"type"`
	Path string `json:"path"`
}

// AnimeCreateResult is the authoritative result of a batch anime create.
type AnimeCreateResult struct {
	Outcome    AnimePatchOutcome `json:"outcome"`
	Message    string            `json:"message,omitempty"`
	AnimeIDs   []string          `json:"animeIds,omitempty"`
	ModifiedAt int64             `json:"modifiedAt"`
	ConflictID string            `json:"conflictId,omitempty"`
	Details    map[string]string `json:"details,omitempty"`
}

// EffectiveAnime is the minimal effective-state record used by write paths.
type EffectiveAnime struct {
	ID           string
	TotalCap     *float64
	Activo       *bool
	SnapshotJSON []byte
}

// AnimeQueryService supplies anime read models to adapters.
type AnimeQueryService interface {
	GetEffectiveAnime(ctx context.Context, id string) (*EffectiveAnime, error)
	ListMobileAnimes(ctx context.Context) ([]MobileAnime, error)
	GetMobileAnime(ctx context.Context, id string) (*MobileAnime, error)
	ListAnimeItems(ctx context.Context) ([]AnimeListItem, error)
	ListAnimeHistory(ctx context.Context) ([]AnimeHistoryItem, error)
	GetAnimeDetail(ctx context.Context, id string) (*AnimeDetail, error)
}

// AnimeWriteService applies anime mutations.
type AnimeWriteService interface {
	PatchAnime(ctx context.Context, id string, patch AnimePatch) (AnimePatchResult, error)
}

// SyncTriggerService exposes synchronization trigger and cursor operations.
type SyncTriggerService interface {
	TriggerReconcile(ctx context.Context) error
	ListChangesSince(ctx context.Context, sinceMs int64) ([]AnimeChange, int64, error)
	ListChangesAfterID(ctx context.Context, lastID int64) ([]AnimeChange, int64, error)
	AcknowledgeDevice(ctx context.Context, deviceID string, lastChangelogID int64) error
	LastChangedAt(ctx context.Context) (*int64, error)
}

// StatusService provides the current bridge status.
type StatusService interface {
	GetStatus(ctx context.Context) (StatusInfo, error)
}

// DeviceAdminService administers paired devices.
type DeviceAdminService interface {
	ListDevices(ctx context.Context) ([]DeviceInfo, error)
	RevokeDevice(ctx context.Context, id string) error
}

// ConflictService lists and resolves persisted sync conflicts.
type ConflictService interface {
	ListConflicts(ctx context.Context) ([]ConflictInfo, error)
	ResolveConflict(ctx context.Context, id string, at time.Time) error
}

// HosterPriorityItem is one persisted hoster-priority row.
type HosterPriorityItem struct {
	Hoster   string `json:"hoster"`
	Priority int    `json:"priority"`
	Enabled  bool   `json:"enabled"`
}

// DownloadReadinessReason is a stable local blocker returned by the download context.
type DownloadReadinessReason string

const (
	// DownloadReadinessMissingSource identifies an anime without a source page.
	DownloadReadinessMissingSource DownloadReadinessReason = "missing_source"
	// DownloadReadinessInvalidSource identifies a source page that is not an absolute HTTP URL.
	DownloadReadinessInvalidSource DownloadReadinessReason = "invalid_source"
	// DownloadReadinessUnsupportedSource identifies a source page without a registered adapter.
	DownloadReadinessUnsupportedSource DownloadReadinessReason = "unsupported_source"
	// DownloadReadinessDestinationUnresolved identifies an anime without a deterministic download destination.
	DownloadReadinessDestinationUnresolved DownloadReadinessReason = "destination_unresolved"
)

// AnimeDownloadReadiness is one catalog anime's local download-check status.
type AnimeDownloadReadiness struct {
	AnimeID        string                    `json:"animeId"`
	Name           string                    `json:"name"`
	Ready          bool                      `json:"ready"`
	Reasons        []DownloadReadinessReason `json:"reasons"`
	ScheduledToday bool                      `json:"scheduledToday"`
}

// DownloadReadinessSnapshot is the catalog-wide local readiness query result.
type DownloadReadinessSnapshot struct {
	Items            []AnimeDownloadReadiness `json:"items"`
	ScheduledTotal   int                      `json:"scheduledTotal"`
	ScheduledReady   int                      `json:"scheduledReady"`
	ScheduledBlocked int                      `json:"scheduledBlocked"`
}

// DownloadConfig is the read-model for the download settings screen.
type DownloadConfig struct {
	JD       JDStatus       `json:"jd"`
	Schedule ScheduleConfig `json:"schedule"`
	// HosterPrioritySite names the site scope HosterPriority was read from, so the
	// editor persists the reordered list back to the same site the download engine
	// resolves against instead of guessing a site name of its own.
	HosterPrioritySite string               `json:"hosterPrioritySite"`
	HosterPriority     []HosterPriorityItem `json:"hosterPriority"`
}

// JDStatus is the UI-facing view of MyJDownloader connectivity and configuration.
type JDStatus struct {
	Email           string `json:"email"`
	HasPassword     bool   `json:"hasPassword"`
	DeviceName      string `json:"deviceName"`
	ExePathOverride string `json:"exePathOverride"`
	DefaultDestDir  string `json:"defaultDestDir"`
	LastSeenStatus  string `json:"lastSeenStatus"`
	LastSeenAtMs    int64  `json:"lastSeenAtMs"`
	LastDecryptErr  string `json:"lastDecryptError,omitempty"`
}

// JDConfigInput is the write-model accepted by download configuration updates.
type JDConfigInput struct {
	Email             string  `json:"email"`
	PlaintextPassword *string `json:"plaintextPassword,omitempty"`
	DeviceName        string  `json:"deviceName"`
	ExePathOverride   string  `json:"exePathOverride"`
	DefaultDestDir    string  `json:"defaultDestDir"`
}

// ScheduleConfig is the UI-facing twin of the persisted download schedule.
type ScheduleConfig struct {
	Mode            string                `json:"mode"`
	DailyTimeHHMM   string                `json:"dailyTimeHHMM"`
	Enabled         bool                  `json:"enabled"`
	LastRunAtMs     int64                 `json:"lastRunAtMs"`
	LastRunStatus   string                `json:"lastRunStatus"`
	NextRunAtMs     int64                 `json:"nextRunAtMs"`
	Running         bool                  `json:"running"`
	EnabledWeekdays int                   `json:"enabledWeekdays"`
	MissedNotice    *ScheduleMissedNotice `json:"missedNotice,omitempty"`
}

// ScheduleMissedNotice is the startup-only actionable missed selected-day notice overlay.
type ScheduleMissedNotice struct {
	LocalDate     string `json:"localDate"`
	DueAtMs       int64  `json:"dueAtMs"`
	AttemptStatus string `json:"attemptStatus,omitempty"`
}

// ScheduleMissedActionResult is the authoritative Run now / Ignore outcome.
type ScheduleMissedActionResult struct {
	Kind             string `json:"kind"`
	LocalDate        string `json:"localDate"`
	TerminalStatus   string `json:"terminalStatus,omitempty"`
	SettlementReason string `json:"settlementReason,omitempty"`
	Message          string `json:"message,omitempty"`
}

// ManualLink is a persisted manual-download fallback bundle.
type ManualLink struct {
	Anime   string   `json:"anime"`
	Episode int      `json:"episode"`
	Links   []string `json:"links"`
}

// DownloadRunView is the UI-facing twin of a persisted download run.
type DownloadRunView struct {
	RunID               string       `json:"runId"`
	StartedAtMs         int64        `json:"startedAtMs"`
	FinishedAtMs        *int64       `json:"finishedAtMs,omitempty"`
	Trigger             string       `json:"trigger"`
	AnimesChecked       int          `json:"animesChecked"`
	EpisodesFound       int          `json:"episodesFound"`
	EpisodesDownloaded  int          `json:"episodesDownloaded"`
	EpisodesFailed      int          `json:"episodesFailed"`
	EpisodesDownloading int          `json:"episodesDownloading"`
	SkippedCount        int          `json:"skippedCount"`
	UpToDateCount       int          `json:"upToDateCount"`
	JDAvailable         bool         `json:"jdAvailable"`
	Status              string       `json:"status"`
	ErrorSummary        string       `json:"errorSummary,omitempty"`
	ManualLinks         []ManualLink `json:"manualLinks,omitempty"`
}

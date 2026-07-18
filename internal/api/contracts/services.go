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

// AnimeCreate is the input for creating a brand-new anime.
type AnimeCreate struct {
	ID           string `json:"id,omitempty"`
	Nombre       string `json:"nombre"`
	Pagina       string `json:"pagina"`
	Section      string `json:"section"`
	Orden        int    `json:"orden"`
	Carpeta      string `json:"carpeta,omitempty"`
	Tipo         *int   `json:"tipo,omitempty"`
	FechaEstreno *int64 `json:"fechaEstreno,omitempty"`
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

// DownloadConfig is the read-model for the download settings screen.
type DownloadConfig struct {
	JD             JDStatus             `json:"jd"`
	Schedule       ScheduleConfig       `json:"schedule"`
	HosterPriority []HosterPriorityItem `json:"hosterPriority"`
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
	Mode            string `json:"mode"`
	DailyTimeHHMM   string `json:"dailyTimeHHMM"`
	Enabled         bool   `json:"enabled"`
	LastRunAtMs     int64  `json:"lastRunAtMs"`
	LastRunStatus   string `json:"lastRunStatus"`
	NextRunAtMs     int64  `json:"nextRunAtMs"`
	Running         bool   `json:"running"`
	EnabledWeekdays int    `json:"enabledWeekdays"`
}

// ManualLink is a persisted manual-download fallback bundle.
type ManualLink struct {
	Anime   string   `json:"anime"`
	Episode int      `json:"episode"`
	Links   []string `json:"links"`
}

// DownloadRunView is the UI-facing twin of a persisted download run.
type DownloadRunView struct {
	RunID              string       `json:"runId"`
	StartedAtMs        int64        `json:"startedAtMs"`
	FinishedAtMs       *int64       `json:"finishedAtMs,omitempty"`
	Trigger            string       `json:"trigger"`
	AnimesChecked      int          `json:"animesChecked"`
	EpisodesFound      int          `json:"episodesFound"`
	EpisodesDownloaded int          `json:"episodesDownloaded"`
	EpisodesFailed     int          `json:"episodesFailed"`
	SkippedCount       int          `json:"skippedCount"`
	UpToDateCount      int          `json:"upToDateCount"`
	JDAvailable        bool         `json:"jdAvailable"`
	Status             string       `json:"status"`
	ErrorSummary       string       `json:"errorSummary,omitempty"`
	ManualLinks        []ManualLink `json:"manualLinks,omitempty"`
}

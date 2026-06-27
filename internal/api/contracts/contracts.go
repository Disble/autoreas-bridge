package contracts

import (
	"context"
	"errors"
	"time"
)

type MobileAnimeDay struct {
	Dia   string `json:"dia"`
	Orden int    `json:"orden"`
}

type MobileAnime struct {
	ID               string           `json:"_id"`
	Nombre           string           `json:"nombre"`
	Estado           int              `json:"estado"`
	NroCapVisto      float64          `json:"nrocapvisto"`
	TotalCap         *int             `json:"totalcap,omitempty"`
	Activo           int              `json:"activo"`
	PrimeraVez       int              `json:"primeravez"`
	Dias             []MobileAnimeDay `json:"dias"`
	Generos          []string         `json:"generos"`
	Tipo             *int             `json:"tipo,omitempty"`
	FechaUltCapVisto *int64           `json:"fechaUltCapVisto,omitempty"`
	FechaEstreno     *int64           `json:"fechaEstreno,omitempty"`
	FechaCreacion    *int64           `json:"fechaCreacion,omitempty"`
	FechaEliminacion *int64           `json:"fechaEliminacion,omitempty"`
	Portada          *string          `json:"portada,omitempty"`
	Pagina           *string          `json:"pagina,omitempty"`
	Carpeta          *string          `json:"carpeta,omitempty"`
	Estudios         *string          `json:"estudios,omitempty"`
	Origen           *string          `json:"origen,omitempty"`
	Duracion         *int             `json:"duracion,omitempty"`
	// ModifiedAt echoes the bridge-private OCC version token (SDD-30
	// ADR-30-1/30-5) so the mobile client can round-trip it back as
	// AnimePatch.Base on its next write. Always present (not a pointer):
	// pre-migration rows read back 0, which is itself a legitimate base
	// value (fast-forward path), so there is no "absent" state to model here.
	ModifiedAt int64 `json:"modified_at"`
}

type AnimeChange struct {
	ID            int64        `json:"-"`
	RecordID      string       `json:"record_id"`
	ChangeType    string       `json:"change_type"`
	ChangedFields []string     `json:"changed_fields"`
	Snapshot      *MobileAnime `json:"snapshot,omitempty"`
	Timestamp     int64        `json:"timestamp"`
}

type SyncingAnimeItem struct {
	AnimeID         string   `json:"animeId"`
	Title           string   `json:"title"`
	ChangeType      string   `json:"changeType"`
	PendingChanges  int      `json:"pendingChanges"`
	ChangedFields   []string `json:"changedFields"`
	ProgressCurrent *float64 `json:"progressCurrent,omitempty"`
	ProgressTotal   *int     `json:"progressTotal,omitempty"`
	LastChangedAtMs int64    `json:"lastChangedAtMs"`
	Activo          int      `json:"activo"`
}

type AnimeListItem struct {
	ID          string   `json:"id"`
	Nombre      string   `json:"nombre"`
	Estado      int      `json:"estado"`
	NroCapVisto float64  `json:"nrocapvisto"`
	TotalCap    *int     `json:"totalcap,omitempty"`
	Activo      int      `json:"activo"`
	Tipo        *int     `json:"tipo,omitempty"`
	Dias        []string `json:"dias"`
	Generos     []string `json:"generos"`
	// HasDownloadPage reports whether the legacy `pagina` field is present and
	// non-empty. Read-only anime-data-quality signal for the desktop AnimePanel
	// gap indicator (download-orchestration spec "Missing Pagina/Carpeta
	// Surfaced as Actionable State"). Deliberately does NOT expose the raw URL.
	HasDownloadPage bool `json:"hasDownloadPage"`
	// HasFolder reports whether the legacy `carpeta` field is present and
	// non-empty. Same read-only gap-indicator purpose as HasDownloadPage;
	// deliberately does NOT expose the raw filesystem path.
	HasFolder bool `json:"hasFolder"`
}

type AnimeLegacyPullResult struct {
	Status       string `json:"status"`
	Message      string `json:"message"`
	UpdatedCount int    `json:"updatedCount"`
	PrunedCount  int    `json:"prunedCount"`
	WarningCount int    `json:"warningCount"`
}

type ReconcileRequest struct {
	DeviceID          string             `json:"device_id"`
	LastChangelogID   int64              `json:"last_changelog_id"`
	PendingOperations []PendingOperation `json:"pending_operations"`
}

type PendingOperation struct {
	AnimeID   string         `json:"anime_id"`
	Operation string         `json:"operation"`
	Payload   map[string]any `json:"payload"`
	CreatedAt int64          `json:"created_at"`
}

type AppliedOperation struct {
	AnimeID   string `json:"anime_id"`
	Operation string `json:"operation"`
	Applied   bool   `json:"applied"`
}

type ReconcileResponse struct {
	Status            string             `json:"status"`
	LastChangelogID   int64              `json:"last_changelog_id"`
	AppliedOperations []AppliedOperation `json:"applied_operations"`
	BridgeChanges     []AnimeChange      `json:"bridge_changes"`
	Conflicts         []any              `json:"conflicts"`
}

type DeviceInfo struct {
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name"`
	PairedAtMs int64  `json:"paired_at_ms"`
}

type ConflictInfo struct {
	ConflictID         string `json:"conflict_id"`
	AnimeID            string `json:"anime_id"`
	DetectedAtMs       int64  `json:"detected_at_ms"`
	Status             string `json:"status"`
	LocalSnapshotJSON  []byte `json:"local_snapshot_json,omitempty"`
	RemoteSnapshotJSON []byte `json:"remote_snapshot_json,omitempty"`
}

// ConflictRecord is the write-side DTO for a detected non-blocking sync
// conflict (SDD-30 ADR-30-4): the bridge's currently-stored snapshot
// (LocalSnapshotJSON) and the divergent value the mobile client attempted to
// write (RemoteSnapshotJSON), both preserved verbatim for later manual
// resolution. Always inserted with status='pending' (resolution happens via
// ConflictService.ResolveConflict, out of scope for SDD-30 per design.md).
type ConflictRecord struct {
	ConflictID         string
	AnimeID            string
	LocalSnapshotJSON  []byte
	RemoteSnapshotJSON []byte
	DetectedAtMs       int64
}

type StatusInfo struct {
	Status          string `json:"status"`
	LastChangelogID int64  `json:"last_changelog_id"`
	LastChangedAtMs *int64 `json:"last_changed_at_ms,omitempty"`
	ServerAddress   string `json:"server_address,omitempty"`
}

var ErrAnimeNotFound = errors.New("anime not found")

type AnimePatch struct {
	Estado           *int     `json:"estado,omitempty"`
	NroCapVisto      *float64 `json:"nrocapvisto,omitempty"`
	FechaUltCapVisto *int64   `json:"fechaUltCapVisto,omitempty"`
	Dias             []string `json:"dias,omitempty"`
	// Base is the mobile client's last-known modified_at OCC token (SDD-30,
	// ADR-30-2/30-5). nil distinguishes "old client sent nothing" from an
	// explicit base value (including 0) -- see WriteService.PatchAnime's gate.
	Base *int64 `json:"base,omitempty"`
}

type EffectiveAnime struct {
	ID           string
	TotalCap     *float64
	Activo       *bool
	SnapshotJSON []byte
}

type AnimeQueryService interface {
	GetEffectiveAnime(ctx context.Context, id string) (*EffectiveAnime, error)
	ListMobileAnimes(ctx context.Context) ([]MobileAnime, error)
	GetMobileAnime(ctx context.Context, id string) (*MobileAnime, error)
	ListAnimeItems(ctx context.Context) ([]AnimeListItem, error)
}

type AnimeWriteService interface {
	PatchAnime(ctx context.Context, id string, patch AnimePatch) error
}

type SyncTriggerService interface {
	TriggerReconcile(ctx context.Context) error
	ListChangesSince(ctx context.Context, sinceMs int64) ([]AnimeChange, int64, error)
	ListChangesAfterID(ctx context.Context, lastID int64) ([]AnimeChange, int64, error)
	LastChangedAt(ctx context.Context) (*int64, error)
}

type StatusService interface {
	GetStatus(ctx context.Context) (StatusInfo, error)
}

type DeviceAdminService interface {
	ListDevices(ctx context.Context) ([]DeviceInfo, error)
	RevokeDevice(ctx context.Context, id string) error
}

type ConflictService interface {
	ListConflicts(ctx context.Context) ([]ConflictInfo, error)
	ResolveConflict(ctx context.Context, id string, at time.Time) error
}

// HosterPriorityItem mirrors a single download_hoster_priority row at the App/Wails boundary
// (SDD-28 design.md §3.6/§4, PR4b Phase 6). It is the contracts-layer twin of
// download.HosterPriorityEntry -- defined separately here so internal/api/contracts never
// imports internal/download (composition root only wires the two together in app.go).
type HosterPriorityItem struct {
	Hoster   string `json:"hoster"`
	Priority int    `json:"priority"`
	Enabled  bool   `json:"enabled"`
}

// DownloadConfig is the read-model the frontend uses to render the download settings screen
// (SDD-28 design.md §4.3/§7, PR4b Phase 6): JD config (password never in cleartext), schedule
// config, and the per-site hoster priority ordering.
type DownloadConfig struct {
	JD             JDStatus             `json:"jd"`
	Schedule       ScheduleConfig       `json:"schedule"`
	HosterPriority []HosterPriorityItem `json:"hosterPriority"`
}

// JDStatus is the UI-facing view of MyJDownloader connectivity/config (SDD-28 design.md §4.3,
// PoC #12 quirk: ListDevices, not Connect, is the only liveness proof). The password is NEVER
// exposed in cleartext -- HasPassword is the only signal the UI ever sees.
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

// JDConfigInput is the write-model SetJDConfig accepts from the UI. PlaintextPassword is a
// pointer so the UI can edit email/device without re-entering the password (nil leaves the
// existing encrypted blob untouched, design §4.3 "edit email/device without re-entering
// password").
type JDConfigInput struct {
	Email             string  `json:"email"`
	PlaintextPassword *string `json:"plaintextPassword,omitempty"`
	DeviceName        string  `json:"deviceName"`
	ExePathOverride   string  `json:"exePathOverride"`
	DefaultDestDir    string  `json:"defaultDestDir"`
}

// ScheduleConfig is the UI-facing twin of download.ScheduleConfig (SDD-28 design.md §3.5/§3.6).
// EnabledWeekdays is a 7-bit mask (bit0=Sunday..bit6=Saturday; all-days=127) restricting which
// weekdays the scheduler may fire on (SDD download-schedule-weekdays design "Weekday encoding").
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

// ManualLink mirrors download.ManualLink at the App/Wails boundary (jd_offline degradation,
// design.md §8 "Manual-links persistence for JD-offline").
type ManualLink struct {
	Anime   string   `json:"anime"`
	Episode int      `json:"episode"`
	Links   []string `json:"links"`
}

// DownloadRunView is the UI-facing twin of download.DownloadRun (SDD-28 design.md §4/§8 run
// lifecycle and status taxonomy). FinishedAtMs is a pointer so the UI can distinguish a still-
// running row (nil) from a terminal one.
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
	JDAvailable        bool         `json:"jdAvailable"`
	Status             string       `json:"status"`
	ErrorSummary       string       `json:"errorSummary,omitempty"`
	ManualLinks        []ManualLink `json:"manualLinks,omitempty"`
}

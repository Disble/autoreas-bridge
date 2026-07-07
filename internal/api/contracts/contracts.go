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

// MobileRepeticion is a single repetition-history entry surfaced on
// MobileAnime.Repetir (Anime Detail spec, "Typed Repetir Field on Legacy
// Anime Raw"). Fecha* fields are pointers (millis, omitempty) so an absent
// or null legacy date degrades to a distinguishable "no value" rather than a
// zero-time sentinel.
type MobileRepeticion struct {
	NumRepeticion    int     `json:"numrepeticion"`
	NroCapVisto      float64 `json:"nrocapvisto"`
	Estado           int     `json:"estado"`
	FechaCreacion    *int64  `json:"fechaCreacion,omitempty"`
	FechaEstreno     *int64  `json:"fechaEstreno,omitempty"`
	FechaUltCapVisto *int64  `json:"fechaUltCapVisto,omitempty"`
	FechaEliminacion *int64  `json:"fechaEliminacion,omitempty"`
	FechaRepeticion  *int64  `json:"fechaRepeticion,omitempty"`
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
	// Repetir is the typed repetition-history timeline (Anime Detail spec,
	// "AnimeDetail DTO and GetAnimeDetail Binding"). omitempty keeps the
	// majority of records (no repetition history) byte-identical on the
	// mobile feed. Detail-only concern: NOT surfaced on the slim
	// AnimeListItem.
	Repetir []MobileRepeticion `json:"repetir,omitempty"`
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

// AnimeHistoryItem is the slim History read-model row (Anime History spec,
// "History Read Model"): a watch-activity log entry equivalent to Legacy
// "Historial", distinct from the download-gap-focused AnimeListItem.
// Membership (a present FechaUltCapVisto) and DESC ordering by it are
// enforced server-side by AnimeQueryService.ListAnimeHistory, never in the
// frontend.
type AnimeHistoryItem struct {
	ID          string  `json:"id"`
	Nombre      string  `json:"nombre"`
	NroCapVisto float64 `json:"nrocapvisto"`
	// FechaUltCapVisto is epoch millis, always present by membership (rows
	// without it are excluded, never zero-valued here).
	FechaUltCapVisto int64 `json:"fechaUltCapVisto"`
	Estado           int   `json:"estado"`
	// Tipo and FechaCreacion (epoch millis) are additive projections from the
	// same MobileAnime normalization ListAnimeHistory already uses (sdd-37
	// D1): nil when absent from the legacy source, never zero-valued.
	Tipo          *int   `json:"tipo,omitempty"`
	FechaCreacion *int64 `json:"fechaCreacion,omitempty"`
}

type AnimeDetailProgress struct {
	Watched   float64  `json:"watched"`
	Total     *int     `json:"total,omitempty"`
	Remaining *float64 `json:"remaining,omitempty"`
}

type AnimeDetailDates struct {
	Created     *int64 `json:"created,omitempty"`
	FirstWatch  *int64 `json:"firstWatch,omitempty"`
	LastWatched *int64 `json:"lastWatched,omitempty"`
	Deleted     *int64 `json:"deleted,omitempty"`
}

type AnimeDetailContent struct {
	Tipo     *int     `json:"tipo,omitempty"`
	Duracion *int     `json:"duracion,omitempty"`
	Generos  []string `json:"generos"`
	Studios  *string  `json:"studios,omitempty"`
	Origen   *string  `json:"origen,omitempty"`
	Cover    *string  `json:"cover,omitempty"`
}

type AnimeDetailDownload struct {
	Page   *string `json:"page,omitempty"`
	Folder *string `json:"folder,omitempty"`
}

type AnimeDetail struct {
	ID         string              `json:"id"`
	Nombre     string              `json:"nombre"`
	Estado     int                 `json:"estado"`
	Activo     int                 `json:"activo"`
	PrimeraVez int                 `json:"primeravez"`
	Progress   AnimeDetailProgress `json:"progress"`
	Schedule   []MobileAnimeDay    `json:"schedule"`
	Dates      AnimeDetailDates    `json:"dates"`
	Content    AnimeDetailContent  `json:"content"`
	Download   AnimeDetailDownload `json:"download"`
	ModifiedAt int64               `json:"modified_at"`
}

type ChapterScheduleItem struct {
	AnimeID     string  `json:"animeId"`
	AnimeName   string  `json:"animeName"`
	Estado      int     `json:"estado"`
	NroCapVisto float64 `json:"nrocapvisto"`
	TotalCap    *int    `json:"totalcap,omitempty"`
	Day         string  `json:"day"`
	DayOrder    int     `json:"dayOrder"`
	ModifiedAt  int64   `json:"modified_at"`
	// FolderPath/PageURL are the literal carpeta/pagina strings (chapters-
	// cover-pipeline spec, "ChapterScheduleItem contract carries cover and
	// literal path fields"). They REPLACE the former HasPage/HasFolder
	// booleans -- presence is re-derived client-side as `string !== ''`,
	// avoiding two sources of truth for the same fact. Empty when the
	// legacy source field is absent or empty.
	FolderPath string `json:"folderPath,omitempty"`
	PageURL    string `json:"pageUrl,omitempty"`
	// HasCover gates the frontend's lazy GetAnimeCover call: true when the
	// anime's portada classifies as anything other than cover.KindAbsent.
	HasCover     bool   `json:"hasCover"`
	LastWatched  *int64 `json:"lastWatched,omitempty"`
	FirstWatched *int64 `json:"firstWatched,omitempty"`
}

// CoverSourceCover/CoverSourcePlaceholder are the two values AnimeCover.Source
// may take (chapters-cover-pipeline spec, "Cover resolution follows a
// deterministic, placeholder-first order").
const (
	CoverSourceCover       = "cover"
	CoverSourcePlaceholder = "placeholder"
)

// AnimeCover is the GetAnimeCover binding's response DTO: either resolved
// cover bytes as a base64 data-URL (Source == CoverSourceCover) or an
// explicit placeholder signal (Source == CoverSourcePlaceholder, DataURL
// omitted). Never an error -- a missing/unresolvable cover is a normal,
// expected outcome, not an exceptional one.
type AnimeCover struct {
	DataURL string `json:"dataUrl,omitempty"`
	Source  string `json:"source"`
}

// ChapterDayCount is a single weekday's active-progress badge count
// (chapters-cover-pipeline spec, "Per-day active-progress count mirrors
// Legacy's buscarMedalla semantics").
type ChapterDayCount struct {
	Day   string `json:"day"`
	Count int    `json:"count"`
}

type ChapterCommandResult struct {
	Status        string  `json:"status"`
	Message       string  `json:"message,omitempty"`
	AnimeID       string  `json:"animeId,omitempty"`
	AnimeName     string  `json:"animeName,omitempty"`
	Estado        int     `json:"estado,omitempty"`
	NroCapVisto   float64 `json:"nrocapvisto,omitempty"`
	OccurredAtMs  int64   `json:"occurredAtMs,omitempty"`
	CorrelationID string  `json:"correlationId,omitempty"`
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
	DeviceID               string `json:"device_id"`
	DeviceName             string `json:"device_name"`
	PairedAtMs             int64  `json:"paired_at_ms"`
	LastSeenAtMs           int64  `json:"last_seen_at_ms"`
	LastAckChangelogID     int64  `json:"last_ack_changelog_id"`
	SyncStatus             string `json:"sync_status"`
	ConnectionStatus       string `json:"connection_status"`
	AuthState              string `json:"auth_state"`
	BlocksChangelogPruning bool   `json:"blocks_changelog_pruning"`
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
	// SeasonMode echoes the bridge-owned global season-mode flag so a mobile
	// client can hydrate its global season-mode state on a cold GET /api/status
	// read. Always present: false is the canonical default (matches the
	// preferences store missing-row sentinel), so there is no "absent" state.
	SeasonMode bool `json:"season_mode"`
}

var ErrAnimeNotFound = errors.New("anime not found")

type AnimePatch struct {
	Estado                *int     `json:"estado,omitempty"`
	NroCapVisto           *float64 `json:"nrocapvisto,omitempty"`
	Activo                *bool    `json:"activo,omitempty"`
	FechaUltCapVisto      *int64   `json:"fechaUltCapVisto,omitempty"`
	FechaEstreno          *int64   `json:"fechaEstreno,omitempty"`
	FechaEliminacion      *int64   `json:"fechaEliminacion,omitempty"`
	RepeatAt              *int64   `json:"repeatAt,omitempty"`
	ClearFechaEliminacion bool     `json:"clearFechaEliminacion,omitempty"`
	PreserveLastWatched   bool     `json:"-"`
	Dias                  []string `json:"dias,omitempty"`
	// DiasOrdered replaces the dias[] array with explicit {dia, orden} entries
	// (the SDD-46 weekday scheduler). Internal-only (not on the mobile wire); when
	// set it takes precedence over Dias. Reuses MobileAnimeDay for {dia, orden}.
	DiasOrdered []MobileAnimeDay `json:"-"`
	// Base is the mobile client's last-known modified_at OCC token (SDD-30,
	// ADR-30-2/30-5). nil distinguishes "old client sent nothing" from an
	// explicit base value (including 0) -- see WriteService.PatchAnime's gate.
	Base *int64 `json:"base,omitempty"`
}

// AnimeCreate is the input for creating a brand-new anime (SDD-43). A new anime
// lands with estado 0 (Viendo), nrocapvisto 0, activo true, primeravez true, and
// a single dias entry in Section at Orden. ID is optional — generated when empty.
type AnimeCreate struct {
	ID           string `json:"id,omitempty"`
	Nombre       string `json:"nombre"`
	Pagina       string `json:"pagina"`
	Section      string `json:"section"`
	Orden        int    `json:"orden"`
	Tipo         *int   `json:"tipo,omitempty"`
	FechaEstreno *int64 `json:"fechaEstreno,omitempty"`
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
	ListAnimeHistory(ctx context.Context) ([]AnimeHistoryItem, error)
	GetAnimeDetail(ctx context.Context, id string) (*AnimeDetail, error)
}

type AnimeWriteService interface {
	PatchAnime(ctx context.Context, id string, patch AnimePatch) error
}

type SyncTriggerService interface {
	TriggerReconcile(ctx context.Context) error
	ListChangesSince(ctx context.Context, sinceMs int64) ([]AnimeChange, int64, error)
	ListChangesAfterID(ctx context.Context, lastID int64) ([]AnimeChange, int64, error)
	AcknowledgeDevice(ctx context.Context, deviceID string, lastChangelogID int64) error
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
	RunID              string `json:"runId"`
	StartedAtMs        int64  `json:"startedAtMs"`
	FinishedAtMs       *int64 `json:"finishedAtMs,omitempty"`
	Trigger            string `json:"trigger"`
	AnimesChecked      int    `json:"animesChecked"`
	EpisodesFound      int    `json:"episodesFound"`
	EpisodesDownloaded int    `json:"episodesDownloaded"`
	EpisodesFailed     int    `json:"episodesFailed"`
	SkippedCount       int    `json:"skippedCount"`
	// UpToDateCount is the subset of AnimesChecked that needed no download (nothing newer
	// online than on-disk, or the season already complete on disk) -- distinct from a skip.
	UpToDateCount int          `json:"upToDateCount"`
	JDAvailable   bool         `json:"jdAvailable"`
	Status        string       `json:"status"`
	ErrorSummary  string       `json:"errorSummary,omitempty"`
	ManualLinks   []ManualLink `json:"manualLinks,omitempty"`
}

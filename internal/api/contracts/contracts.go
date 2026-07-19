package contracts

// MobileAnimeDay describes an ordered legacy schedule placement.
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

// MobileAnime is the full mobile-facing anime projection.
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

// AnimeChange records one bridge change available for synchronization.
type AnimeChange struct {
	ID            int64        `json:"-"`
	RecordID      string       `json:"record_id"`
	ChangeType    string       `json:"change_type"`
	ChangedFields []string     `json:"changed_fields"`
	Snapshot      *MobileAnime `json:"snapshot,omitempty"`
	Timestamp     int64        `json:"timestamp"`
}

// SyncingAnimeItem summarizes an anime with pending synchronization work.
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

// AnimeListItem is the slim anime-list read model.
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

// AnimeDetailProgress contains watched, total, and remaining episode counts.
type AnimeDetailProgress struct {
	Watched   float64  `json:"watched"`
	Total     *int     `json:"total,omitempty"`
	Remaining *float64 `json:"remaining,omitempty"`
}

// AnimeDetailDates contains the anime lifecycle timestamps.
type AnimeDetailDates struct {
	Created     *int64 `json:"created,omitempty"`
	FirstWatch  *int64 `json:"firstWatch,omitempty"`
	LastWatched *int64 `json:"lastWatched,omitempty"`
	Deleted     *int64 `json:"deleted,omitempty"`
}

// AnimeDetailContent contains descriptive metadata for an anime.
type AnimeDetailContent struct {
	Tipo     *int     `json:"tipo,omitempty"`
	Duracion *int     `json:"duracion,omitempty"`
	Generos  []string `json:"generos"`
	Studios  *string  `json:"studios,omitempty"`
	Origen   *string  `json:"origen,omitempty"`
	Cover    *string  `json:"cover,omitempty"`
}

// AnimeDetailDownload contains optional download source metadata.
type AnimeDetailDownload struct {
	Page   *string `json:"page,omitempty"`
	Folder *string `json:"folder,omitempty"`
}

// AnimeDetail is the detailed anime read model.
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

// EpisodeScheduleItem is an anime scheduled for an episode workflow.
type EpisodeScheduleItem struct {
	AnimeID     string  `json:"animeId"`
	AnimeName   string  `json:"animeName"`
	Estado      int     `json:"estado"`
	NroCapVisto float64 `json:"nrocapvisto"`
	TotalCap    *int    `json:"totalcap,omitempty"`
	Day         string  `json:"day"`
	DayOrder    int     `json:"dayOrder"`
	ModifiedAt  int64   `json:"modified_at"`
	// FolderPath/PageURL are the literal carpeta/pagina strings (chapters-
	// cover-pipeline spec, "EpisodeScheduleItem contract carries cover and
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

// EpisodeDayCount is a single weekday's active-progress badge count
// (chapters-cover-pipeline spec, "Per-day active-progress count mirrors
// Legacy's buscarMedalla semantics").
type EpisodeDayCount struct {
	Day   string `json:"day"`
	Count int    `json:"count"`
}

// EpisodeCommandResult reports the result of an episode command.
type EpisodeCommandResult struct {
	Status        string  `json:"status"`
	Message       string  `json:"message,omitempty"`
	AnimeID       string  `json:"animeId,omitempty"`
	Outcome       string  `json:"outcome,omitempty"`
	ModifiedAt    int64   `json:"modifiedAt"`
	ConflictID    string  `json:"conflictId,omitempty"`
	AnimeName     string  `json:"animeName,omitempty"`
	Estado        int     `json:"estado,omitempty"`
	NroCapVisto   float64 `json:"nrocapvisto,omitempty"`
	OccurredAtMs  int64   `json:"occurredAtMs,omitempty"`
	CorrelationID string  `json:"correlationId,omitempty"`
}

// AnimeLegacyPullResult summarizes a pull from the legacy source.
type AnimeLegacyPullResult struct {
	Status       string `json:"status"`
	Message      string `json:"message"`
	UpdatedCount int    `json:"updatedCount"`
	PrunedCount  int    `json:"prunedCount"`
	WarningCount int    `json:"warningCount"`
}

// ActiveSeasonSnapshot is the read-model mobile pulls from GET /api/seasons/active
// (SDD-44 season sync) to learn the bridge-declared candidate set and their premiere
// grades. Only rows already linked to a real anime (AnimeID != "") are candidates.
// A nil snapshot (no open season) is surfaced as HTTP 404, which mobile reads as
// "no active season".
type ActiveSeasonSnapshot struct {
	SeasonID   string                  `json:"season_id"`
	Candidates []ActiveSeasonCandidate `json:"candidates"`
}

// ActiveSeasonCandidate is one linked season anime on the mobile snapshot. Grade is
// a pointer so an ungraded candidate serializes as an explicit null (mobile reads
// null as "no bridge grade yet"). GradeSource is the literal "bridge" marker when a
// grade is present, omitted otherwise — mobile only distinguishes bridge-owned from
// absent, never the internal manual/mobile_sync provenance.
type ActiveSeasonCandidate struct {
	AnimeID     string `json:"anime_id"`
	Grade       *int   `json:"grade"`
	GradeSource string `json:"grade_source,omitempty"`
}

// ReconcileRequest contains a device cursor and its pending operations.
type ReconcileRequest struct {
	DeviceID          string             `json:"device_id"`
	LastChangelogID   int64              `json:"last_changelog_id"`
	PendingOperations []PendingOperation `json:"pending_operations"`
}

// PendingOperation is one device operation waiting for reconciliation.
type PendingOperation struct {
	AnimeID   string         `json:"anime_id"`
	Operation string         `json:"operation"`
	Payload   map[string]any `json:"payload"`
	CreatedAt int64          `json:"created_at"`
}

// AppliedOperation reports whether a pending operation was applied.
type AppliedOperation struct {
	AnimeID   string `json:"anime_id"`
	Operation string `json:"operation"`
	Applied   bool   `json:"applied"`
}

// ReconcileResponse returns reconciliation outcomes and bridge changes.
type ReconcileResponse struct {
	Status            string             `json:"status"`
	LastChangelogID   int64              `json:"last_changelog_id"`
	AppliedOperations []AppliedOperation `json:"applied_operations"`
	BridgeChanges     []AnimeChange      `json:"bridge_changes"`
	Conflicts         []any              `json:"conflicts"`
}

// DeviceInfo is the synchronization status of a paired device.
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

// ConflictInfo is a persisted synchronization conflict read model.
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

// StatusInfo reports the current bridge status.
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

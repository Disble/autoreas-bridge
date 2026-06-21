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
	ID          string  `json:"id"`
	Nombre      string  `json:"nombre"`
	Estado      int     `json:"estado"`
	NroCapVisto float64 `json:"nrocapvisto"`
	TotalCap    *int    `json:"totalcap,omitempty"`
	Activo      int     `json:"activo"`
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
	ConflictID   string `json:"conflict_id"`
	AnimeID      string `json:"anime_id"`
	DetectedAtMs int64  `json:"detected_at_ms"`
	Status       string `json:"status"`
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

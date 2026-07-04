package anime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

type snapshotLookup interface {
	GetSnapshot(ctx context.Context, animeID string) (SnapshotRecord, error)
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
}

type snapshotBaselineReplacer interface {
	ReplaceBaseline(ctx context.Context, current map[string]SnapshotRecord, pruneIDs []string) error
}

type QueryService struct {
	store snapshotLookup
}

type AnimeWriter interface {
	RequestWrite(ctx context.Context, animeID string, payload []byte) error
}

// ConflictWriter is the SDD-30 ADR-30-4 port for persisting a detected
// non-blocking sync conflict. Mirrors download.ServiceDeps' port-injection
// pattern: nil means "skip" (no-op), never a panic.
type ConflictWriter interface {
	InsertConflict(ctx context.Context, c contracts.ConflictRecord) error
}

// WriteServiceDeps are the Phase 4 (ADR-30-4) optional construction seams for
// WriteService, mirroring download.ServiceDeps. All fields are nil-safe:
// a zero-value WriteServiceDeps (the default before SetDeps is ever called)
// preserves WriteService's pre-Phase-4 behavior exactly.
type WriteServiceDeps struct {
	// Conflicts persists detected divergences (nil = skip persistence).
	Conflicts ConflictWriter
	// Notifier surfaces a user-notable moment for a detected divergence
	// (nil = no-op).
	Notifier notification.Notifier
	// Logger receives failure-isolation diagnostics when Conflicts/Notifier
	// error (nil = silently dropped, matching other optional-logger seams).
	Logger logger.Logger
	// OCCObserveOnly is the staged-rollout lever (design.md section 6): when
	// true, a divergence is logged-only and applies last-call-wins (no
	// InsertConflict, no Notify). Default false (full enforcement).
	OCCObserveOnly bool
}

type WriteService struct {
	store  snapshotLookup
	writer AnimeWriter
	now    func() time.Time
	deps   WriteServiceDeps
}

func NewQueryService(store snapshotLookup) *QueryService {
	return &QueryService{store: store}
}

func NewWriteService(store snapshotLookup, writer AnimeWriter) *WriteService {
	return &WriteService{store: store, writer: writer, now: time.Now}
}

func (s *WriteService) SetNow(now func() time.Time) {
	s.now = now
}

// SetDeps wires the Phase 4 (ADR-30-4) optional conflict-writer/notifier/
// observe-only deps. Mirrors the existing SetNow setter convention rather
// than widening NewWriteService's signature, so every pre-Phase-4 call site
// keeps compiling unmodified (design.md section 4 "keep NewWriteService(store,
// writer) working").
func (s *WriteService) SetDeps(deps WriteServiceDeps) {
	s.deps = deps
}

func (s *QueryService) GetEffectiveAnime(ctx context.Context, id string) (*contracts.EffectiveAnime, error) {
	record, err := s.store.GetSnapshot(ctx, id)
	if err != nil {
		return nil, err
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(record.CanonicalJSON, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal snapshot %q: %w", id, err)
	}

	var activo *bool
	switch raw.Activo.TriState() {
	case domain.TriStateTrue:
		value := true
		activo = &value
	case domain.TriStateFalse:
		value := false
		activo = &value
	}

	return &contracts.EffectiveAnime{
		ID:           raw.ID,
		TotalCap:     raw.TotalCapValue(),
		Activo:       activo,
		SnapshotJSON: append([]byte(nil), record.CanonicalJSON...),
	}, nil
}

func (s *QueryService) ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error) {
	records, err := s.store.ListSnapshots(ctx)
	if err != nil {
		return nil, err
	}
	ids := sortedSnapshotIDs(records)
	result := make([]contracts.MobileAnime, 0, len(ids))
	for _, id := range ids {
		item, err := mobileAnimeFromSnapshot(records[id].CanonicalJSON, records[id].ModifiedAt)
		if err != nil {
			return nil, fmt.Errorf("normalize snapshot %q: %w", id, err)
		}
		result = append(result, item)
	}
	return result, nil
}

func (s *QueryService) ListAnimeItems(ctx context.Context) ([]contracts.AnimeListItem, error) {
	records, err := s.store.ListSnapshots(ctx)
	if err != nil {
		return nil, err
	}
	ids := sortedSnapshotIDs(records)
	result := make([]contracts.AnimeListItem, 0, len(ids))
	for _, id := range ids {
		item, err := mobileAnimeFromSnapshot(records[id].CanonicalJSON, records[id].ModifiedAt)
		if err != nil {
			return nil, fmt.Errorf("normalize snapshot %q: %w", id, err)
		}
		result = append(result, contracts.AnimeListItem{
			ID:              item.ID,
			Nombre:          item.Nombre,
			Estado:          item.Estado,
			NroCapVisto:     item.NroCapVisto,
			TotalCap:        item.TotalCap,
			Activo:          item.Activo,
			Tipo:            item.Tipo,
			Dias:            extractDayNames(item.Dias),
			Generos:         item.Generos,
			HasDownloadPage: hasNonEmptyLegacyString(item.Pagina),
			HasFolder:       hasNonEmptyLegacyString(item.Carpeta),
		})
	}
	return result, nil
}

// hasNonEmptyLegacyString reports whether a legacy optional string field (e.g.
// MobileAnime.Pagina/Carpeta) is present and non-empty. Mirrors the same
// nil-or-empty presence check already used by the download decision engine
// (internal/download/decision.go) so the AnimePanel gap indicator and the
// download skip logic agree on what counts as "missing".
func hasNonEmptyLegacyString(value *string) bool {
	return value != nil && *value != ""
}

func extractDayNames(days []contracts.MobileAnimeDay) []string {
	if len(days) == 0 {
		return []string{}
	}
	result := make([]string, 0, len(days))
	for _, day := range days {
		result = append(result, day.Dia)
	}
	return result
}

func (s *QueryService) GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error) {
	record, err := s.store.GetSnapshot(ctx, id)
	if err != nil {
		return nil, err
	}
	item, err := mobileAnimeFromSnapshot(record.CanonicalJSON, record.ModifiedAt)
	if err != nil {
		return nil, fmt.Errorf("normalize snapshot %q: %w", id, err)
	}
	return &item, nil
}

func (s *QueryService) GetAnimeDetail(ctx context.Context, id string) (*contracts.AnimeDetail, error) {
	item, err := s.GetMobileAnime(ctx, id)
	if err != nil {
		return nil, err
	}

	return animeDetailFromMobile(*item), nil
}

func animeDetailFromMobile(item contracts.MobileAnime) *contracts.AnimeDetail {
	return &contracts.AnimeDetail{
		ID:         item.ID,
		Nombre:     item.Nombre,
		Estado:     item.Estado,
		Activo:     item.Activo,
		PrimeraVez: item.PrimeraVez,
		Progress: contracts.AnimeDetailProgress{
			Watched:   item.NroCapVisto,
			Total:     item.TotalCap,
			Remaining: remainingChapters(item.NroCapVisto, item.TotalCap),
		},
		Schedule: item.Dias,
		Dates: contracts.AnimeDetailDates{
			Created:     item.FechaCreacion,
			FirstWatch:  item.FechaEstreno,
			LastWatched: item.FechaUltCapVisto,
			Deleted:     item.FechaEliminacion,
		},
		Content: contracts.AnimeDetailContent{
			Tipo:     item.Tipo,
			Duracion: item.Duracion,
			Generos:  item.Generos,
			Studios:  item.Estudios,
			Origen:   item.Origen,
			Cover:    item.Portada,
		},
		Download: contracts.AnimeDetailDownload{
			Page:   item.Pagina,
			Folder: item.Carpeta,
		},
		ModifiedAt: item.ModifiedAt,
	}
}

func remainingChapters(watched float64, total *int) *float64 {
	if total == nil {
		return nil
	}
	value := float64(*total) - watched
	return &value
}

func (s *WriteService) PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) error {
	record, err := s.store.GetSnapshot(ctx, id)
	recordExists := true
	if err != nil {
		if !errors.Is(err, contracts.ErrAnimeNotFound) {
			return err
		}
		recordExists = false
	}

	var raw domain.LegacyAnimeRaw
	if recordExists {
		if err := json.Unmarshal(record.CanonicalJSON, &raw); err != nil {
			return fmt.Errorf("unmarshal snapshot %q: %w", id, err)
		}
	}

	desired := raw
	if patch.Estado != nil {
		desired.SetEstado(*patch.Estado)
	}
	if patch.NroCapVisto != nil {
		desired.SetNroCapVisto(*patch.NroCapVisto)
	}
	if patch.Activo != nil {
		desired.SetActivo(*patch.Activo)
	}
	if patch.Dias != nil {
		desired.SetDias(patch.Dias)
	}

	statePatch := domain.ApplyCompletionStateMachine(patch, desired.TotalCapValue())
	if statePatch.Estado != nil {
		desired.SetEstado(*statePatch.Estado)
	}

	if statePatch.FechaUltCapVisto != nil {
		desired.FechaUltCapVisto = domain.NewLegacyDateFieldFromUnixMilli(*statePatch.FechaUltCapVisto)
	} else if !patch.PreserveLastWatched {
		desired.StampServerTimestamp(s.nowFunc())
	}
	if patch.FechaEstreno != nil {
		desired.FechaEstreno = domain.NewLegacyDateFieldFromUnixMilli(*patch.FechaEstreno)
	}
	if patch.FechaEliminacion != nil {
		desired.SetFechaEliminacion(*patch.FechaEliminacion)
	}
	if patch.ClearFechaEliminacion {
		desired.ClearFechaEliminacion()
	}

	// SDD-30 ADR-30-2: the OCC gate. recordExists distinguishes "create" from
	// "existing record" for the base==nil branches; valueEqual lazily compares
	// canonical JSON only when needed (no-op idempotency guard, #4298 item 3).
	if recordExists {
		valueEqual, equalErr := s.patchValueEqualsCurrent(desired, record.CanonicalJSON)
		if equalErr != nil {
			return equalErr
		}

		switch {
		case valueEqual:
			// Blind retry w/ stale or absent base whose desired value already
			// matches current is NOT a conflict -- no write, no stamp.
			return nil
		case patch.Base == nil:
			// Old client, unverifiable base, but the record already exists and
			// the desired value differs -> safe path: never silent-overwrite.
			return s.recordDivergence(ctx, id, record.CanonicalJSON, desired)
		case *patch.Base != record.ModifiedAt:
			// base != current AND value differs -> DIVERGENCE (non-blocking).
			return s.recordDivergence(ctx, id, record.CanonicalJSON, desired)
		}
		// base == current.ModifiedAt -> fast-forward, fall through to apply.
	}
	// recordExists == false: base=nil (or any base) on a record the bridge
	// does not have yet is a legitimate create -> fall through to apply.

	payload, err := desired.MarshalJSON()
	if err != nil {
		return fmt.Errorf("marshal merged anime %q: %w", id, err)
	}

	return s.applyWrite(ctx, id, payload)
}

// patchValueEqualsCurrent reports whether desired's canonical JSON matches
// the current snapshot's canonical JSON byte-for-byte (SDD-30 ADR-30-2's
// no-op idempotency guard). Canonicalization mirrors parser.go's
// raw.MarshalJSON() so field-ordering differences never cause a false
// divergence.
func (s *WriteService) patchValueEqualsCurrent(desired domain.LegacyAnimeRaw, currentCanonicalJSON []byte) (bool, error) {
	desiredJSON, err := desired.MarshalJSON()
	if err != nil {
		return false, fmt.Errorf("marshal desired anime for value comparison: %w", err)
	}
	return string(desiredJSON) == string(currentCanonicalJSON), nil
}

// recordDivergence is the SDD-30 ADR-30-2/30-4 non-blocking conflict path:
// the write ALWAYS returns success to the caller (never blocks/clobbers
// mobile). When OCCObserveOnly is set, the divergence is logged only and
// applied last-call-wins (staged-rollout lever, design.md section 6).
// Otherwise the divergence is reported via the conflict writer + notifier
// (nil-safe no-op deps) and the current snapshot is left untouched.
func (s *WriteService) recordDivergence(ctx context.Context, id string, currentCanonicalJSON []byte, desired domain.LegacyAnimeRaw) error {
	desiredJSON, err := desired.MarshalJSON()
	if err != nil {
		return fmt.Errorf("marshal desired anime %q for conflict record: %w", id, err)
	}

	if s.deps.OCCObserveOnly {
		s.logf(logger.LevelInfo, "occ-observe-only: would-be conflict for anime %q applied last-call-wins (no InsertConflict/Notify)", id)
		return s.applyWrite(ctx, id, desiredJSON)
	}

	s.reportConflict(ctx, id, currentCanonicalJSON, desiredJSON)

	return nil
}

// reportConflict is the Phase 4 (ADR-30-4) seam: persists a pending conflict
// row and fires a notification, with MANDATORY failure isolation (neither
// error may fail or block the write -- the write already returned success by
// the time this seam exists, design.md section 4). INSERT happens before
// Notify. Nil Conflicts/Notifier deps degrade silently (no-op), matching the
// pre-Phase-4 default.
func (s *WriteService) reportConflict(ctx context.Context, id string, currentCanonicalJSON []byte, desiredJSON []byte) {
	if s.deps.Conflicts != nil {
		record := contracts.ConflictRecord{
			ConflictID:         newConflictID(id, s.nowFunc()),
			AnimeID:            id,
			LocalSnapshotJSON:  append([]byte(nil), currentCanonicalJSON...),
			RemoteSnapshotJSON: append([]byte(nil), desiredJSON...),
			DetectedAtMs:       s.nowFunc().UnixMilli(),
		}
		if err := s.deps.Conflicts.InsertConflict(ctx, record); err != nil {
			s.logf(logger.LevelError, "failed to insert conflict for anime %q: %v", id, err)
		}
	}

	if s.deps.Notifier != nil {
		// Notify failures must never fail the write (Notifier's own contract
		// already requires fan-out isolation internally; this call site
		// additionally never propagates the error to PatchAnime's caller).
		_ = s.deps.Notifier.Notify(ctx, notification.Notification{
			Title:         "Sync conflict detected",
			Body:          fmt.Sprintf("Anime %q was changed on two devices at once; both versions were kept.", id),
			Level:         notification.LevelWarning,
			Source:        "sync",
			CorrelationID: id,
			Timestamp:     s.nowFunc(),
		})
	}
}

// applyWrite performs the actual durable write + confirmed-snapshot update
// for a given desired payload. Extracted so the OCCObserveOnly last-call-wins
// path (recordDivergence) and the normal fast-forward/create path
// (PatchAnime) share the exact same write sequence.
func (s *WriteService) applyWrite(ctx context.Context, id string, payload []byte) error {
	if s.writer == nil {
		return fmt.Errorf("anime writer is required")
	}

	if err := s.writer.RequestWrite(ctx, id, payload); err != nil {
		return err
	}

	return s.updateConfirmedSnapshot(ctx, id, payload)
}

// nowFunc returns the configured clock's current reading, defaulting to
// time.Now when unset.
func (s *WriteService) nowFunc() time.Time {
	return s.nowFuncForToken()()
}

// nowFuncForToken returns the configured clock itself (not yet invoked),
// defaulting to time.Now when unset. Needed by stampModifiedAt, which takes
// a func() time.Time rather than a time.Time value.
func (s *WriteService) nowFuncForToken() func() time.Time {
	if s.now == nil {
		return time.Now
	}
	return s.now
}

// logf is a nil-safe wrapper around the optional WriteServiceDeps.Logger,
// using the "anime" domain to match the rest of this package's log call
// sites once wired (mirrors download.Service.logf's nil-degrades-silently
// pattern).
func (s *WriteService) logf(level string, format string, args ...any) {
	if s.deps.Logger == nil {
		return
	}
	switch level {
	case logger.LevelError:
		s.deps.Logger.Errorf("anime", format, args...)
	default:
		s.deps.Logger.Warnf("anime", format, args...)
	}
}

// newConflictID derives a deterministic-enough conflict_id (conflicts.
// conflict_id is the table's primary key) from the anime id and detection
// instant. Collisions are astronomically unlikely (millisecond resolution)
// and, per ConflictStore.InsertConflict, a collision fails loudly rather than
// silently overwriting -- acceptable here since this path is already
// failure-isolated end to end.
func newConflictID(animeID string, at time.Time) string {
	return fmt.Sprintf("%s-%d", animeID, at.UnixMilli())
}

func (s *WriteService) updateConfirmedSnapshot(ctx context.Context, id string, payload []byte) error {
	replacer, ok := s.store.(snapshotBaselineReplacer)
	if !ok {
		return nil
	}

	records, err := s.store.ListSnapshots(ctx)
	if err != nil {
		return fmt.Errorf("list snapshots after confirmed write %q: %w", id, err)
	}

	now := s.nowFuncForToken()
	prevModifiedAt := records[id].ModifiedAt

	records[id] = SnapshotRecord{
		AnimeID:       id,
		CanonicalJSON: append([]byte(nil), payload...),
		Hash:          HashSnapshot(payload),
		ModifiedAt:    stampModifiedAt(prevModifiedAt, now),
	}
	if err := replacer.ReplaceBaseline(ctx, records, nil); err != nil {
		return fmt.Errorf("replace confirmed snapshot %q: %w", id, err)
	}

	return nil
}

var _ contracts.AnimeQueryService = (*QueryService)(nil)
var _ contracts.AnimeWriteService = (*WriteService)(nil)

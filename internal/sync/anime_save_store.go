package sync

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/persistence"
)

// AnimeSaveStore runs every anime save as one SQLite write transaction: it
// loads, lets each item decide, applies the save rule, upserts the snapshot
// with its name key and stores the changelog row, then publishes after the
// commit. It writes nothing to anime_write_operations or the outbox.
type AnimeSaveStore struct {
	db  *sql.DB
	now func() time.Time
	// recordChangelog stores one changelog row inside the save transaction.
	recordChangelog func(context.Context, persistence.Querier, ChangelogEntry) error
}

// NewAnimeSaveStore builds the save store over the shared bridge database.
func NewAnimeSaveStore(db *sql.DB) *AnimeSaveStore {
	return &AnimeSaveStore{db: db, now: time.Now, recordChangelog: recordPendingTx}
}

// CommitSave implements anime.SaveStore.
func (s *AnimeSaveStore) CommitSave(ctx context.Context, plan anime.SavePlan) ([]anime.SaveDecision, error) {
	var decisions []anime.SaveDecision
	var changed []anime.ChangedOutboxEvent
	err := persistence.InWriteTx(ctx, s.db, func(q persistence.Querier) error {
		var err error
		if decisions, err = decideSaveItems(ctx, q, plan.Items); err != nil {
			return err
		}
		if slices.ContainsFunc(decisions, func(d anime.SaveDecision) bool { return d.Outcome == anime.SaveOutcomeConflict }) {
			return nil
		}
		changed, err = s.applyDecisions(ctx, q, plan, decisions)
		return err
	})
	if err != nil {
		return nil, err
	}
	if plan.Publish != nil {
		for _, event := range changed {
			plan.Publish(event)
		}
	}
	return decisions, nil
}

// decideSaveItems loads each item's stored snapshot inside q and collects its decision.
func decideSaveItems(ctx context.Context, q persistence.Querier, items []anime.SaveItem) ([]anime.SaveDecision, error) {
	decisions := make([]anime.SaveDecision, 0, len(items))
	for _, item := range items {
		current, found, err := loadStoredSnapshot(ctx, q, item.AnimeID)
		if err != nil {
			return nil, err
		}
		decision, err := item.Decide(current, found)
		if err != nil {
			return nil, err
		}
		decisions = append(decisions, decision)
	}
	return decisions, nil
}

// applyDecisions writes every applied decision, after plan.Rule, and returns
// the events the commit will publish. It records each rewrite in decisions.
func (s *AnimeSaveStore) applyDecisions(ctx context.Context, q persistence.Querier, plan anime.SavePlan, decisions []anime.SaveDecision) ([]anime.ChangedOutboxEvent, error) {
	changed := make([]anime.ChangedOutboxEvent, 0, len(decisions))
	for index := range decisions {
		if decisions[index].Outcome != anime.SaveOutcomeApplied {
			continue
		}
		if plan.Rule != nil {
			desired, err := plan.Rule(ctx, q, decisions[index].AnimeID, decisions[index].Desired)
			if err != nil {
				return nil, err
			}
			decisions[index].Desired = desired
		}
		event, err := s.applyDecision(ctx, q, plan.NewEventID(), decisions[index])
		if err != nil {
			return nil, err
		}
		changed = append(changed, event)
	}
	return changed, nil
}

// applyDecision upserts one applied snapshot and stores its changelog row under eventID.
func (s *AnimeSaveStore) applyDecision(ctx context.Context, q persistence.Querier, eventID string, decision anime.SaveDecision) (anime.ChangedOutboxEvent, error) {
	changeType, err := deriveChangeType(ctx, q, decision.AnimeID)
	if err != nil {
		return anime.ChangedOutboxEvent{}, fmt.Errorf("derive change type for anime %q: %w", decision.AnimeID, err)
	}
	changedFields, err := deriveChangedFields(decision.Base, decision.Desired)
	if err != nil {
		return anime.ChangedOutboxEvent{}, fmt.Errorf("derive changed fields for anime %q: %w", decision.AnimeID, err)
	}
	if _, err := q.ExecContext(ctx, `
		INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at, name_key)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(anime_id) DO UPDATE SET
			snapshot_json = excluded.snapshot_json,
			snapshot_hash = excluded.snapshot_hash,
			modified_at = excluded.modified_at,
			name_key = excluded.name_key
	`, decision.AnimeID, string(decision.Desired), anime.HashSnapshot(decision.Desired), decision.ModifiedAt,
		animeNameKey(string(decision.Desired))); err != nil {
		return anime.ChangedOutboxEvent{}, fmt.Errorf("save anime snapshot %q: %w", decision.AnimeID, err)
	}
	nowMs := s.now().UnixMilli()
	if err := s.recordChangelog(ctx, q, ChangelogEntry{
		SourceEventID: eventID, AnimeID: decision.AnimeID, ChangeType: changeType,
		ChangedFields: changedFields, SnapshotJSON: decision.Desired, ChangedAtMs: nowMs,
	}); err != nil {
		return anime.ChangedOutboxEvent{}, fmt.Errorf("record changelog for anime %q: %w", decision.AnimeID, err)
	}
	return anime.ChangedOutboxEvent{
		EventID: eventID, OperationID: eventID, AnimeID: decision.AnimeID,
		Payload: append([]byte(nil), decision.Desired...), ChangedFields: changedFields,
		ChangeType: changeType, CreatedAtMs: nowMs,
	}, nil
}

// loadStoredSnapshot reads one stored snapshot inside q; found is false when
// the anime has no row.
func loadStoredSnapshot(ctx context.Context, q persistence.Querier, animeID string) (anime.StoredSnapshot, bool, error) {
	record := anime.StoredSnapshot{}
	var snapshotJSON string
	err := q.QueryRowContext(ctx, `SELECT anime_id, snapshot_json, snapshot_hash, modified_at FROM anime_snapshots WHERE anime_id = ?`, animeID).
		Scan(&record.AnimeID, &snapshotJSON, &record.Hash, &record.ModifiedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return anime.StoredSnapshot{}, false, nil
	}
	if err != nil {
		return anime.StoredSnapshot{}, false, fmt.Errorf("query anime snapshot %q: %w", animeID, err)
	}
	record.CanonicalJSON = []byte(snapshotJSON)
	return record, true, nil
}

var _ anime.SaveStore = (*AnimeSaveStore)(nil)

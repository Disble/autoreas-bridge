package sync

import (
	"context"
	"errors"
	"slices"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/persistence"
)

// saveSeedJSON is the stored snapshot the save store tests start from.
const saveSeedJSON = `{"id":"anime-1","name":"Show","episodesWatched":1}`

// saveDesiredJSON is the snapshot an applied save stores.
const saveDesiredJSON = `{"id":"anime-1","name":"Show","episodesWatched":2}`

// saveRuledJSON is the snapshot the plan rule rewrites an applied save to.
const saveRuledJSON = `{"id":"anime-1","name":"Show","episodesWatched":3}`

// ruleTo returns a save rule that rewrites every applied snapshot to payload,
// or fails with err when it is set.
func ruleTo(payload string, err error) anime.SaveRule {
	return func(context.Context, persistence.Querier, string, []byte) ([]byte, error) {
		return []byte(payload), err
	}
}

// noOpItem is a batch item that decides a no-op, so nothing is written for it.
var noOpItem = anime.SaveItem{AnimeID: "anime-0", Decide: func(current anime.StoredSnapshot, _ bool) (anime.SaveDecision, error) {
	return anime.SaveDecision{AnimeID: "anime-0", Outcome: "no_op", Current: current}, nil
}}

// seedSaveStore stores anime-1 at modified_at 100 and returns its database.
func seedSaveStore(t *testing.T) (*AnimeSaveStore, *ChangelogStore) {
	t.Helper()
	db := openTestBridgeDB(t)
	if err := NewAnimeSnapshotStore(db).ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		"anime-1": {AnimeID: "anime-1", CanonicalJSON: []byte(saveSeedJSON), Hash: anime.HashSnapshot([]byte(saveSeedJSON)), ModifiedAt: 100},
	}, nil); err != nil {
		t.Fatalf("seed snapshot: %v", err)
	}
	return NewAnimeSaveStore(db), NewChangelogStore(NewSQLiteProvider(db))
}

// savePlan decides anime-1 as applied, or as a conflict, and records what Publish receives.
func savePlan(conflict bool, published *[]anime.ChangedOutboxEvent) anime.SavePlan {
	outcome := anime.SaveOutcomeApplied
	if conflict {
		outcome = anime.SaveOutcomeConflict
	}
	return anime.SavePlan{
		Items: []anime.SaveItem{{AnimeID: "anime-1", Decide: func(current anime.StoredSnapshot, _ bool) (anime.SaveDecision, error) {
			return anime.SaveDecision{
				AnimeID: "anime-1", Outcome: outcome, Current: current,
				Base: current.CanonicalJSON, Desired: []byte(saveDesiredJSON), ModifiedAt: 200,
			}, nil
		}}},
		NewEventID: func() string { return "event-1" },
		Publish:    func(event anime.ChangedOutboxEvent) { *published = append(*published, event) },
	}
}

// TestAnimeSaveStoreCommitsTheSnapshotAndItsChangelogRowTogether pins S1 and
// S6: the row is written inside the save (no recorder runs here), carries the
// published event's id, and a recorder replaying that event adds no second row.
// The plan rule's rewrite is what is stored, and a no-op item ahead of the
// applied one in the batch does not stop it being written.
func TestAnimeSaveStoreCommitsTheSnapshotAndItsChangelogRowTogether(t *testing.T) {
	ctx := context.Background()
	saves, changelog := seedSaveStore(t)
	var published []anime.ChangedOutboxEvent
	plan := savePlan(false, &published)
	plan.Items = append([]anime.SaveItem{noOpItem}, plan.Items...)
	plan.Rule = ruleTo(saveRuledJSON, nil)

	if _, err := saves.CommitSave(ctx, plan); err != nil {
		t.Fatalf("commit save: %v", err)
	}
	if len(published) != 1 || published[0].EventID != "event-1" || published[0].ChangeType != ChangelogTypeUpdate ||
		!slices.Equal(published[0].ChangedFields, []string{"episodesWatched"}) || string(published[0].Payload) != saveRuledJSON {
		t.Fatalf("unexpected published events: %+v", published)
	}
	assertOneSavedRow(t, changelog)
	if err := changelog.InsertPending(ctx, ChangelogEntry{SourceEventID: "event-1", AnimeID: "anime-1", ChangedFields: []string{"episodesWatched"}}); err != nil {
		t.Fatalf("replay the event into the recorder store: %v", err)
	}
	assertOneSavedRow(t, changelog)
	assertStoredSave(t, saves, 200, saveRuledJSON)
}

// assertOneSavedRow fails unless the changelog holds exactly the row of event-1
// with the rule's saved snapshot.
func assertOneSavedRow(t *testing.T, changelog *ChangelogStore) {
	t.Helper()
	rows, err := changelog.ListAfterID(context.Background(), 0)
	if err != nil || len(rows) != 1 || rows[0].SourceEventID != "event-1" || string(rows[0].SnapshotJSON) != saveRuledJSON {
		t.Fatalf("expected one changelog row for event-1 with the saved snapshot: %+v, %v", rows, err)
	}
}

// TestAnimeSaveStoreWritesNothingForAConflictOrAFailure pins S3 and S5: a
// conflicting decision, a failing changelog insert and a failing plan rule all
// leave the snapshot, the changelog and the bus untouched, and only the
// failures are errors.
func TestAnimeSaveStoreWritesNothingForAConflictOrAFailure(t *testing.T) {
	errInjected := errors.New("injected failure")
	cases := []struct {
		name     string
		conflict bool
		record   func(context.Context, persistence.Querier, ChangelogEntry) error
		rule     anime.SaveRule
		wantErr  error
	}{
		{"conflict", true, recordPendingTx, nil, nil},
		{"changelog failure", false, func(context.Context, persistence.Querier, ChangelogEntry) error { return errInjected }, nil, errInjected},
		{"rule failure", false, recordPendingTx, ruleTo("", errInjected), errInjected},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			saves, changelog := seedSaveStore(t)
			saves.recordChangelog = tc.record
			var published []anime.ChangedOutboxEvent
			plan := savePlan(tc.conflict, &published)
			plan.Rule = tc.rule

			decisions, err := saves.CommitSave(ctx, plan)
			if !errors.Is(err, tc.wantErr) || (tc.wantErr == nil && (len(decisions) != 1 || decisions[0].Outcome != anime.SaveOutcomeConflict)) {
				t.Fatalf("CommitSave = %+v, %v; want error %v", decisions, err, tc.wantErr)
			}
			rows, err := changelog.ListAfterID(ctx, 0)
			if err != nil || len(rows) != 0 || len(published) != 0 {
				t.Fatalf("expected no changelog row and no event: rows=%+v events=%+v, %v", rows, published, err)
			}
			assertStoredSave(t, saves, 100, saveSeedJSON)
		})
	}
}

// assertStoredSave fails unless anime-1 is stored at modifiedAt with payload.
func assertStoredSave(t *testing.T, saves *AnimeSaveStore, modifiedAt int64, payload string) {
	t.Helper()
	stored, err := NewAnimeSnapshotStore(saves.db).GetSnapshot(context.Background(), "anime-1")
	if err != nil || stored.ModifiedAt != modifiedAt || string(stored.CanonicalJSON) != payload {
		t.Fatalf("stored anime-1 = %d %s, %v; want %d %s", stored.ModifiedAt, stored.CanonicalJSON, err, modifiedAt, payload)
	}
}

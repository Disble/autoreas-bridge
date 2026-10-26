package store

import (
	"context"

	"autoreas-bridge/internal/persistence"
)

// SaveStore runs one anime save, single or batch, as one write transaction.
//
// CommitSave loads every item's stored snapshot, asks the item to decide, and
// then writes every applied decision: the snapshot (after plan.Rule), its
// changelog row and nothing else. A failing item, a failing write or one
// conflicting item leaves nothing applied. Only after the commit does it hand
// one event per applied anime to plan.Publish, carrying the changelog row's
// source event id. It returns the decisions in item order, with any rewrite
// the rule made, so the caller can report the outcome and record a conflict
// once the transaction is closed.
type SaveStore interface {
	CommitSave(ctx context.Context, plan SavePlan) ([]SaveDecision, error)
}

// SavePlan is the input of one save transaction.
type SavePlan struct {
	Items []SaveItem
	// Rule rewrites an applied snapshot inside the transaction; nil keeps it.
	Rule SaveRule
	// NewEventID names the event, and the changelog row, of each applied anime.
	NewEventID func() string
	// Publish receives each committed change after the commit; nil drops them.
	Publish func(CommittedChange)
}

// SaveItem is one anime a save transaction loads and decides.
type SaveItem struct {
	AnimeID string
	// Decide receives the stored snapshot, or a zero one with found false,
	// and returns what the save does with it. An error aborts the whole save
	// and is returned unwrapped.
	Decide func(current Snapshot, found bool) (SaveDecision, error)
}

// SaveDecision is what a save does with one anime.
type SaveDecision struct {
	AnimeID string
	Outcome AnimePatchOutcome
	// Current is the decoded snapshot the decision was made against.
	Current Snapshot
	// Base is the snapshot the changed fields are derived from.
	Base []byte
	// Desired is the snapshot an applied decision stores.
	Desired    []byte
	ModifiedAt int64
}

// SaveRule rewrites one applied snapshot inside the save transaction, reading
// any state it needs through q, the transaction itself. It returns desired
// unchanged when it does not apply.
type SaveRule func(ctx context.Context, q persistence.Querier, animeID string, desired []byte) ([]byte, error)

// CommittedChange is one anime change a save transaction committed, handed to
// SavePlan.Publish after the commit. EventID is also the source event id of
// the changelog row the same transaction stored.
type CommittedChange struct {
	EventID string
	AnimeID string
	Payload []byte
	// ChangedFields names the top-level snapshot fields this save actually
	// changed. It is DERIVED inside the save transaction from the base and
	// desired snapshot pair, never declared by a producer: six publishers
	// existed and none of them ever set it, so every changelog row recorded an
	// empty list while real fields were rewritten.
	ChangedFields []string
	// ChangeType is "create" when this save stored an anime the database did
	// not hold yet, and "update" otherwise. It is DERIVED in the same save
	// transaction as ChangedFields: no publisher ever set it, so every create
	// reached the changelog and Mobile as an update.
	ChangeType  string
	CreatedAtMs int64
}

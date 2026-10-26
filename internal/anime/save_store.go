package anime

import "autoreas-bridge/internal/anime/store"

// SaveStore is the port every anime save goes through: one write transaction
// per save, single or batch.
type SaveStore = store.SaveStore

// SavePlan is the input of one save transaction.
type SavePlan = store.SavePlan

// SaveItem is one anime a save transaction loads and decides.
type SaveItem = store.SaveItem

// SaveDecision is what a save does with one anime.
type SaveDecision = store.SaveDecision

// Save decision outcomes a save transaction acts on.
const (
	SaveOutcomeApplied  = store.AnimePatchOutcomeApplied
	SaveOutcomeConflict = store.AnimePatchOutcomeConflict
)

// SaveRule rewrites one applied snapshot inside its save transaction.
type SaveRule = store.SaveRule

// StoredSnapshot is the stored snapshot a save transaction hands to a SaveItem.
type StoredSnapshot = store.Snapshot

// saveStoreProvider is a snapshot store that also runs saves over its database.
type saveStoreProvider interface {
	SaveStore() SaveStore
}

package preferences

import "context"

// seasonModeKey is the app_settings key used to persist the season-mode toggle. It is
// kept unexported so stringly-typed keys never escape the public Store interface.
const seasonModeKey = "season_mode"

// Store is the preferences persistence port. SeasonMode returns false when no value has
// been persisted (missing row is the canonical default-false sentinel). Adapters must NOT
// treat a missing row as an error.
type Store interface {
	SeasonMode(ctx context.Context) (bool, error)
	SetSeasonMode(ctx context.Context, enabled bool) error
}

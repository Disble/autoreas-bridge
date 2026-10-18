package contracts

// MobileAnimeSeason is one anime's projection in the open active season (MobileAnime.Season). A
// change to it records a changelog row with changed_fields ["season"] and the anime's unchanged
// modified_at, so the reconcile cursor delivers it without disturbing Mobile's OCC base.
type MobileAnimeSeason struct {
	SeasonID string `json:"seasonId"`
	// Grade is the bridge premiere grade (1-6). It is always present: null means not graded yet.
	Grade *int `json:"grade"`
}

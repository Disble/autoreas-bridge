package anime

import (
	"context"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/persistence"
)

// SectionTarget names the section a save must move animeID to, given the first
// section and the progress the save leaves it with, or "" to keep it. It reads
// any other state through q, the save's own transaction.
type SectionTarget func(ctx context.Context, q persistence.Querier, animeID, section string, progress float64) (string, error)

// NewSectionMoveRule builds the save rule that moves an applied anime to the
// section target names. The move is the patch a section move always was: the
// days become that one section and the last-watched instant is kept.
func NewSectionMoveRule(target SectionTarget) SaveRule {
	return func(ctx context.Context, q persistence.Querier, animeID string, desired []byte) ([]byte, error) {
		raw, value, _, err := store.DecodeForUpdate(desired)
		if err != nil {
			return nil, fmt.Errorf("decode saved anime %q for its section rule: %w", animeID, err)
		}
		section := ""
		if len(value.Days) > 0 {
			section = value.Days[0].Day
		}
		to, err := target(ctx, q, animeID, section, value.Progress)
		if err != nil || to == "" {
			return desired, err
		}
		applyAnimePatch(&value, contracts.AnimePatch{Dias: []string{to}, PreserveLastWatched: true}, time.Now(), false)
		merged, err := store.NewMapper().Merge(raw, value)
		if err != nil {
			return nil, err
		}
		return merged.MarshalJSON()
	}
}

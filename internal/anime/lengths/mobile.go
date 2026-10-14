package lengths

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
)

// AttachEpisodes is the Mobile adapter: it sets Episodes on every given anime from the stored
// durations, read in one query, through EpisodeLengths so Mobile and Today apply the same rule.
//
// An anime with no stored duration gets no Episodes, which the contract omits. A failed read is
// returned rather than swallowed: serving an anime without its episodes would tell Mobile that its
// durations are gone.
func AttachEpisodes(ctx context.Context, reader Reader, animes ...*contracts.MobileAnime) error {
	if len(animes) == 0 {
		return nil
	}
	animeIDs := make([]string, len(animes))
	for i, anime := range animes {
		animeIDs[i] = anime.ID
	}
	durations, err := reader.ByAnimeIDs(ctx, animeIDs)
	if err != nil {
		return fmt.Errorf("attach episode durations: %w", err)
	}
	for _, anime := range animes {
		anime.Episodes = toContract(EpisodeLengths(durations[anime.ID], anime.Kind))
	}
	return nil
}

// toContract maps lengths onto the wire shape; no lengths map to nil so the field is omitted.
func toContract(lengths []Length) []contracts.EpisodeLength {
	if len(lengths) == 0 {
		return nil
	}
	episodes := make([]contracts.EpisodeLength, len(lengths))
	for i, length := range lengths {
		episodes[i] = contracts.EpisodeLength{Episode: length.Episode, Minutes: length.Minutes, Long: length.Long}
	}
	return episodes
}

package store

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// CanonicalCreateInput is already-enriched application state for one new
// Legacy document. It contains no metadata-source behavior.
type CanonicalCreateInput struct {
	ID              string
	Title           string
	SourceURL       string
	Days            []AnimeDay
	CreatedAt       time.Time
	Folder          string
	Type            *int
	EpisodesWatched *int
	TotalEpisodes   *int
	DurationMinutes *int
	Origin          string
	Genres          []string
	Studios         []string
	CoverType       string
	CoverPath       string
}

// NewCanonicalCreate converts validated application state into the exact
// canonical wire shape, including honest null metadata and the cover sentinel.
func NewCanonicalCreate(input CanonicalCreateInput) (AnimeRaw, error) {
	if err := validateCanonicalCreateInput(input); err != nil {
		return AnimeRaw{}, err
	}

	episodesWatched := 0
	if input.EpisodesWatched != nil {
		episodesWatched = *input.EpisodesWatched
	}
	fields := map[string]any{
		"id":              input.ID,
		"name":            input.Title,
		"episodesWatched": episodesWatched,
		"status":          0,
		"active":          true,
		"firstCycle":      true,
		"createdAt":       input.CreatedAt.UTC().UnixMilli(),
		"days":            canonicalCreateDays(input.Days),
		"sourceUrl":       input.SourceURL,
		"totalEpisodes":   input.TotalEpisodes,
		"durationMinutes": input.DurationMinutes,
		"cover":           canonicalCreateCover(input),
	}
	applyOptionalCreateFields(fields, input)
	// Premiere date is never set at create: it is an auto lifecycle field
	// stamped only when the first episode is watched (episode_service.go).

	payload, err := json.Marshal(fields)
	if err != nil {
		return AnimeRaw{}, fmt.Errorf("marshal canonical anime create: %w", err)
	}
	var raw AnimeRaw
	if err := json.Unmarshal(payload, &raw); err != nil {
		return AnimeRaw{}, fmt.Errorf("build canonical anime create: %w", err)
	}
	return raw, nil
}

// validateCanonicalCreateInput enforces the required-field and schedule invariants.
func validateCanonicalCreateInput(input CanonicalCreateInput) error {
	if strings.TrimSpace(input.ID) == "" {
		return fmt.Errorf("canonical anime create: missing id")
	}
	if strings.TrimSpace(input.Title) == "" {
		return fmt.Errorf("canonical anime create: missing title")
	}
	if strings.TrimSpace(input.SourceURL) == "" {
		return fmt.Errorf("canonical anime create: missing source page")
	}
	if len(input.Days) == 0 {
		return fmt.Errorf("canonical anime create: invalid schedule entry")
	}
	for _, day := range input.Days {
		if strings.TrimSpace(day.Day) == "" || day.Order <= 0 {
			return fmt.Errorf("canonical anime create: invalid schedule entry")
		}
	}
	if input.CreatedAt.IsZero() {
		return fmt.Errorf("canonical anime create: missing creation time")
	}
	return nil
}

// canonicalCreateCover builds the cover object, defaulting the source type to "url".
func canonicalCreateCover(input CanonicalCreateInput) any {
	coverType := input.CoverType
	if coverType == "" {
		coverType = "url"
	}
	return struct {
		Type string `json:"type"`
		Path string `json:"path"`
	}{Type: coverType, Path: input.CoverPath}
}

// applyOptionalCreateFields adds only the optional canonical keys the caller provided,
// preserving the codec's missing-vs-value discrimination.
func applyOptionalCreateFields(fields map[string]any, input CanonicalCreateInput) {
	if input.Folder != "" {
		fields["folder"] = input.Folder
	}
	if input.Type != nil {
		fields["kind"] = *input.Type
	}
	if input.Origin != "" {
		fields["origin"] = input.Origin
	}
	if input.Genres != nil {
		fields["genres"] = input.Genres
	}
	if input.Studios != nil {
		fields["studios"] = input.Studios
	}
}

// canonicalCreateDays converts validated placements into the canonical days shape.
func canonicalCreateDays(days []AnimeDay) []map[string]any {
	result := make([]map[string]any, 0, len(days))
	for _, day := range days {
		result = append(result, map[string]any{"day": day.Day, "order": day.Order})
	}
	return result
}

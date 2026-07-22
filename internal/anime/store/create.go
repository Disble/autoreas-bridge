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
	PremieredAtMs   *int64
	TotalEpisodes   *int
	DurationMinutes *int
	CoverURL        string
}

// NewCanonicalCreate converts validated application state into the exact
// canonical wire shape, including honest null metadata and the cover sentinel.
func NewCanonicalCreate(input CanonicalCreateInput) (AnimeRaw, error) {
	if strings.TrimSpace(input.ID) == "" {
		return AnimeRaw{}, fmt.Errorf("canonical anime create: missing id")
	}
	if strings.TrimSpace(input.Title) == "" {
		return AnimeRaw{}, fmt.Errorf("canonical anime create: missing title")
	}
	if strings.TrimSpace(input.SourceURL) == "" {
		return AnimeRaw{}, fmt.Errorf("canonical anime create: missing source page")
	}
	if len(input.Days) == 0 {
		return AnimeRaw{}, fmt.Errorf("canonical anime create: invalid schedule entry")
	}
	for _, day := range input.Days {
		if strings.TrimSpace(day.Day) == "" || day.Order <= 0 {
			return AnimeRaw{}, fmt.Errorf("canonical anime create: invalid schedule entry")
		}
	}
	if input.CreatedAt.IsZero() {
		return AnimeRaw{}, fmt.Errorf("canonical anime create: missing creation time")
	}

	cover := struct {
		Type string `json:"type"`
		Path string `json:"path"`
	}{Type: "url", Path: input.CoverURL}
	fields := map[string]any{
		"id":              input.ID,
		"name":            input.Title,
		"episodesWatched": 0,
		"status":          0,
		"active":          true,
		"firstCycle":      true,
		"createdAt":       input.CreatedAt.UTC().UnixMilli(),
		"days":            canonicalCreateDays(input.Days),
		"sourceUrl":       input.SourceURL,
		"totalEpisodes":   input.TotalEpisodes,
		"durationMinutes": input.DurationMinutes,
		"cover":           cover,
	}
	if input.Folder != "" {
		fields["folder"] = input.Folder
	}
	if input.Type != nil {
		fields["kind"] = *input.Type
	}
	if input.PremieredAtMs != nil {
		fields["premieredAt"] = *input.PremieredAtMs
	}

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

// canonicalCreateDays converts validated placements into the canonical days shape.
func canonicalCreateDays(days []AnimeDay) []map[string]any {
	result := make([]map[string]any, 0, len(days))
	for _, day := range days {
		result = append(result, map[string]any{"day": day.Day, "order": day.Order})
	}
	return result
}

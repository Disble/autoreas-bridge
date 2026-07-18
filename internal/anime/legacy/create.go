package legacy

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
	Section         string
	Order           int
	CreatedAt       time.Time
	Folder          string
	Type            *int
	PremieredAtMs   *int64
	TotalEpisodes   *int
	DurationMinutes *int
	CoverURL        string
}

// NewCanonicalCreate converts validated application state into the exact
// Legacy wire shape, including honest null metadata and the cover sentinel.
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
	if strings.TrimSpace(input.Section) == "" || input.Order <= 0 {
		return AnimeRaw{}, fmt.Errorf("canonical anime create: invalid schedule entry")
	}
	if input.CreatedAt.IsZero() {
		return AnimeRaw{}, fmt.Errorf("canonical anime create: missing creation time")
	}

	cover := struct {
		Type string `json:"type"`
		Path string `json:"path"`
	}{Type: "url", Path: input.CoverURL}
	fields := map[string]any{
		"_id":           input.ID,
		"nombre":        input.Title,
		"nrocapvisto":   0,
		"estado":        0,
		"activo":        true,
		"primeravez":    true,
		"fechaCreacion": map[string]int64{"$$date": input.CreatedAt.UTC().UnixMilli()},
		"dias":          []map[string]any{{"dia": input.Section, "orden": input.Order}},
		"pagina":        input.SourceURL,
		"totalcap":      input.TotalEpisodes,
		"duracion":      input.DurationMinutes,
		"portada":       cover,
	}
	if input.Folder != "" {
		fields["carpeta"] = input.Folder
	}
	if input.Type != nil {
		fields["tipo"] = *input.Type
	}
	if input.PremieredAtMs != nil {
		fields["fechaEstreno"] = map[string]int64{"$$date": *input.PremieredAtMs}
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

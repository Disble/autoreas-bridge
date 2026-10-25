package desktop

import (
	"encoding/base64"
	"strings"

	"autoreas-bridge/internal/api/contracts"
)

// coverDataURLPrefix is the only prefix GetAnimeCover emits: the shared thumbnail service always
// serves JPEG, so a consumer never has to guess the media type.
const coverDataURLPrefix = "data:image/jpeg;base64,"

// GetAnimeCover renders a single anime's cover thumbnail into a base64 data-URL, or the explicit
// placeholder signal (episodes-cover-pipeline spec, "Cover resolution follows a deterministic,
// placeholder-first order"). It degrades to the placeholder -- never an error -- on a nil
// dependency, a lookup failure or a failed thumbnail, and it never falls back to the original
// source bytes. The thumbnail service is the same instance the HTTP cover route serves from, so
// both surfaces read one cache.
func (a *App) GetAnimeCover(animeID string) contracts.AnimeCover {
	if a.animeQuery == nil || a.coverThumbnails == nil {
		return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
	}
	current, err := a.animeQuery.GetMobileAnime(a.appContext(), animeID)
	if err != nil || current == nil {
		return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
	}
	return a.thumbnailCover(derefCover(current.Cover))
}

// PreviewAnimeCover renders an unsaved cover value -- the local path or URL a form is editing --
// through the same thumbnail service GetAnimeCover uses, so a cover can be checked before it is
// saved. A blank or legacy "null" value never reaches the service, and every failure degrades to
// the placeholder signal, exactly as a saved cover does.
func (a *App) PreviewAnimeCover(value string) contracts.AnimeCover {
	trimmed := strings.TrimSpace(value)
	if a.coverThumbnails == nil || trimmed == "" || trimmed == "null" {
		return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
	}
	return a.thumbnailCover(trimmed)
}

// thumbnailCover renders one cover value through the shared thumbnail service into a JPEG data URL,
// or the placeholder signal when the service fails or serves nothing.
func (a *App) thumbnailCover(value string) contracts.AnimeCover {
	result, err := a.coverThumbnails.GetDesktop(a.appContext(), value)
	if err != nil || len(result.Bytes) == 0 {
		return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
	}
	return contracts.AnimeCover{
		DataURL: coverDataURLPrefix + base64.StdEncoding.EncodeToString(result.Bytes),
		Source:  contracts.CoverSourceCover,
	}
}

// derefCover returns a cover value, or the empty string the loader classifies as absent.
func derefCover(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

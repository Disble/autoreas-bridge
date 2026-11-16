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
// placeholder-first order"), through the anime module handle: unavailable while the module starts,
// failed_precondition after it failed. Once the module is ready it degrades to the placeholder --
// never an error -- on an absent cover service, a lookup failure or a failed thumbnail, and it never
// falls back to the original source bytes. The thumbnail service is the same instance the HTTP cover
// route serves from, so both surfaces read one cache.
func (a *App) GetAnimeCover(animeID string) (contracts.AnimeCover, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.AnimeCover, error) {
		if services.covers == nil {
			return placeholderCover(), nil
		}
		current, err := services.query.GetMobileAnime(a.appContext(), animeID)
		if err != nil || current == nil {
			return placeholderCover(), nil
		}
		return a.thumbnailCover(services.covers, derefCover(current.Cover)), nil
	})
}

// PreviewAnimeCover renders an unsaved cover value -- the local path or URL a form is editing --
// through the same thumbnail service GetAnimeCover uses, so a cover can be checked before it is
// saved, through the anime module handle like GetAnimeCover. A blank or legacy "null" value never
// reaches the service, and every failure degrades to the placeholder signal, exactly as a saved
// cover does.
func (a *App) PreviewAnimeCover(value string) (contracts.AnimeCover, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.AnimeCover, error) {
		trimmed := strings.TrimSpace(value)
		if services.covers == nil || trimmed == "" || trimmed == "null" {
			return placeholderCover(), nil
		}
		return a.thumbnailCover(services.covers, trimmed), nil
	})
}

// placeholderCover is the explicit "no cover to show" signal.
func placeholderCover() contracts.AnimeCover {
	return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
}

// thumbnailCover renders one cover value through the shared thumbnail service into a JPEG data URL,
// or the placeholder signal when the service fails or serves nothing.
func (a *App) thumbnailCover(covers coverThumbnails, value string) contracts.AnimeCover {
	result, err := covers.GetDesktop(a.appContext(), value)
	if err != nil || len(result.Bytes) == 0 {
		return placeholderCover()
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

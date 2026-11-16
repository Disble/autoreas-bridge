package desktop

import (
	"context"
	"errors"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/modules"
	"autoreas-bridge/internal/myanimelist"
)

// myanimelistClientPort is the local seam SearchMyAnimeList and
// GetMyAnimeListDetail depend on, mirroring coverResolver's shape (app.go)
// so tests can inject a fake without a real HTTP client. The production
// implementation is *myanimelist.Client, wired in
// ensureMyAnimeListRuntimeDependencies with an honest, version-stamped
// User-Agent (design D4).
type myanimelistClientPort interface {
	Search(ctx context.Context, query string) (myanimelist.SearchResult, error)
	Detail(ctx context.Context, malID int) (myanimelist.Detail, error)
}

// ensureMyAnimeListRuntimeDependencies fills the myanimelist client seam. It
// has no database dependency, so it is wired unconditionally rather than
// gated behind bridge database startup: a MyAnimeList outage must never
// depend on whether the bridge database initialized.
func (a *App) ensureMyAnimeListRuntimeDependencies() {
	if a.myanimelistClient == nil {
		a.myanimelistClient = newMyAnimeListClient("")
	}
}

// newMyAnimeListClient builds a production myanimelist.Client against
// baseURL ("" resolves to MyAnimeList's real host, per myanimelist.NewClient)
// with the package's default fetch timeout and body-size cap, and an
// honest, version-stamped User-Agent. Extracted from
// ensureMyAnimeListRuntimeDependencies so a test can point the exact same
// construction at an httptest.Server instead of duplicating it.
func newMyAnimeListClient(baseURL string) myanimelistClientPort {
	return myanimelist.NewClient(myanimelist.NewHTTPClient(0, 0, myanimelistUserAgent()), baseURL)
}

// myanimelistUserAgent builds an honest, attributable User-Agent naming the
// running bridge version -- never a browser impersonation (design's Threat
// Matrix note). bridgeVersion is the ldflags-stamped build version declared
// in app_backup.go.
func myanimelistUserAgent() string {
	return "autoreas-bridge/" + bridgeVersion
}

// SearchMyAnimeList queries MyAnimeList for anime matching query, through the
// always-ready shell handle: the client never waits for the database. A
// zero-candidate result is AnimePatchOutcomeNoOp, never an error (design D4): an
// empty match list is a legitimate result the UI renders as its own empty state.
// A failed request, or no client wired, is internal with the message the lookup
// shows.
func (a *App) SearchMyAnimeList(query string) (contracts.MyAnimeListSearchResult, error) {
	return a.moduleSet().shell.Use(func(services modules.ShellServices) (contracts.MyAnimeListSearchResult, error) {
		if services.MetadataLookup == nil {
			return contracts.MyAnimeListSearchResult{}, errMyAnimeListUnavailable
		}
		result, err := services.MetadataLookup.Search(a.appContext(), query)
		if err != nil {
			return contracts.MyAnimeListSearchResult{}, myanimelistError(err)
		}
		if len(result.Candidates) == 0 {
			return contracts.MyAnimeListSearchResult{Outcome: contracts.AnimePatchOutcomeNoOp, Message: "no MyAnimeList matches found"}, nil
		}
		return contracts.MyAnimeListSearchResult{
			Outcome: contracts.AnimePatchOutcomeApplied, Message: "MyAnimeList search complete",
			Candidates: toCandidateDTOs(result.Candidates),
		}, nil
	})
}

// GetMyAnimeListDetail fetches malID's anime page through the always-ready shell
// handle and returns it flattened into MyAnimeList's own vocabulary (design D4).
// The bridge-vocabulary translation happens one hop later, in the frontend's
// metadata-lookup module -- this binding never performs it. A failed request, or
// no client wired, is internal with the message the lookup shows.
func (a *App) GetMyAnimeListDetail(malID int) (contracts.MyAnimeListDetailResult, error) {
	return a.moduleSet().shell.Use(func(services modules.ShellServices) (contracts.MyAnimeListDetailResult, error) {
		if services.MetadataLookup == nil {
			return contracts.MyAnimeListDetailResult{}, errMyAnimeListUnavailable
		}
		detail, err := services.MetadataLookup.Detail(a.appContext(), malID)
		if err != nil {
			return contracts.MyAnimeListDetailResult{}, myanimelistError(err)
		}
		return contracts.MyAnimeListDetailResult{
			Outcome: contracts.AnimePatchOutcomeApplied, Message: "MyAnimeList detail loaded",
			Title: detail.Title, Type: detail.Type, Episodes: detail.Episodes, Duration: detail.Duration,
			Source: detail.Source, Studios: detail.Studios, Genres: detail.Genres, Unfilled: detail.Unfilled,
		}, nil
	})
}

// errMyAnimeListUnavailable is the failure of a lookup with no client wired.
var errMyAnimeListUnavailable = errors.New("myanimelist client unavailable")

// myanimelistError turns a client failure into the error the lookup shows. A
// *myanimelist.DriftError names its failing anchor so the user sees
// "MyAnimeList changed its page", never a generic transport error (design D4's
// outcome table).
func myanimelistError(err error) error {
	var drift *myanimelist.DriftError
	if errors.As(err, &drift) {
		return fmt.Errorf("MyAnimeList changed its page at %q; metadata autofill cannot continue", drift.Anchor)
	}
	return fmt.Errorf("myanimelist request failed: %w", err)
}

// toCandidateDTOs maps myanimelist.Candidate values to their flat DTO shape
// (design D4). MediaType and Score stay MyAnimeList's raw text; the
// MAL-to-bridge vocabulary translation happens outside this package.
func toCandidateDTOs(candidates []myanimelist.Candidate) []contracts.CandidateDTO {
	dtos := make([]contracts.CandidateDTO, 0, len(candidates))
	for _, candidate := range candidates {
		dtos = append(dtos, contracts.CandidateDTO{
			MalID: candidate.ID, Name: candidate.Name, Image: candidate.Image,
			MediaType: candidate.MediaType, StartYear: candidate.StartYear, Score: candidate.Score,
		})
	}
	return dtos
}

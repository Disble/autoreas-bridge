package desktop

import (
	"encoding/json"
	"errors"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// errOrderingBoardUnavailable is the builder's explicit failure when the season
// service or the anime query is not wired: no board can be read, and a capture
// must never fabricate an empty one.
var errOrderingBoardUnavailable = errors.New("ordering board unavailable")

// buildSeasonOrderingBoard aggregates the ordering board and reports every read
// failure. GetSeasonOrderingBoard keeps its error-swallowing read for the UI;
// the season-close capture uses this builder so a failed read aborts the close
// instead of persisting a false empty history.
func (a *App) buildSeasonOrderingBoard() (OrderingBoardDTO, error) {
	inputs, err := a.readSeasonBoardInputs()
	if err != nil {
		return OrderingBoardDTO{}, err
	}
	return inputs.orderingBoard(), nil
}

// seasonBoardInputs is one consistent read of everything the season boards are
// built from: the open season, its intake rows and every live anime.
type seasonBoardInputs struct {
	active *domain.Season
	rows   []domain.SeasonAnime
	animes []contracts.MobileAnime
}

// readSeasonBoardInputs reads the open season, its rows and the live animes,
// reporting every failure so a capture never builds a board from a failed read.
func (a *App) readSeasonBoardInputs() (seasonBoardInputs, error) {
	if a.seasonService == nil || a.animeQuery == nil {
		return seasonBoardInputs{}, errOrderingBoardUnavailable
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil {
		return seasonBoardInputs{}, err
	}
	if active == nil {
		return seasonBoardInputs{}, season.ErrNoActiveSeason
	}
	rows, err := a.seasonService.ListSeasonAnimes(a.seasonCtx(), active.ID)
	if err != nil {
		return seasonBoardInputs{}, err
	}
	animes, err := a.animeQuery.ListMobileAnimes(a.seasonCtx())
	if err != nil {
		return seasonBoardInputs{}, err
	}
	return seasonBoardInputs{active: active, rows: rows, animes: animes}, nil
}

// orderingBoard builds the ordering board from one read of the board inputs.
func (in seasonBoardInputs) orderingBoard() OrderingBoardDTO {
	approved := approvedSeasonAnimeIDs(in.rows, in.active.MinApprovalGrade)
	board := OrderingBoardDTO{Rail: []OrderingCardDTO{}, Grid: []OrderingCardDTO{}, AppliedAt: millisPtrDTO(in.active.AppliedAt)}
	populateOrderingBoard(&board, in.animes, approved)
	return board
}

// GetSeasonOrderingBoard aggregates the ordering board for the UI read: the rail
// is the approved (verdict Aprobado, linked, still in an Estrenos section) season
// candidates; the grid is every active anime already scheduled on a weekday
// (continuing titles + placed newcomers). Newcomers (this season's approved) are
// flagged. Any read failure degrades to an empty board for the UI.
func (a *App) GetSeasonOrderingBoard() OrderingBoardDTO {
	board, err := a.buildSeasonOrderingBoard()
	if err != nil {
		return OrderingBoardDTO{Rail: []OrderingCardDTO{}, Grid: []OrderingCardDTO{}}
	}
	return board
}

// captureSeasonClosure builds the ordering and Daily boards from one live read
// and encodes the closure snapshot. Any failure — a read error or an encode
// error — returns an error so the caller leaves the season open rather than
// storing a false snapshot.
func (a *App) captureSeasonClosure() (string, error) {
	inputs, err := a.readSeasonBoardInputs()
	if err != nil {
		return "", err
	}
	board := inputs.orderingBoard()
	raw, err := json.Marshal(seasonClosureSnapshotDTO{
		CapturedAt: time.Now().UnixMilli(),
		AppliedAt:  board.AppliedAt,
		Rail:       board.Rail,
		Grid:       board.Grid,
		DailyBoard: dailyBoardEntries(inputs.rows, inputs.animes),
	})
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// decodeSeasonClosureSnapshot decodes a stored closure payload. ok=false means
// "no board was captured": the payload is absent or blank (every season closed
// before P3 stores SQL NULL, which reads back empty) or malformed JSON. Reads
// degrade instead of failing so a broken payload shows as not-recorded rather
// than as an empty or live board.
func decodeSeasonClosureSnapshot(raw string) (seasonClosureSnapshotDTO, bool) {
	var snap seasonClosureSnapshotDTO
	if err := json.Unmarshal([]byte(raw), &snap); err != nil {
		return seasonClosureSnapshotDTO{}, false
	}
	// A capture instant is what distinguishes a real board from a vacuous
	// payload: JSON `null` and `{}` both decode successfully into the zero
	// struct, and neither is a board this bridge recorded.
	if snap.CapturedAt <= 0 {
		return seasonClosureSnapshotDTO{}, false
	}
	return snap, true
}

// orderingSnapshotFromClosure maps a stored closure payload into the Wails
// history read model without consulting live anime data. A missing or malformed
// payload becomes the explicit not-recorded state.
func orderingSnapshotFromClosure(raw string) SeasonOrderingSnapshotDTO {
	snap, ok := decodeSeasonClosureSnapshot(raw)
	if !ok {
		return emptySeasonOrderingSnapshot()
	}
	return SeasonOrderingSnapshotDTO{
		Recorded:   true,
		CapturedAt: &snap.CapturedAt,
		AppliedAt:  snap.AppliedAt,
		Rail:       nonNilOrderingCards(snap.Rail),
		Grid:       nonNilOrderingCards(snap.Grid),
		DailyBoard: dailyBoardSnapshot(snap.DailyBoard),
	}
}

// emptySeasonOrderingSnapshot is the explicit "no board was ever captured"
// state: not recorded, null timestamps, and empty non-nil collections.
func emptySeasonOrderingSnapshot() SeasonOrderingSnapshotDTO {
	return SeasonOrderingSnapshotDTO{Rail: []OrderingCardDTO{}, Grid: []OrderingCardDTO{}, DailyBoard: dailyBoardSnapshot(nil)}
}

// nonNilOrderingCards guarantees a non-nil collection so the frontend never
// receives a JSON null for rail or grid.
func nonNilOrderingCards(cards []OrderingCardDTO) []OrderingCardDTO {
	if cards == nil {
		return []OrderingCardDTO{}
	}
	return cards
}

package contracts

// CandidateDTO is one MyAnimeList search result card, flattened from
// myanimelist.Candidate's own vocabulary (design D4) into the plain
// strings/ints the frontend renders directly. MediaType and Score stay
// MyAnimeList's raw text -- the MAL-to-bridge vocabulary translation
// (e.g. "TV" -> kind "0") happens one hop later, in
// frontend/src/shared/metadata-lookup, never here.
type CandidateDTO struct {
	MalID     int    `json:"malId"`
	Name      string `json:"name"`
	Image     string `json:"image,omitempty"`
	MediaType string `json:"mediaType,omitempty"`
	StartYear int    `json:"startYear,omitempty"`
	Score     string `json:"score,omitempty"`
}

// MyAnimeListSearchResult wraps SearchMyAnimeList's outcome. A zero-candidate
// search is AnimePatchOutcomeNoOp, never AnimePatchOutcomeError (design D4):
// an empty match list is a legitimate result the frontend renders as its own
// empty state, not a failure to surface as an alert.
type MyAnimeListSearchResult struct {
	Outcome    AnimePatchOutcome `json:"outcome"`
	Message    string            `json:"message"`
	Candidates []CandidateDTO    `json:"candidates,omitempty"`
}

// MyAnimeListDetailResult wraps GetMyAnimeListDetail's outcome. The fields
// mirror myanimelist.Detail's own vocabulary as flat strings; Unfilled names
// every optional field that was legitimately absent from the page (design
// D2). This DTO carries no bridge-vocabulary field -- each feature's own
// mapping hop performs that translation against its own draft patch.
type MyAnimeListDetailResult struct {
	Outcome  AnimePatchOutcome `json:"outcome"`
	Message  string            `json:"message"`
	Title    string            `json:"title,omitempty"`
	Type     string            `json:"type,omitempty"`
	Episodes string            `json:"episodes,omitempty"`
	Duration string            `json:"duration,omitempty"`
	Source   string            `json:"source,omitempty"`
	Studios  []string          `json:"studios,omitempty"`
	Genres   []string          `json:"genres,omitempty"`
	Unfilled []string          `json:"unfilled,omitempty"`
}

package myanimelist

import (
	"errors"
	"fmt"
)

// ErrNotFound indicates MyAnimeList responded with a 404 status for the
// requested resource.
var ErrNotFound = errors.New("myanimelist: not found")

// ErrUnexpectedStatus indicates the HTTP response's status code was
// neither 200 OK nor the more specific 404 case (ErrNotFound).
var ErrUnexpectedStatus = errors.New("myanimelist: unexpected response status")

// DriftError reports that a page's markup no longer matches the shape this
// parser expects: either a required anchor is missing entirely, or a
// mapped field is present but does not match any recognized shape (design
// D2's "third outcome" — present-but-unparseable is drift, never a
// silently wrong zero). Anchor names the failing label (e.g. "Type:");
// URL names the page that failed to parse.
type DriftError struct {
	Anchor string
	URL    string
}

// Error implements the error interface, naming the anchor that drifted.
func (e *DriftError) Error() string {
	return fmt.Sprintf("myanimelist: markup drift at anchor %q (%s)", e.Anchor, e.URL)
}

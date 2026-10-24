package cfclearance

import (
	"bytes"
	"io"
	"net/http"
	"strings"
)

// challengeSniffLimit bounds how much of an HTML body is inspected for challenge markers.
const challengeSniffLimit = 64 << 10

// How a challenge was recognised, reported as the reason of a challenge_detected event.
const (
	challengeByHeader = "cf_mitigated"
	challengeByBody   = "html_marker"
)

// challengeMarkers are the lower-case fragments a Cloudflare interstitial page carries.
var challengeMarkers = [][]byte{[]byte("just a moment"), []byte("cf_chl_opt")}

// IsChallenge reports whether resp is a Cloudflare challenge page rather than site content: a
// 403 or 503 carrying Cf-Mitigated: challenge, or a 2xx text/html body whose first 64 KiB
// names the interstitial. The body stays fully readable by the caller afterwards.
func IsChallenge(resp *http.Response) bool {
	_, ok := detectChallenge(resp)
	return ok
}

// detectChallenge classifies resp and names how the challenge was recognised.
func detectChallenge(resp *http.Response) (string, bool) {
	if resp == nil {
		return "", false
	}
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusServiceUnavailable {
		if strings.EqualFold(resp.Header.Get("Cf-Mitigated"), "challenge") {
			return challengeByHeader, true
		}
		return "", false
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 || resp.Body == nil || !isHTML(resp.Header.Get("Content-Type")) {
		return "", false
	}
	if bodyHasMarker(resp) {
		return challengeByBody, true
	}
	return "", false
}

// isHTML reports whether a Content-Type names an HTML document.
func isHTML(contentType string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "text/html")
}

// bodyHasMarker peeks at the first 64 KiB of resp.Body for a challenge marker and puts the
// bytes back in front of the rest, so the caller still reads the whole body.
func bodyHasMarker(resp *http.Response) bool {
	original := resp.Body
	head, _ := io.ReadAll(io.LimitReader(original, challengeSniffLimit))
	resp.Body = restoredBody{Reader: io.MultiReader(bytes.NewReader(head), original), Closer: original}
	lower := bytes.ToLower(head)
	for _, marker := range challengeMarkers {
		if bytes.Contains(lower, marker) {
			return true
		}
	}
	return false
}

// restoredBody re-attaches peeked bytes in front of the original body and keeps its Close.
type restoredBody struct {
	io.Reader
	io.Closer
}

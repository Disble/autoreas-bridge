package requestcapture

import "regexp"

// ClientRequestIDHeader carries the client's own request id, `<cycleId>:<n>`
// (docs/openapi.yaml, 2026-10-17 request correlation notice). The bridge
// echoes the id it settled on in the same response header.
const ClientRequestIDHeader = "X-Autoreas-Request-Id"

// clientRequestIDPattern is the agreed client id shape: a cycle id of at most
// 48 safe characters, a colon, and a sequence of at most 9 digits.
var clientRequestIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,48}:[0-9]{1,9}$`)

// AcceptClientRequestID returns value when it is a well-formed client request
// id and "" otherwise. A malformed id is ignored, never an error.
func AcceptClientRequestID(value string) string {
	if !clientRequestIDPattern.MatchString(value) {
		return ""
	}
	return value
}

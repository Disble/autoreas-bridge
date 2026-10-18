package requestcapture

import (
	"regexp"
	"strings"
)

// routeIDPlaceholder replaces every identifier-like path segment.
const routeIDPlaceholder = ":id"

// minHexIDLength is the shortest all-hex segment treated as an identifier.
const minHexIDLength = 16

// uuidSegment matches a whole canonical 8-4-4-4-12 hex UUID segment.
var uuidSegment = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// RouteTemplate collapses a concrete captured route into the key the hourly
// rollup and the response versions group by: the query string is dropped,
// the segment after /animes/ becomes :id whatever it holds, and any other
// segment that is all digits, all hex of 16+ chars, or a UUID becomes :id.
func RouteTemplate(route string) string {
	if index := strings.IndexByte(route, '?'); index >= 0 {
		route = route[:index]
	}
	segments := strings.Split(route, "/")
	for index, segment := range segments {
		if isRouteIDSegment(segments, index, segment) {
			segments[index] = routeIDPlaceholder
		}
	}
	return strings.Join(segments, "/")
}

// isRouteIDSegment reports whether segment, at index in segments, is an
// identifier the template replaces.
func isRouteIDSegment(segments []string, index int, segment string) bool {
	if segment == "" {
		return false
	}
	if index > 0 && segments[index-1] == "animes" {
		return true
	}
	return isAllDigits(segment) || (len(segment) >= minHexIDLength && isAllHex(segment)) || uuidSegment.MatchString(segment)
}

// isAllDigits reports whether value holds only ASCII digits.
func isAllDigits(value string) bool {
	return strings.Trim(value, "0123456789") == ""
}

// isAllHex reports whether value holds only ASCII hex digits.
func isAllHex(value string) bool {
	return strings.Trim(value, "0123456789abcdefABCDEF") == ""
}

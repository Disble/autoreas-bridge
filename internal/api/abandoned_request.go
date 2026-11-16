package api

import "net/http"

// reportAbandonedRequests tells onAbandoned the route of each request whose
// context ended before its handler returned: the client gave up, typically on
// its own timeout. It is the cost-free signal of a hung Bridge. A healthy
// request finishes with a live context, so the check costs nothing until a
// client actually gives up, and the report runs after the handler, on a
// goroutine whose client is already gone. /ws is skipped: a WebSocket ends by
// closing, which is not a hang. A nil onAbandoned leaves next unwrapped.
func reportAbandonedRequests(next http.Handler, onAbandoned func(route string)) http.Handler {
	if onAbandoned == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
		if r.URL.Path != webSocketRoutePath && r.Context().Err() != nil {
			onAbandoned(r.URL.Path)
		}
	})
}

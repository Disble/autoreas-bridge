package requestcapture

import "testing"

// TestRouteTemplate pins every rule that collapses a concrete route into its
// rollup/version key: query strip, the /animes/<any> segment, digit, 16+ hex
// and UUID segments, and the segments that must stay literal.
func TestRouteTemplate(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name  string
		route string
		want  string
	}{
		{"plain route stays", "/api/animes", "/api/animes"},
		{"query string stripped", "/api/animes?since=10&x=1", "/api/animes"},
		{"empty query stripped", "/api/status?", "/api/status"},
		{"anime segment any value", "/api/animes/one-piece", "/api/animes/:id"},
		{"anime segment named sub-route", "/api/animes/changes?since=5", "/api/animes/:id"},
		{"anime segment keeps the rest", "/api/animes/abc/cover", "/api/animes/:id/cover"},
		{"all digits segment", "/api/devices/12345", "/api/devices/:id"},
		{"single digit segment", "/api/devices/7/x", "/api/devices/:id/x"},
		{"digits mixed with letters stay", "/api/v2/items", "/api/v2/items"},
		{"hex of 16 chars", "/api/files/0123456789abcdef", "/api/files/:id"},
		{"upper hex of 16+ chars", "/api/files/0123456789ABCDEF01", "/api/files/:id"},
		{"hex of 15 chars stays", "/api/files/0123456789abcde", "/api/files/0123456789abcde"},
		{"16 chars not all hex stay", "/api/files/0123456789abcdeg", "/api/files/0123456789abcdeg"},
		{"uuid segment", "/api/conflicts/123e4567-e89b-12d3-a456-426614174000", "/api/conflicts/:id"},
		{"uuid with misplaced dash stays", "/api/conflicts/123e4567e-89b-12d3-a456-42661417400", "/api/conflicts/123e4567e-89b-12d3-a456-42661417400"},
		{"uuid with non-hex stays", "/api/conflicts/123e4567-e89b-12d3-a456-42661417400z", "/api/conflicts/123e4567-e89b-12d3-a456-42661417400z"},
		{"several id segments", "/api/a/12/b/0123456789abcdef", "/api/a/:id/b/:id"},
		{"ws route stays", "/ws", "/ws"},
		{"query only", "?since=1", ""},
		{"relative anime route", "animes/abc", "animes/:id"},
		{"empty route", "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := RouteTemplate(tc.route); got != tc.want {
				t.Fatalf("RouteTemplate(%q) = %q, want %q", tc.route, got, tc.want)
			}
		})
	}
}

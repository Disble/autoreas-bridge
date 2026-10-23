package cfclearance

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// html builds a 2xx response with the given Content-Type and body.
func html(code int, contentType, body string) *http.Response {
	return respond(code, http.Header{"Content-Type": {contentType}}, body)
}

// mitigated builds a response carrying Cf-Mitigated with the given value.
func mitigated(code int, value string) *http.Response {
	return respond(code, http.Header{"Cf-Mitigated": {value}}, "blocked")
}

// filler is just under the sniff limit so a marker appended to it ends exactly at the limit.
var filler = strings.Repeat("a", challengeSniffLimit-len("just a moment"))

func TestIsChallengeMatrix(t *testing.T) {
	cases := []struct {
		name string
		resp *http.Response
		want bool
	}{
		{"nil response", nil, false},
		{"403 mitigated", mitigated(http.StatusForbidden, "challenge"), true},
		{"503 mitigated", mitigated(http.StatusServiceUnavailable, "challenge"), true},
		{"header value in any casing", mitigated(http.StatusForbidden, "Challenge"), true},
		{"bare 403", respond(http.StatusForbidden, nil, "forbidden"), false},
		{"403 with another mitigation", mitigated(http.StatusForbidden, "block"), false},
		{"200 with the header but no HTML", mitigated(http.StatusOK, "challenge"), false},
		{"interstitial title", html(http.StatusOK, "text/html", "<title>Just a moment...</title>"), true},
		{"challenge options script", html(http.StatusOK, "text/html; charset=utf-8", "window._cf_chl_opt={}"), true},
		{"content type in any casing", html(http.StatusOK, "TEXT/HTML", "just a moment"), true},
		{"content type with surrounding space", html(http.StatusOK, " text/html ", "just a moment"), true},
		{"plain site page", html(http.StatusOK, "text/html", "<title>JKAnime</title>"), false},
		{"marker in a non-HTML body", html(http.StatusOK, "application/json", `{"t":"just a moment"}`), false},
		{"marker ending at the sniff limit", html(http.StatusOK, "text/html", filler+"just a moment"), true},
		{"marker beyond the sniff limit", html(http.StatusOK, "text/html", filler+"ajust a moment"), false},
		{"marker on a 3xx", html(http.StatusFound, "text/html", "just a moment"), false},
		{"marker on a 199", html(199, "text/html", "just a moment"), false},
		{"marker on a 299", html(299, "text/html", "just a moment"), true},
		{"HTML without a body", &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": {"text/html"}}}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var want string
			if tc.resp != nil && tc.resp.Body != nil {
				want = bodyOf(tc.resp)
			}

			got := IsChallenge(tc.resp)

			if got != tc.want {
				t.Fatalf("IsChallenge = %v, want %v", got, tc.want)
			}
			if want != "" {
				if body := readBody(t, tc.resp); body != want {
					t.Fatalf("body after detection = %d bytes, want the original %d bytes", len(body), len(want))
				}
			}
		})
	}
}

// bodyOf peeks at a canned response's body without consuming it.
func bodyOf(resp *http.Response) string {
	b, _ := io.ReadAll(resp.Body)
	resp.Body = io.NopCloser(strings.NewReader(string(b)))
	return string(b)
}

func TestOnlyHTMLBodiesOfSuccessfulResponsesAreRead(t *testing.T) {
	cases := []struct {
		name        string
		code        int
		contentType string
		header      http.Header
		read        bool
	}{
		{"HTML success", http.StatusOK, "text/html", nil, true},
		{"JSON success", http.StatusOK, "application/json", nil, false},
		{"HTML redirect", http.StatusFound, "text/html", nil, false},
		{"mitigated 403", http.StatusForbidden, "text/html", http.Header{"Cf-Mitigated": {"challenge"}}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := &spyBody{Reader: strings.NewReader("just a moment")}
			h := tc.header
			if h == nil {
				h = http.Header{}
			}
			h.Set("Content-Type", tc.contentType)

			IsChallenge(&http.Response{StatusCode: tc.code, Header: h, Body: body})

			if (body.reads > 0) != tc.read {
				t.Fatalf("reads = %d, want read=%v", body.reads, tc.read)
			}
		})
	}
}

func TestInterstitialPageFromARealServerIsSolved(t *testing.T) {
	var solved bool
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(clearanceCookie); err == nil && c.Value == "good" {
			solved = true
			_, _ = io.WriteString(w, "<title>JKAnime</title>")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, "<html><head><title>Just a moment...</title></head></html>")
	}))
	defer srv.Close()
	bus := &recorder{}
	solver := &fakeSolver{values: []string{"good"}, cookies: bareCookies}
	tr := NewTransport(srv.Client().Transport, solver, nil, bus, Policy{})

	resp := get(t, tr, srv.URL+"/")

	assertStatusAndCalls(t, resp, solver, http.StatusOK, 1)
	if body := readBody(t, resp); !solved || body != "<title>JKAnime</title>" {
		t.Fatalf("solved=%v body=%q", solved, body)
	}
	detected := eventAt(t, bus, 0).(ChallengeDetectedEvent)
	if detected.Reason != challengeByBody || detected.Domain != "127.0.0.1" {
		t.Fatalf("detected = %+v, want the html marker on the server's own host", detected)
	}
}

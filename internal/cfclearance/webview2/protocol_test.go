package webview2

import (
	"bytes"
	"errors"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/cfclearance"
)

// goodLine is a complete child report: a fresh cf_clearance plus a session cookie.
const goodLine = Marker + `{"userAgent":"UA/1","cookies":[` +
	`{"name":"cf_clearance","value":"fresh","domain":".example.net","path":"/","expires":1824263637.7,"secure":true,"httpOnly":true},` +
	`{"name":"tmp","value":"s","expires":-1},{"name":"zero","value":"z","expires":0}]}`

// noise is the stdout chatter the engine library prints around the protocol line.
const noise = "[WebView2] Environment created successfully\n"

func TestDecodeAcceptsAFreshClearance(t *testing.T) {
	for name, out := range map[string]string{
		"bare line":              goodLine + "\n",
		"noise before and after": noise + goodLine + "\nStack trace:\n",
		"output at the bound":    strings.Repeat("x", MaxOutputBytes-len(goodLine)-1) + "\n" + goodLine,
		"one line at the bound":  strings.Repeat("x", MaxOutputBytes-len(goodLine)) + goodLine,
	} {
		t.Run(name, func(t *testing.T) {
			got, err := Decode([]byte(out), "old")
			if err != nil {
				t.Fatal(err)
			}
			assertGoodClearance(t, got)
		})
	}
}

// assertGoodClearance checks every field goodLine carries, including both session cookies.
func assertGoodClearance(t *testing.T, got cfclearance.Clearance) {
	t.Helper()
	if got.UserAgent != "UA/1" || len(got.Cookies) != 3 {
		t.Fatalf("clearance = %+v", got)
	}
	c := got.Cookies[0]
	if c.Name != "cf_clearance" || c.Value != "fresh" || c.Domain != ".example.net" || c.Path != "/" ||
		!c.Secure || !c.HttpOnly || !c.Expires.Equal(time.Unix(1824263637, 0)) {
		t.Fatalf("cookie = %+v", c)
	}
	for _, session := range got.Cookies[1:] {
		if !session.Expires.IsZero() {
			t.Fatalf("session cookie %s got expiry %v", session.Name, session.Expires)
		}
	}
}

func TestDecodeRefusesUnusableOutput(t *testing.T) {
	cases := map[string]struct {
		out  string
		want error
	}{
		"missing line":     {noise + "engine crashed\n", errNoLine},
		"malformed json":   {Marker + "{\n", errMalformed},
		"empty user agent": {Marker + `{"userAgent":"","cookies":[{"name":"cf_clearance","value":"fresh"}]}`, errNoUserAgent},
		"stale cookie":     {Marker + `{"userAgent":"UA/1","cookies":[{"name":"cf_clearance","value":"old"}]}`, errNoFreshClearance},
		"empty cookie":     {Marker + `{"userAgent":"UA/1","cookies":[{"name":"cf_clearance","value":""}]}`, errNoFreshClearance},
		"no cookie":        {Marker + `{"userAgent":"UA/1","cookies":[{"name":"tmp","value":"s"}]}`, errNoFreshClearance},
		"error field":      {Marker + `{"userAgent":"UA/1","cookies":[{"name":"cf_clearance","value":"fresh"}],"error":"timed out"}`, errChildFailed},
		"oversized":        {strings.Repeat("x", MaxOutputBytes+1), errOversized},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := Decode([]byte(tc.out), "old")
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if got.UserAgent != "" || len(got.Cookies) != 0 {
				t.Fatalf("refused output still yielded %+v", got)
			}
		})
	}
}

func TestDecodeReportsTheChildError(t *testing.T) {
	_, err := Decode([]byte(Marker+`{"error":"timed out waiting"}`), "")
	if err == nil || !strings.Contains(err.Error(), "timed out waiting") {
		t.Fatalf("err = %v, want the child's reason", err)
	}
}

func TestEncodeRoundTripsThroughDecode(t *testing.T) {
	line := Encode(Result{UserAgent: "UA/2", Cookies: []Cookie{{Name: "cf_clearance", Value: "v", Domain: "a.net", Path: "/", Expires: 1, Secure: true, HTTPOnly: true}}})
	if !strings.HasPrefix(line, Marker) || bytes.ContainsAny([]byte(line), "\n") {
		t.Fatalf("line = %q", line)
	}
	got, err := Decode([]byte("noise\n"+line+"\n"), "")
	if err != nil {
		t.Fatal(err)
	}
	c := got.Cookies[0]
	if got.UserAgent != "UA/2" || c.Value != "v" || c.Domain != "a.net" || !c.Secure || !c.HttpOnly || !c.Expires.Equal(time.Unix(1, 0)) {
		t.Fatalf("round trip lost fields: %+v", c)
	}
}

package webview2

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"autoreas-bridge/internal/cfclearance"
)

// Marker prefixes the single protocol line the solver child prints on stdout, so engine log
// noise on the same stream can never be mistaken for the result.
const Marker = "CFCLEARANCE:"

// MaxOutputBytes bounds the child's stdout the parent keeps and inspects.
const MaxOutputBytes = 64 << 10

// clearanceCookie is the cookie Cloudflare checks to let a solved client through.
const clearanceCookie = "cf_clearance"

// Result is the wire shape of one solve as the child reports it. A non-empty Error means the
// solve failed and the other fields are not to be trusted.
type Result struct {
	UserAgent string   `json:"userAgent"`
	Cookies   []Cookie `json:"cookies"`
	Error     string   `json:"error,omitempty"`
}

// Cookie is one engine cookie on the wire.
type Cookie struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Domain string `json:"domain"`
	Path   string `json:"path"`
	// Expires is seconds since the Unix epoch; zero or negative marks a session cookie.
	Expires  float64 `json:"expires"`
	Secure   bool    `json:"secure"`
	HTTPOnly bool    `json:"httpOnly"`
}

// Sentinel reasons Decode wraps, one per rule of the protocol.
var (
	errOversized        = errors.New("solver output exceeds the protocol bound")
	errNoLine           = errors.New("solver output carries no protocol line")
	errMalformed        = errors.New("solver protocol line is not valid JSON")
	errChildFailed      = errors.New("solver child reported a failure")
	errNoUserAgent      = errors.New("solver result carries no User-Agent")
	errNoFreshClearance = errors.New("solver result carries no fresh cf_clearance")
)

// Encode renders r as the one protocol line, without a trailing newline. Result only holds
// strings, numbers and booleans, so marshalling cannot fail.
func Encode(r Result) string {
	line, _ := json.Marshal(r)
	return Marker + string(line)
}

// Decode finds the protocol line in the child's output, decodes it and validates the result
// against rejected, the cf_clearance value the upstream refused: a usable result carries a
// non-empty User-Agent and a cf_clearance other than rejected, and reports no error.
func Decode(out []byte, rejected string) (cfclearance.Clearance, error) {
	res, err := decode(out)
	if err == nil {
		err = validate(res, rejected)
	}
	if err != nil {
		return cfclearance.Clearance{}, fmt.Errorf("cfclearance webview2: %w", err)
	}
	return cfclearance.Clearance{UserAgent: res.UserAgent, Cookies: toHTTPCookies(res.Cookies)}, nil
}

// decode locates the marked line in a bounded output and unmarshals it.
func decode(out []byte) (Result, error) {
	var res Result
	if len(out) > MaxOutputBytes {
		return res, errOversized
	}
	line, ok := findLine(out)
	if !ok {
		return res, errNoLine
	}
	if err := json.Unmarshal(line, &res); err != nil {
		return res, fmt.Errorf("%w: %w", errMalformed, err)
	}
	return res, nil
}

// findLine returns the JSON payload of the first line carrying Marker.
func findLine(out []byte) ([]byte, bool) {
	sc := bufio.NewScanner(bytes.NewReader(out))
	sc.Buffer(make([]byte, 0, 4096), MaxOutputBytes+1)
	for sc.Scan() {
		line := sc.Bytes()
		if i := bytes.Index(line, []byte(Marker)); i >= 0 {
			return bytes.Clone(line[i+len(Marker):]), true
		}
	}
	return nil, false
}

// validate applies the rules a usable result must satisfy, in the order a reader would check
// them: the child's own verdict, then the identity, then the clearance itself.
func validate(res Result, rejected string) error {
	if res.Error != "" {
		return fmt.Errorf("%w: %s", errChildFailed, res.Error)
	}
	if strings.TrimSpace(res.UserAgent) == "" {
		return errNoUserAgent
	}
	if !freshClearance(res.Cookies, rejected) {
		return errNoFreshClearance
	}
	return nil
}

// freshClearance reports whether cookies carry a non-empty cf_clearance other than rejected.
func freshClearance(cookies []Cookie, rejected string) bool {
	for _, c := range cookies {
		if c.Name == clearanceCookie && c.Value != "" && c.Value != rejected {
			return true
		}
	}
	return false
}

// toHTTPCookies converts wire cookies; a non-positive expiry stays a session cookie.
func toHTTPCookies(in []Cookie) []*http.Cookie {
	out := make([]*http.Cookie, 0, len(in))
	for _, c := range in {
		ck := &http.Cookie{
			Name: c.Name, Value: c.Value, Domain: c.Domain, Path: c.Path,
			Secure: c.Secure, HttpOnly: c.HTTPOnly,
		}
		if c.Expires > 0 {
			ck.Expires = time.Unix(int64(c.Expires), 0)
		}
		out = append(out, ck)
	}
	return out
}

package handlers

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

// coverStubs scripts the cover endpoint's seams and records what the handler asked for.
type coverStubs struct {
	authOK     bool
	anime      *MobileAnime
	animeErr   error
	thumbnail  contracts.CoverThumbnail
	status     contracts.CoverThumbnailStatus
	askedID    string
	askedCover string
	thumbCalls int
}

// authenticate returns the scripted authentication result for a cover request.
func (s *coverStubs) authenticate(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
	if !s.authOK {
		writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
		return device.PairedDevice{}, false
	}
	return device.PairedDevice{DeviceID: "device-1"}, true
}

// getAnime records the requested id and returns the scripted anime or error.
func (s *coverStubs) getAnime(_ context.Context, id string) (*MobileAnime, error) {
	s.askedID = id
	return s.anime, s.animeErr
}

// GetCoverThumbnail records the requested source and returns the scripted outcome.
func (s *coverStubs) GetCoverThumbnail(_ context.Context, source string) (contracts.CoverThumbnail, contracts.CoverThumbnailStatus) {
	s.askedCover, s.thumbCalls = source, s.thumbCalls+1
	return s.thumbnail, s.status
}

// coverCase is one ordered decision-table row for the cover endpoint; zero values mean "not configured" and the want fields assert the response.
type coverCase struct {
	name          string
	method        string
	ifNoneMatch   string
	noAuth        bool
	nilQuery      bool
	nilThumbnail  bool
	notFound      bool
	anime         *MobileAnime
	animeErr      error
	thumbnail     contracts.CoverThumbnail
	status        contracts.CoverThumbnailStatus
	wantStatus    int
	wantBody      []byte
	wantETag      string
	wantRetry     string
	wantNoWork    bool
	wantContentTy string
}

// TestAnimeCoverServesTheOrderedContract drives every ordered row of the mobile cover
// contract through the handler: 405 before 401, nil seams and lookup failures 503 without
// Retry-After, permanent outcomes 204 bodyless, transient outcomes 503 with the estimable
// Retry-After only, exact strong ETag 304, and a servable JPEG 200.
func TestAnimeCoverServesTheOrderedContract(t *testing.T) {
	t.Parallel()

	jpeg := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x01}
	served := contracts.CoverThumbnail{Bytes: jpeg, ETag: `"abc123"`}
	cover := "https://cdn.example.com/cover.jpg"
	withCover := &MobileAnime{ID: "anime-1", Active: 1, Cover: &cover}
	deleted := &MobileAnime{ID: "anime-1", Active: 0, Cover: &cover}

	cases := []coverCase{
		{name: "TestAnimeCoverRejectsHEADBeforeAuthentication", method: http.MethodHead, noAuth: true, wantStatus: http.StatusMethodNotAllowed},
		{name: "TestAnimeCoverRejectsPATCHWithoutMutation", method: http.MethodPatch, anime: withCover, wantStatus: http.StatusMethodNotAllowed, wantNoWork: true},
		{name: "TestAnimeCoverRejectsGETWithoutAuthentication", method: http.MethodGet, noAuth: true, anime: withCover, wantStatus: http.StatusUnauthorized},
		{name: "TestAnimeCoverReturns503ForNilQuerySeam", method: http.MethodGet, nilQuery: true, wantStatus: http.StatusServiceUnavailable},
		{name: "TestAnimeCoverReturns503ForNilThumbnailSeam", method: http.MethodGet, nilThumbnail: true, anime: withCover, wantStatus: http.StatusServiceUnavailable},
		{name: "TestAnimeCoverLookupFailureReturns503WithoutRetryAfter", method: http.MethodGet, animeErr: errors.New("lookup down"), wantStatus: http.StatusServiceUnavailable},
		{name: "TestAnimeCoverReturns404ForUnknownAnime", method: http.MethodGet, notFound: true, animeErr: errors.New("missing"), wantStatus: http.StatusNotFound},
		{name: "TestAnimeCoverReturns204ForMissingAnime", method: http.MethodGet, wantStatus: http.StatusNoContent},
		{name: "TestAnimeCoverReturns204ForNilCover", method: http.MethodGet, anime: &MobileAnime{ID: "anime-1", Active: 1}, wantStatus: http.StatusNoContent},
		{name: "TestAnimeCoverSoftDeletedAnimeReturns200", method: http.MethodGet, anime: deleted, thumbnail: served, status: contracts.CoverThumbnailServed, wantStatus: http.StatusOK, wantBody: jpeg, wantETag: `"abc123"`, wantContentTy: "image/jpeg"},
		{name: "TestAnimeCoverMapsPermanentOutcomeToEmpty204", method: http.MethodGet, anime: withCover, status: contracts.CoverThumbnailPermanent, wantStatus: http.StatusNoContent},
		{name: "TestAnimeCoverMapsTransientOutcomeTo503", method: http.MethodGet, anime: withCover, status: contracts.CoverThumbnailTransient, wantStatus: http.StatusServiceUnavailable},
		{name: "TestAnimeCoverAppliesRetryAfterForSaturation", method: http.MethodGet, anime: withCover, status: contracts.CoverThumbnailTransient, thumbnail: contracts.CoverThumbnail{RetryAfterSeconds: 5}, wantStatus: http.StatusServiceUnavailable, wantRetry: "5"},
		{name: "TestAnimeCoverAppliesRetryAfterFromOriginClamp", method: http.MethodGet, anime: withCover, status: contracts.CoverThumbnailTransient, thumbnail: contracts.CoverThumbnail{RetryAfterSeconds: 3600}, wantStatus: http.StatusServiceUnavailable, wantRetry: "3600"},
		{name: "TestAnimeCoverAppliesRetryAfterFloor", method: http.MethodGet, anime: withCover, status: contracts.CoverThumbnailTransient, thumbnail: contracts.CoverThumbnail{RetryAfterSeconds: 1}, wantStatus: http.StatusServiceUnavailable, wantRetry: "1"},
		{name: "TestAnimeCoverReturns304ForExactStrongETag", method: http.MethodGet, anime: withCover, thumbnail: served, status: contracts.CoverThumbnailServed, ifNoneMatch: `"abc123"`, wantStatus: http.StatusNotModified, wantETag: `"abc123"`},
		{name: "TestAnimeCoverReturns200ForStaleETag", method: http.MethodGet, anime: withCover, thumbnail: served, status: contracts.CoverThumbnailServed, ifNoneMatch: `"old"`, wantStatus: http.StatusOK, wantBody: jpeg, wantETag: `"abc123"`, wantContentTy: "image/jpeg"},
		{name: "TestAnimeCoverReturns200ForWeakETag", method: http.MethodGet, anime: withCover, thumbnail: served, status: contracts.CoverThumbnailServed, ifNoneMatch: `W/"abc123"`, wantStatus: http.StatusOK, wantBody: jpeg, wantETag: `"abc123"`, wantContentTy: "image/jpeg"},
		{name: "TestAnimeCoverReturnsJPEGHeadersAndBody", method: http.MethodGet, anime: withCover, thumbnail: served, status: contracts.CoverThumbnailServed, wantStatus: http.StatusOK, wantBody: jpeg, wantETag: `"abc123"`, wantContentTy: "image/jpeg"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			res, stubs := sendCoverRequest(t, tc)
			assertCoverResponse(t, tc, res)
			assertCoverWork(t, tc, stubs)
		})
	}
}

// sendCoverRequest runs one table row through the endpoint and returns its response and stubs.
func sendCoverRequest(t *testing.T, tc coverCase) (*httptest.ResponseRecorder, *coverStubs) {
	t.Helper()

	stubs := &coverStubs{authOK: !tc.noAuth, anime: tc.anime, animeErr: tc.animeErr, thumbnail: tc.thumbnail, status: tc.status}
	config := AnimeCoverConfig{
		Authenticate:    stubs.authenticate,
		GetMobileAnime:  stubs.getAnime,
		CoverThumbnails: stubs,
		IsAnimeNotFound: func(error) bool { return tc.notFound },
	}
	if tc.nilQuery {
		config.GetMobileAnime = nil
	}
	if tc.nilThumbnail {
		config.CoverThumbnails = nil
	}
	req := httptest.NewRequest(tc.method, "/api/animes/anime-1/cover", nil)
	req.SetPathValue("id", "anime-1")
	if tc.ifNoneMatch != "" {
		req.Header.Set("If-None-Match", tc.ifNoneMatch)
	}
	res := httptest.NewRecorder()

	NewAnimeCoverHandler(config).ServeHTTP(res, req)
	return res, stubs
}

// assertCoverResponse checks one row's status, Retry-After, ETag, content headers and body.
func assertCoverResponse(t *testing.T, tc coverCase, res *httptest.ResponseRecorder) {
	t.Helper()

	if res.Code != tc.wantStatus {
		t.Fatalf("status = %d, want %d (body %q)", res.Code, tc.wantStatus, res.Body.String())
	}
	if res.Header().Get("Retry-After") != tc.wantRetry {
		t.Fatalf("Retry-After = %q, want %q", res.Header().Get("Retry-After"), tc.wantRetry)
	}
	if res.Header().Get("ETag") != tc.wantETag && (tc.wantStatus == http.StatusOK || tc.wantStatus == http.StatusNotModified) {
		t.Fatalf("ETag = %q, want %q", res.Header().Get("ETag"), tc.wantETag)
	}
	wantType := wantCoverContentType(tc)
	if got := res.Header().Get("Content-Type"); got != wantType {
		t.Fatalf("Content-Type = %q, want %q", got, wantType)
	}
	if tc.wantContentTy != "" {
		if cl := res.Header().Get("Content-Length"); cl != strconv.Itoa(len(tc.wantBody)) {
			t.Fatalf("Content-Length = %q, want %d", cl, len(tc.wantBody))
		}
	}
	if tc.wantBody != nil || tc.wantStatus == http.StatusNoContent || tc.wantStatus == http.StatusNotModified {
		if !bytes.Equal(res.Body.Bytes(), tc.wantBody) {
			t.Fatalf("body = %q, want %q", res.Body.Bytes(), tc.wantBody)
		}
	}
}

// wantCoverContentType returns the Content-Type one row must carry: a bodyless status carries
// none, a served row carries its JPEG type, and every JSON error carries application/json.
func wantCoverContentType(tc coverCase) string {
	if tc.wantStatus == http.StatusNoContent || tc.wantStatus == http.StatusNotModified {
		return ""
	}
	if tc.wantContentTy != "" {
		return tc.wantContentTy
	}
	return "application/json"
}

// assertCoverWork checks that a rejected method did no thumbnail work and that the seams
// were asked for the resolved anime id and cover source.
func assertCoverWork(t *testing.T, tc coverCase, stubs *coverStubs) {
	t.Helper()

	if tc.wantNoWork && stubs.thumbCalls != 0 {
		t.Fatalf("thumbnail work ran %d time(s) for a rejected method", stubs.thumbCalls)
	}
	if stubs.askedID != "" && stubs.askedID != "anime-1" {
		t.Fatalf("lookup id = %q, want the path value anime-1", stubs.askedID)
	}
	if stubs.thumbCalls > 0 && stubs.askedCover != "https://cdn.example.com/cover.jpg" {
		t.Fatalf("thumbnail source = %q, want the anime's cover", stubs.askedCover)
	}
}

package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

type stubOutcomePatchWriter struct {
	result contracts.AnimePatchResult
	err    error
}

func TestPatchAnimeHandlerOutcomeAdapterKeepsExistingWireShape(t *testing.T) {
	tests := []struct {
		name       string
		result     contracts.AnimePatchResult
		wantStatus int
		wantBody   string
	}{
		{
			name: "no op remains the existing success response",
			result: contracts.AnimePatchResult{
				AnimeID: "anime-1", Outcome: contracts.AnimePatchOutcomeNoOp, ModifiedAt: 1000,
			},
			wantStatus: http.StatusOK,
			wantBody:   `"status":"ok"`,
		},
		{
			name: "conflict is not reported as success",
			result: contracts.AnimePatchResult{
				AnimeID: "anime-1", Outcome: contracts.AnimePatchOutcomeConflict, ModifiedAt: 1000, ConflictID: "conflict-12",
			},
			wantStatus: http.StatusInternalServerError,
			wantBody:   `"error":"patch anime failed"`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			stubs := newAnimeHandlerStubs()
			stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
			handler := NewPatchAnimeHandler(PatchAnimeConfig{
				Authenticate: stubs.authenticate(true), QueryAnime: stubs.queryAnime,
				PatchAnime: AdaptAnimePatchWriter(stubOutcomePatchWriter{result: test.result}),
				IsNotFound: func(error) bool { return false },
			})
			request := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"episodesWatched":2}`))
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != test.wantStatus || !strings.Contains(response.Body.String(), test.wantBody) {
				t.Fatalf("response = %d %s, want status %d containing %s", response.Code, response.Body.String(), test.wantStatus, test.wantBody)
			}
		})
	}
}

func (s stubOutcomePatchWriter) PatchAnime(context.Context, string, contracts.AnimePatch) (contracts.AnimePatchResult, error) {
	return s.result, s.err
}

func TestAdaptAnimePatchWriterPreservesStableErrorOnlyTransportContract(t *testing.T) {
	writeErr := errors.New("write failed")
	tests := []struct {
		name      string
		result    contracts.AnimePatchResult
		err       error
		wantErr   error
		wantError bool
	}{
		{name: "applied", result: contracts.AnimePatchResult{Outcome: contracts.AnimePatchOutcomeApplied}},
		{name: "no op", result: contracts.AnimePatchResult{Outcome: contracts.AnimePatchOutcomeNoOp}},
		{name: "conflict is not downgraded to success", result: contracts.AnimePatchResult{Outcome: contracts.AnimePatchOutcomeConflict, ConflictID: "conflict-11"}, wantErr: ErrAnimePatchConflict},
		{name: "writer failure", err: writeErr, wantErr: writeErr},
		{name: "unknown outcome", result: contracts.AnimePatchResult{Outcome: "unexpected"}, wantError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			adapter := AdaptAnimePatchWriter(stubOutcomePatchWriter{result: test.result, err: test.err})
			err := adapter(context.Background(), "anime-1", AnimePatch{})
			if test.wantErr != nil && !errors.Is(err, test.wantErr) {
				t.Fatalf("adapter error = %v, want %v", err, test.wantErr)
			}
			if test.wantError && err == nil {
				t.Fatal("adapter error = nil, want explicit outcome projection failure")
			}
			if test.wantErr == nil && !test.wantError && err != nil {
				t.Fatalf("adapter error = %v, want nil", err)
			}
		})
	}
}

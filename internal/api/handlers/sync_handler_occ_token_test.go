package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/requestcapture"
)

func TestSyncHandlerNoOpEchoesZeroModifiedAt(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		ApplyPendingPatch: func(_ context.Context, id string, _ AnimePatch) (contracts.AnimePatchResult, error) {
			return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeNoOp, ModifiedAt: 0}, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":1},"created_at":1}]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusAccepted, res.Code, res.Body.String())
	}
	entries := decodeAppliedOperationEntries(t, res.Body.Bytes())
	if len(entries) != 1 {
		t.Fatalf("expected 1 applied operation entry, got %#v", entries)
	}
	assertAppliedEntry(t, entries[0], true, "", int64Ptr(0))
}

func TestSyncHandlerReportsConflictAsPerOperationOutcome(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		ApplyPendingPatch: func(_ context.Context, id string, _ AnimePatch) (contracts.AnimePatchResult, error) {
			return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeConflict, ModifiedAt: 900}, fmt.Errorf("%w: anime=%s", ErrAnimePatchConflict, id)
		},
		ListChangesAfterID: func(context.Context, int64) ([]AnimeChange, int64, error) {
			return []AnimeChange{{RecordID: "anime-1", ChangeType: "update", Timestamp: 1}}, 1, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":1},"created_at":1}]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusAccepted, res.Code, res.Body.String())
	}
	var payload ReconcileResponse
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.LastChangelogID != 1 || len(payload.BridgeChanges) != 1 {
		t.Fatalf("expected outer fields intact on a conflict, got %#v", payload)
	}
	entries := decodeAppliedOperationEntries(t, res.Body.Bytes())
	if len(entries) != 1 {
		t.Fatalf("expected 1 applied operation entry, got %#v", entries)
	}
	assertAppliedEntry(t, entries[0], false, "conflict", int64Ptr(900))
}

func TestSyncHandlerMixedBatchPreservesOrderAndOuterFields(t *testing.T) {
	t.Parallel()

	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: (&syncHandlerStubs{}).authenticate(true),
		ApplyPendingPatch: func(_ context.Context, id string, _ AnimePatch) (contracts.AnimePatchResult, error) {
			if id == "anime-conflict" {
				return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeConflict, ModifiedAt: 900}, fmt.Errorf("%w: anime=%s", ErrAnimePatchConflict, id)
			}
			return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 1000}, nil
		},
		ListChangesAfterID: func(context.Context, int64) ([]AnimeChange, int64, error) {
			return []AnimeChange{{RecordID: "anime-applied", ChangeType: "update", Timestamp: 1}}, 1, nil
		},
	})

	body := `{"device_id":"device-1","last_changelog_id":0,"pending_operations":[` +
		`{"anime_id":"anime-applied","operation":"update","payload":{"episodesWatched":1},"created_at":1},` +
		`{"anime_id":"anime-conflict","operation":"update","payload":{"episodesWatched":1},"created_at":1},` +
		`{"anime_id":"anime-skipped","operation":"delete","payload":{},"created_at":1}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(body))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusAccepted, res.Code, res.Body.String())
	}
	var payload ReconcileResponse
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.LastChangelogID != 1 || len(payload.BridgeChanges) != 1 {
		t.Fatalf("expected outer fields intact for a mixed batch, got %#v", payload)
	}

	entries := decodeAppliedOperationEntries(t, res.Body.Bytes())
	if len(entries) != 3 {
		t.Fatalf("expected 3 applied operation entries, got %#v", entries)
	}
	assertAppliedEntry(t, entries[0], true, "", int64Ptr(1000))
	assertAppliedEntry(t, entries[1], false, "conflict", int64Ptr(900))
	assertAppliedEntry(t, entries[2], false, "unsupported_operation", nil)

	var animeIDs [3]string
	for i, entry := range entries {
		if err := json.Unmarshal(entry["anime_id"], &animeIDs[i]); err != nil {
			t.Fatalf("decode anime_id: %v", err)
		}
	}
	if want := [3]string{"anime-applied", "anime-conflict", "anime-skipped"}; animeIDs != want {
		t.Fatalf("expected submission order preserved, got %#v", animeIDs)
	}
}

func TestSyncHandlerNonConflictWriterErrorStillAborts(t *testing.T) {
	t.Parallel()

	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: (&syncHandlerStubs{}).authenticate(true),
		ApplyPendingPatch: func(context.Context, string, AnimePatch) (contracts.AnimePatchResult, error) {
			return contracts.AnimePatchResult{}, errors.New("boom")
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":1},"created_at":1}]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, res.Code)
	}
	if !strings.Contains(res.Body.String(), "apply pending operation failed") {
		t.Fatalf("expected abort error message, got body=%s", res.Body.String())
	}
}

func TestSyncHandlerRecordsConflictOutcomeInCaptureCorrelations(t *testing.T) {
	t.Parallel()

	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: (&syncHandlerStubs{}).authenticate(true),
		ApplyPendingPatch: func(_ context.Context, id string, _ AnimePatch) (contracts.AnimePatchResult, error) {
			return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeConflict, ModifiedAt: 900}, fmt.Errorf("%w: anime=%s", ErrAnimePatchConflict, id)
		},
	})

	req, enr := enrichedReconcileRequest(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":1},"created_at":1}]}`)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusAccepted, res.Code, res.Body.String())
	}
	record := requestcapture.MergeEnrichment(requestcapture.CaptureRecord{}, enr)
	refs := record.Correlations.OperationRefs
	if len(refs) != 1 || refs[0].AnimeID != "anime-1" || refs[0].Outcome != "conflict" {
		t.Fatalf("expected conflict outcome recorded in operation refs, got %#v", refs)
	}
}

// TestSyncHandlerIntraBatchConflictGuard covers the two guard cases from
// design's "a base-less operation after a conflict on the same anime is not
// applied": a later same-anime operation that omits base must be blocked
// without reaching the writer, while one that carries its own base must
// still be evaluated on its own merits.
func TestSyncHandlerIntraBatchConflictGuard(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                 string
		secondBaseField      string
		wantSecondApplied    bool
		wantSecondReason     string
		wantSecondModifiedAt int64
		wantWriterCalls      int
	}{
		{
			name:                 "base-less operation after a conflict is not applied",
			secondBaseField:      "",
			wantSecondApplied:    false,
			wantSecondReason:     "conflict",
			wantSecondModifiedAt: 900,
			wantWriterCalls:      2,
		},
		{
			name:                 "based operation matching current token after a conflict is still evaluated",
			secondBaseField:      `,"base":900`,
			wantSecondApplied:    true,
			wantSecondReason:     "",
			wantSecondModifiedAt: 1000,
			wantWriterCalls:      3,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			writerCalls := 0
			handler := NewSyncHandler(SyncHandlerConfig{
				Authenticate: (&syncHandlerStubs{}).authenticate(true),
				ApplyPendingPatch: func(_ context.Context, id string, patch AnimePatch) (contracts.AnimePatchResult, error) {
					writerCalls++
					if patch.Base == nil {
						return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeConflict, ModifiedAt: 900}, fmt.Errorf("%w: anime=%s", ErrAnimePatchConflict, id)
					}
					return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 1000}, nil
				},
			})

			// A third based operation follows the blocked/evaluated second one
			// in both cases, proving the batch keeps processing past it rather
			// than stopping -- the guard must skip only the blocked operation.
			body := `{"device_id":"device-1","last_changelog_id":0,"pending_operations":[` +
				`{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":1},"created_at":1},` +
				`{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":2` + test.secondBaseField + `},"created_at":2},` +
				`{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":3,"base":900},"created_at":3}]}`
			req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(body))
			res := httptest.NewRecorder()

			handler.ServeHTTP(res, req)

			if res.Code != http.StatusAccepted {
				t.Fatalf("expected status %d, got %d body=%s", http.StatusAccepted, res.Code, res.Body.String())
			}
			entries := decodeAppliedOperationEntries(t, res.Body.Bytes())
			if len(entries) != 3 {
				t.Fatalf("expected 3 applied operation entries, got %#v", entries)
			}
			assertAppliedEntry(t, entries[0], false, "conflict", int64Ptr(900))
			assertAppliedEntry(t, entries[1], test.wantSecondApplied, test.wantSecondReason, int64Ptr(test.wantSecondModifiedAt))
			assertAppliedEntry(t, entries[2], true, "", int64Ptr(1000))
			if writerCalls != test.wantWriterCalls {
				t.Fatalf("expected writer called %d time(s), got %d", test.wantWriterCalls, writerCalls)
			}
		})
	}
}

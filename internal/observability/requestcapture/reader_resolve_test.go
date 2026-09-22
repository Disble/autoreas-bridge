package requestcapture

import (
	"context"
	"database/sql"
	"strconv"
	"testing"
)

// resolveFixture describes one seeded capture for the resolver tests. It carries
// only the columns the resolver reads, so a row here states its match surface
// rather than re-stating the whole capture schema.
type resolveFixture struct {
	requestID       string
	capturedAtMS    int64
	route           string
	deviceID        string
	deviceName      string
	animeID         any
	httpStatus      any
	correlationJSON string
}

// seedResolveFixtures inserts one capture per fixture, defaulting the
// correlation envelope to an empty operation-ref list.
func seedResolveFixtures(t *testing.T, db *sql.DB, fixtures []resolveFixture) {
	t.Helper()

	for _, fixture := range fixtures {
		correlation := fixture.correlationJSON
		if correlation == "" {
			correlation = `{"operation_refs":[]}`
		}
		name := fixture.deviceName
		if name == "" {
			name = "Phone"
		}
		if _, err := db.Exec(`
			INSERT INTO request_captures (
				request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
				anime_id, http_status, payload_json, correlation_json
			) VALUES (?, ?, 'patch', ?, 'http', ?, ?, 'accepted', ?, ?, '{}', ?)`,
			fixture.requestID, fixture.capturedAtMS, fixture.route, fixture.deviceID, name,
			fixture.animeID, fixture.httpStatus, correlation); err != nil {
			t.Fatalf("seed capture %s: %v", fixture.requestID, err)
		}
	}
}

// assertResolveOrder asserts the resolved candidate ids, in order.
func assertResolveOrder(t *testing.T, got []ResolveCandidate, want ...string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("expected %d candidates %v, got %#v", len(want), want, got)
	}
	for index, id := range want {
		if got[index].RequestID != id {
			t.Fatalf("candidate %d: expected %q, got %q (full order %#v)", index, id, got[index].RequestID, got)
		}
	}
}

// TestResolveRanksExactAboveDeviceAboveSubstring pins the three rank tiers and
// their priority. The fixtures are seeded so that reverse-chronological order
// alone would return them in the opposite sequence, which is what makes the
// assertion about rank rather than about recency.
func TestResolveRanksExactAboveDeviceAboveSubstring(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	seedResolveFixtures(t, db, []resolveFixture{
		{requestID: "req-target", capturedAtMS: 100, route: "/api/sync/reconcile", deviceID: "device-1"},
		{requestID: "req-target-copy", capturedAtMS: 300, route: "/api/sync/reconcile", deviceID: "device-3"},
		{requestID: "req-elsewhere", capturedAtMS: 200, route: "/api/sync/reconcile", deviceID: "req-target"},
	})

	got, err := NewReader(db).Resolve(context.Background(), "req-target")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	// Rank 0 is the exact request id, rank 1 the exact device id, rank 2 the
	// incidental substring — even though rank 2 is the newest row.
	assertResolveOrder(t, got, "req-target", "req-elsewhere", "req-target-copy")
}

// TestResolveNarrowsToParsedComponents proves a reference with a status and a
// route fragment keeps only captures satisfying BOTH, and that an unrelated
// route with the same status is excluded.
func TestResolveNarrowsToParsedComponents(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	seedResolveFixtures(t, db, []resolveFixture{
		{requestID: "req-rec-new", capturedAtMS: 300, route: "/api/sync/reconcile", deviceID: "device-1", httpStatus: 500},
		{requestID: "req-rec-ok", capturedAtMS: 200, route: "/api/sync/reconcile", deviceID: "device-1", httpStatus: 202},
		{requestID: "req-rec-old", capturedAtMS: 100, route: "/api/sync/reconcile", deviceID: "device-1", httpStatus: 500},
		{requestID: "req-patch-500", capturedAtMS: 250, route: "/api/animes/anime-1", deviceID: "device-1", httpStatus: 500},
	})

	got, err := NewReader(db).Resolve(context.Background(), "latest reconcile 500")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	assertResolveOrder(t, got, "req-rec-new", "req-rec-old")
}

// TestResolveMatchesAnimeThroughCorrelatedOperationRefs proves an anime
// component is satisfied by a correlated operation ref, not only by the
// capture's own anime id column.
func TestResolveMatchesAnimeThroughCorrelatedOperationRefs(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	seedResolveFixtures(t, db, []resolveFixture{
		{
			requestID: "req-anime-scoped", capturedAtMS: 200, route: "/api/sync/reconcile", deviceID: "device-1",
			correlationJSON: `{"operation_refs":[{"anime_id":"anime-42","operation":"update","outcome":"applied"}]}`,
		},
		{
			requestID: "req-anime-other", capturedAtMS: 100, route: "/api/sync/reconcile", deviceID: "device-1",
			correlationJSON: `{"operation_refs":[{"anime_id":"anime-99","operation":"update","outcome":"applied"}]}`,
		},
	})

	got, err := NewReader(db).Resolve(context.Background(), "reconcile for anime anime-42")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	assertResolveOrder(t, got, "req-anime-scoped")
}

// TestResolveReturnsEachCandidateOnce pins the de-duplication across tiers: a
// capture that is both an exact id match and a route-component match must
// appear a single time.
func TestResolveReturnsEachCandidateOnce(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	seedResolveFixtures(t, db, []resolveFixture{
		{requestID: "reconcile-one", capturedAtMS: 100, route: "/api/sync/reconcile", deviceID: "device-1", httpStatus: 500},
	})

	got, err := NewReader(db).Resolve(context.Background(), "reconcile-one")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	assertResolveOrder(t, got, "reconcile-one")
}

// TestParseReferenceComponentsRecognizesEachReferenceShape proves every
// recognized reference component is retained, including the first matching
// route and time words when a reference contains more than one.
func TestParseReferenceComponentsRecognizesEachReferenceShape(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name, reference, route, timeExpr, animeID string
		status                                    int
		hasStatus                                 bool
	}{
		{name: "bare status", reference: "503", status: 503, hasStatus: true},
		{name: "first route wins", reference: "patch reconcile", route: "reconcile"},
		{name: "second route is recognized", reference: "patch", route: "patch"},
		{name: "first time word wins", reference: "today latest", timeExpr: "latest"},
		{name: "second time word is recognized", reference: "today", timeExpr: "today"},
		{name: "anime id", reference: "anime anime-42", animeID: "anime-42"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			components := parseReferenceComponents(tt.reference)
			if components.any != (tt.hasStatus || tt.route != "" || tt.timeExpr != "" || tt.animeID != "") {
				t.Fatalf("any = %t for %#v", components.any, components)
			}
			if (components.status != nil) != tt.hasStatus || tt.hasStatus && *components.status != tt.status {
				t.Fatalf("status = %#v, want present=%t value=%d", components.status, tt.hasStatus, tt.status)
			}
			if components.routeFragment != tt.route || components.timeExpr != tt.timeExpr || components.animeID != tt.animeID {
				t.Fatalf("components = %#v, want route=%q time=%q anime=%q", components, tt.route, tt.timeExpr, tt.animeID)
			}
		})
	}
}

// TestMatchesComponentsRejectsEachMismatch proves each structured component
// independently excludes a capture that otherwise matches the other fields.
func TestMatchesComponentsRejectsEachMismatch(t *testing.T) {
	t.Parallel()

	status, animeID := 500, "anime-42"
	item := CaptureRecord{
		Route:      "/api/sync/Reconcile",
		HTTPStatus: &status,
		AnimeID:    &animeID,
	}
	for _, tt := range []struct {
		name       string
		components referenceComponents
	}{
		{name: "status", components: referenceComponents{status: new(400)}},
		{name: "route", components: referenceComponents{routeFragment: "patch"}},
		{name: "anime id", components: referenceComponents{animeID: "anime-99"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if matchesComponents(item, tt.components) {
				t.Fatalf("expected %s mismatch to reject capture", tt.name)
			}
		})
	}
}

// TestMatchesAnimeIDComponentChecksEveryOperationRef proves a correlation on
// a later operation ref satisfies an anime component after earlier refs miss.
func TestMatchesAnimeIDComponentChecksEveryOperationRef(t *testing.T) {
	t.Parallel()

	item := CaptureRecord{Correlations: Correlations{OperationRefs: []OperationRef{
		{AnimeID: "anime-other"},
		{AnimeID: "anime-target"},
	}}}
	if !matchesAnimeIDComponent(item, "anime-target") {
		t.Fatal("expected matching later operation ref to satisfy anime component")
	}
}

// TestCaptureRankUsesAllCorrelationValues pins exact rank behavior for every
// searchable value and distinguishes a generic substring from no match.
func TestCaptureRankUsesAllCorrelationValues(t *testing.T) {
	t.Parallel()

	animeID := "anime-direct"
	item := CaptureRecord{
		RequestID: "request-exact",
		Device:    DeviceIdentity{DeviceID: "device-id", Name: "device-name"},
		AnimeID:   &animeID,
		Correlations: Correlations{
			ChangelogIDs:  []int64{19},
			ActivityIDs:   []int64{29},
			OperationRefs: []OperationRef{{AnimeID: "anime-operation", Operation: "upsert", Outcome: "applied"}},
			ConflictIDs:   []string{"conflict-id"},
		},
	}
	for _, tt := range []struct {
		name, reference string
		want            int
	}{
		{name: "request id", reference: "request-exact", want: 0},
		{name: "device id", reference: "device-id", want: 1},
		{name: "device name", reference: "device-name", want: 1},
		{name: "anime id", reference: "anime-direct", want: 1},
		{name: "changelog id", reference: "19", want: 1},
		{name: "activity id", reference: "29", want: 1},
		{name: "operation anime id", reference: "anime-operation", want: 1},
		{name: "operation", reference: "upsert", want: 1},
		{name: "outcome", reference: "applied", want: 1},
		{name: "conflict id", reference: "conflict-id", want: 1},
		{name: "substring", reference: "conflict", want: 2},
		{name: "no match", reference: "not-present", want: -1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := captureRank(item, tt.reference); got != tt.want {
				t.Fatalf("captureRank(%q) = %d, want %d", tt.reference, got, tt.want)
			}
		})
	}
}

// TestMergeResolveCandidatesContinuesAfterDuplicate proves deduplication does
// not stop later unique candidates after seeing an earlier duplicate.
func TestMergeResolveCandidatesContinuesAfterDuplicate(t *testing.T) {
	t.Parallel()

	ranked := [3][]ResolveCandidate{
		{{RequestID: "exact"}},
		{{RequestID: "exact"}, {RequestID: "device"}},
		{{RequestID: "substring"}},
	}
	got := mergeResolveCandidates(ranked, []ResolveCandidate{{RequestID: "component"}})
	assertResolveOrder(t, got, "exact", "device", "component", "substring")
}

// TestResolveLeavesUnrecognizedReferenceUnmatched proves a reference without a
// parsed component does not turn every stored capture into a component match.
func TestResolveLeavesUnrecognizedReferenceUnmatched(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	seedResolveFixtures(t, db, []resolveFixture{{requestID: "stored-request", capturedAtMS: 1, route: "/api/sync/reconcile", deviceID: "device-1"}})

	got, err := NewReader(db).Resolve(context.Background(), "opaque-token")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	assertResolveOrder(t, got)
}

// TestResolveFollowsCursorToLaterCapture proves resolution searches beyond the
// first page: the only matching capture is older than one full page of newer rows.
func TestResolveFollowsCursorToLaterCapture(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	fixtures := []resolveFixture{{requestID: "target-after-page", capturedAtMS: 1, route: "/api/sync/reconcile", deviceID: "device-1"}}
	for index := 0; index < 100; index++ {
		fixtures = append(fixtures, resolveFixture{requestID: "filler-" + strconv.Itoa(index), capturedAtMS: int64(index + 2), route: "/api/sync/reconcile", deviceID: "device-1"})
	}
	seedResolveFixtures(t, db, fixtures)

	got, err := NewReader(db).Resolve(context.Background(), "target-after-page")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	assertResolveOrder(t, got, "target-after-page")
}

// TestResolveReturnsSearchError proves a search failure propagates rather than
// being converted into an empty resolution result.
func TestResolveReturnsSearchError(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	reader := NewReader(db)
	if err := db.Close(); err != nil {
		t.Fatalf("close database: %v", err)
	}
	if _, err := reader.Resolve(context.Background(), "reference"); err == nil {
		t.Fatal("expected resolve to return the search error from a closed database")
	}
}

// TestExtractAnimeIDReference pins the marker parsing, including the shape the
// production caller actually produces: the marker word followed by an id that
// itself begins with the marker word.
func TestExtractAnimeIDReference(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name      string
		reference string
		want      string
	}{
		{name: "id after marker", reference: "reconcile for anime anime-42", want: "anime-42"},
		{name: "marker at start", reference: "anime anime-7", want: "anime-7"},
		{name: "no marker", reference: "reconcile for everything", want: ""},
		{name: "marker with nothing after", reference: "reconcile for anime ", want: ""},
		{name: "padded id keeps first field", reference: "anime   spaced-9  tail", want: "spaced-9"},
		{name: "empty", reference: "", want: ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := extractAnimeIDReference(tt.reference); got != tt.want {
				t.Fatalf("extractAnimeIDReference(%q) = %q, want %q", tt.reference, got, tt.want)
			}
		})
	}
}

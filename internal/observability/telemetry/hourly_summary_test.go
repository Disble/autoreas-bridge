package telemetry

import (
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/observability/syncdiag"
)

// hourlySummaryBody is the canonical valid hourly_summary body, a literal
// because it IS the wire contract offered to mobile. Every rejection row
// perturbs it in exactly one place, so the named field is attributable.
const hourlySummaryBody = `{"kind":"hourly_summary","observation_id":"inst-7f3a:2026-11-07T10","hour_start_ms":1794135600000,"counts":[{"trigger_source":"foreground_service","outcome":"closed","count":31,"max_duration_ms":1412},{"trigger_source":"foreground_service","outcome":"failed","count":4}],"dropped_count":0,"process_deaths":[{"process_name":"sync","reason":"low_memory","count":1}]}`

// hourlySummaryWith swaps one literal fragment of the canonical body.
func hourlySummaryWith(from, to string) string {
	if !strings.Contains(hourlySummaryBody, from) {
		panic("hourlySummaryWith: fragment not in canonical body: " + from)
	}
	return strings.Replace(hourlySummaryBody, from, to, 1)
}

// TestHourlySummaryKindDecodesTheCanonicalBody pins the envelope values and
// the stored payload: an absent max_duration_ms is stored as null, and no
// envelope key is copied into the payload.
func TestHourlySummaryKindDecodesTheCanonicalBody(t *testing.T) {
	t.Parallel()

	validated, err := HourlySummaryKind{}.Decode([]byte(hourlySummaryBody))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if validated.EventID != "inst-7f3a:2026-11-07T10" {
		t.Fatalf("EventID = %q", validated.EventID)
	}
	if validated.ObservedAtMS == nil || *validated.ObservedAtMS != 1794135600000 {
		t.Fatalf("ObservedAtMS = %v, want the hour start", validated.ObservedAtMS)
	}
	if validated.Degraded != nil {
		t.Fatalf("Degraded = %v, want nil", *validated.Degraded)
	}
	want := `{"counts":[{"trigger_source":"foreground_service","outcome":"closed","count":31,"max_duration_ms":1412},{"trigger_source":"foreground_service","outcome":"failed","count":4,"max_duration_ms":null}],"dropped_count":0,"process_deaths":[{"process_name":"sync","reason":"low_memory","count":1}]}`
	if string(validated.Payload) != want {
		t.Fatalf("Payload = %s\nwant      %s", validated.Payload, want)
	}
}

// TestHourlySummaryKindAcceptsEveryBoundaryAndVocabularyMember accepts each
// outcome, each trigger source, the inclusive bounds, and the optional keys
// absent or null (process_deaths then stored as [] rather than null).
func TestHourlySummaryKindAcceptsEveryBoundaryAndVocabularyMember(t *testing.T) {
	t.Parallel()

	deaths := `,"process_deaths":[{"process_name":"sync","reason":"low_memory","count":1}]`
	tests := []struct {
		name, from, to, stored string
	}{
		{"presence refused", `"outcome":"failed"`, `"outcome":"presence_refused"`, `"outcome":"presence_refused"`},
		{"schema not ready", `"outcome":"failed"`, `"outcome":"schema_not_ready"`, `"outcome":"schema_not_ready"`},
		{"skipped owned by ticker", `"outcome":"failed"`, `"outcome":"skipped_owned_by_ticker"`, `"outcome":"skipped_owned_by_ticker"`},
		{"unsettled", `"outcome":"failed"`, `"outcome":"unsettled"`, `"outcome":"unsettled"`},
		{"crashed", `"outcome":"failed"`, `"outcome":"crashed"`, `"outcome":"crashed"`},
		{"background task", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"background_task","outcome":"failed"`, `"trigger_source":"background_task"`},
		{"bootstrap", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"bootstrap","outcome":"failed"`, `"trigger_source":"bootstrap"`},
		{"manual", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"manual","outcome":"failed"`, `"trigger_source":"manual"`},
		{"app active", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"app_active","outcome":"failed"`, `"trigger_source":"app_active"`},
		{"network regained", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"network_regained","outcome":"failed"`, `"trigger_source":"network_regained"`},
		{"local mutation", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"local_mutation","outcome":"failed"`, `"trigger_source":"local_mutation"`},
		{"ws sync required", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"ws_sync_required","outcome":"failed"`, `"trigger_source":"ws_sync_required"`},
		{"zero count", `"count":4}`, `"count":0}`, `"count":0,`},
		{"maximum count", `"count":4}`, `"count":100000}`, `"count":100000,`},
		{"null max duration", `"count":4}`, `"count":4,"max_duration_ms":null}`, `"count":4,"max_duration_ms":null`},
		{"zero max duration", `"max_duration_ms":1412`, `"max_duration_ms":0`, `"max_duration_ms":0`},
		{"one hour max duration", `"max_duration_ms":1412`, `"max_duration_ms":3600000`, `"max_duration_ms":3600000`},
		{"maximum dropped count", `"dropped_count":0`, `"dropped_count":100000`, `"dropped_count":100000`},
		{"no counts", `[{"trigger_source":"foreground_service","outcome":"closed","count":31,"max_duration_ms":1412},{"trigger_source":"foreground_service","outcome":"failed","count":4}]`, `[]`, `"counts":[]`},
		{"absent process deaths", deaths, ``, `"process_deaths":[]`},
		{"null process deaths", deaths, `,"process_deaths":null`, `"process_deaths":[]`},
		{"empty process deaths", deaths, `,"process_deaths":[]`, `"process_deaths":[]`},
		{"main process death", `"process_name":"sync"`, `"process_name":"main"`, `"process_name":"main"`},
		{"maximum death count", `"reason":"low_memory","count":1`, `"reason":"low_memory","count":100000`, `"count":100000}]`},
		{"forty-char reason", `"reason":"low_memory"`, `"reason":"` + strings.Repeat("a", 40) + `"`, strings.Repeat("a", 40)},
		{"digit reason", `"reason":"low_memory"`, `"reason":"oom_9"`, `"reason":"oom_9"`},
		{"same outcome under another trigger", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"manual","outcome":"closed"`, `"trigger_source":"manual","outcome":"closed"`},
		{"same reason in another process", deaths, deaths[:len(deaths)-1] + `,{"process_name":"main","reason":"low_memory","count":2}]`, `"process_name":"main","reason":"low_memory","count":2`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			validated, err := HourlySummaryKind{}.Decode([]byte(hourlySummaryWith(tc.from, tc.to)))
			if err != nil {
				t.Fatalf("Decode() error = %v", err)
			}
			if !strings.Contains(string(validated.Payload), tc.stored) {
				t.Fatalf("Payload %s does not store %s", validated.Payload, tc.stored)
			}
		})
	}
}

// TestHourlySummaryKindAcceptsAFullGridAndSixteenDeaths accepts the largest
// legal body: every trigger source with every outcome, and the declared
// maximum of process-death entries, all within the 8 KiB transport limit.
func TestHourlySummaryKindAcceptsAFullGridAndSixteenDeaths(t *testing.T) {
	t.Parallel()

	var counts, deaths []string
	for _, trigger := range []string{"foreground_service", "background_task", "bootstrap", "manual", "app_active", "network_regained", "local_mutation", "ws_sync_required"} {
		for _, outcome := range []string{"closed", "failed", "presence_refused", "schema_not_ready", "skipped_owned_by_ticker", "unsettled", "crashed"} {
			counts = append(counts, `{"trigger_source":"`+trigger+`","outcome":"`+outcome+`","count":1}`)
		}
	}
	for i := range 16 {
		deaths = append(deaths, `{"process_name":"sync","reason":"r`+strings.Repeat("x", i)+`","count":1}`)
	}
	body := `{"kind":"hourly_summary","observation_id":"i:h","hour_start_ms":0,"counts":[` + strings.Join(counts, ",") + `],"dropped_count":0,"process_deaths":[` + strings.Join(deaths, ",") + `]}`
	if len(body) > MaxBodyBytes {
		t.Fatalf("full grid is %d bytes, over the %d transport limit", len(body), MaxBodyBytes)
	}
	if _, err := (HourlySummaryKind{}).Decode([]byte(body)); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
}

// TestHourlySummaryKindRejectsAndNamesTheField refuses every out-of-contract
// value with a *syncdiag.FieldError naming the offending field.
func TestHourlySummaryKindRejectsAndNamesTheField(t *testing.T) {
	t.Parallel()

	counts := `[{"trigger_source":"foreground_service","outcome":"closed","count":31,"max_duration_ms":1412},{"trigger_source":"foreground_service","outcome":"failed","count":4}]`
	deaths := `[{"process_name":"sync","reason":"low_memory","count":1}]`
	seventeen := "[" + strings.TrimSuffix(strings.Repeat(`{"process_name":"sync","reason":"x","count":1},`, 17), ",") + "]"
	sameCounts := func(n int) string {
		return "[" + strings.TrimSuffix(strings.Repeat(`{"trigger_source":"manual","outcome":"closed","count":1},`, n), ",") + "]"
	}
	tests := []struct {
		name, from, to, field string
	}{
		{"empty observation id", `"observation_id":"inst-7f3a:2026-11-07T10"`, `"observation_id":""`, "observation_id"},
		{"null observation id", `"observation_id":"inst-7f3a:2026-11-07T10"`, `"observation_id":null`, "observation_id"},
		{"missing observation id", `"observation_id":"inst-7f3a:2026-11-07T10",`, ``, "observation_id"},
		{"missing hour start", `"hour_start_ms":1794135600000,`, ``, "hour_start_ms"},
		{"negative hour start", `"hour_start_ms":1794135600000`, `"hour_start_ms":-1`, "hour_start_ms"},
		{"missing counts", `"counts":` + counts + `,`, ``, "counts"},
		{"null counts", counts, `null`, "counts"},
		{"object counts", counts, `{}`, "counts"},
		{"sixty-five counts", counts, sameCounts(65), "counts"},
		{"sixty-four counts reach the pair check", counts, sameCounts(64), "counts[1]"},
		{"string count entry", `{"trigger_source":"foreground_service","outcome":"failed","count":4}`, `"x"`, "counts[1]"},
		{"unknown trigger source", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"native_fgs_tick","outcome":"failed"`, "counts[1].trigger_source"},
		{"local mutation write is not counted", `"trigger_source":"foreground_service","outcome":"failed"`, `"trigger_source":"local_mutation_write","outcome":"failed"`, "counts[1].trigger_source"},
		{"missing trigger source", `"trigger_source":"foreground_service","outcome":"failed"`, `"outcome":"failed"`, "counts[1].trigger_source"},
		{"unknown outcome", `"outcome":"failed"`, `"outcome":"completed"`, "counts[1].outcome"},
		{"missing outcome", `"outcome":"failed",`, ``, "counts[1].outcome"},
		{"negative count", `"count":4}`, `"count":-1}`, "counts[1].count"},
		{"count above ceiling", `"count":4}`, `"count":100001}`, "counts[1].count"},
		{"missing count", `,"count":4}`, `}`, "counts[1].count"},
		{"negative max duration", `"max_duration_ms":1412`, `"max_duration_ms":-1`, "counts[0].max_duration_ms"},
		{"max duration over an hour", `"max_duration_ms":1412`, `"max_duration_ms":3600001`, "counts[0].max_duration_ms"},
		{"string max duration", `"max_duration_ms":1412`, `"max_duration_ms":"1412"`, "counts[0].max_duration_ms"},
		{"undeclared count key", `"count":4}`, `"count":4,"x":1}`, "counts[1].x"},
		{"duplicate trigger and outcome", `"outcome":"failed"`, `"outcome":"closed"`, "counts[1]"},
		{"missing dropped count", `"dropped_count":0,`, ``, "dropped_count"},
		{"negative dropped count", `"dropped_count":0`, `"dropped_count":-1`, "dropped_count"},
		{"dropped count above ceiling", `"dropped_count":0`, `"dropped_count":100001`, "dropped_count"},
		{"object process deaths", deaths, `{}`, "process_deaths"},
		{"seventeen process deaths", deaths, seventeen, "process_deaths"},
		{"string death entry", deaths, `["x"]`, "process_deaths[0]"},
		{"unknown process", `"process_name":"sync"`, `"process_name":"ui"`, "process_deaths[0].process_name"},
		{"missing process", `"process_name":"sync",`, ``, "process_deaths[0].process_name"},
		{"missing reason", `"reason":"low_memory",`, ``, "process_deaths[0].reason"},
		{"empty reason", `"reason":"low_memory"`, `"reason":""`, "process_deaths[0].reason"},
		{"uppercase reason", `"reason":"low_memory"`, `"reason":"Low_memory"`, "process_deaths[0].reason"},
		{"spaced reason", `"reason":"low_memory"`, `"reason":"low memory"`, "process_deaths[0].reason"},
		{"forty-one char reason", `"reason":"low_memory"`, `"reason":"` + strings.Repeat("a", 41) + `"`, "process_deaths[0].reason"},
		{"zero death count", `"reason":"low_memory","count":1`, `"reason":"low_memory","count":0`, "process_deaths[0].count"},
		{"death count above ceiling", `"reason":"low_memory","count":1`, `"reason":"low_memory","count":100001`, "process_deaths[0].count"},
		{"undeclared death key", `"count":1}]`, `"count":1,"pid":4}]`, "process_deaths[0].pid"},
		{"duplicate process and reason", deaths, `[{"process_name":"sync","reason":"low_memory","count":1},{"process_name":"sync","reason":"low_memory","count":2}]`, "process_deaths[1]"},
		{"undeclared top-level key", `"dropped_count":0`, `"dropped_count":0,"device_id":"spoofed"`, "device_id"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := HourlySummaryKind{}.Decode([]byte(hourlySummaryWith(tc.from, tc.to)))
			var fieldErr *syncdiag.FieldError
			if !errors.As(err, &fieldErr) {
				t.Fatalf("Decode() error = %v, want a *syncdiag.FieldError naming %s", err, tc.field)
			}
			if fieldErr.Field != tc.field {
				t.Fatalf("rejection names %q, want %q (%v)", fieldErr.Field, tc.field, err)
			}
		})
	}
}

// TestHourlySummaryKindKeepsMalformedJSONUnnamed asserts a body that is not
// JSON is a plain decode error, not a FieldError naming a guessed key.
func TestHourlySummaryKindKeepsMalformedJSONUnnamed(t *testing.T) {
	t.Parallel()

	_, err := HourlySummaryKind{}.Decode([]byte(`{"kind":"hourly_summary",`))
	var fieldErr *syncdiag.FieldError
	if err == nil || errors.As(err, &fieldErr) {
		t.Fatalf("Decode() error = %v, want an unnamed decode error", err)
	}
}

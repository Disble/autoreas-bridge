package domain

import (
	"encoding/json"
	"testing"
)

func TestLegacyAnimeRawPreservesUnknownExtraFieldsAcrossRoundTrip(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"anime-extra","nombre":"Extra","nrocapvisto":1,"custom":{"enabled":true},"legacyFlag":"keep"}`

	var raw LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal legacy anime raw: %v", err)
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal legacy anime raw: %v", err)
	}

	assertJSONSemanticallyEqual(t, payload, string(encoded))
	assertJSONContains(t, string(encoded), `"custom":{"enabled":true}`)
	assertJSONContains(t, string(encoded), `"legacyFlag":"keep"`)
}

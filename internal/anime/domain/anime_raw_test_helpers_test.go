package domain

import (
	"encoding/json"
	"strings"
	"testing"
)

func assertJSONSemanticallyEqual(t *testing.T, want string, got string) {
	t.Helper()

	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("unmarshal wanted json: %v", err)
	}

	var gotValue any
	if err := json.Unmarshal([]byte(got), &gotValue); err != nil {
		t.Fatalf("unmarshal got json: %v", err)
	}

	if !deepEqualJSON(wantValue, gotValue) {
		t.Fatalf("expected JSON %s, got %s", want, got)
	}
}

func assertJSONContains(t *testing.T, got string, needle string) {
	t.Helper()

	if !strings.Contains(got, needle) {
		t.Fatalf("expected JSON %s to contain %s", got, needle)
	}
}

func deepEqualJSON(want any, got any) bool {
	return jsonEqualValue(want, got)
}

func jsonEqualValue(want any, got any) bool {
	switch wantTyped := want.(type) {
	case map[string]any:
		gotTyped, ok := got.(map[string]any)
		if !ok || len(wantTyped) != len(gotTyped) {
			return false
		}
		for key, wantValue := range wantTyped {
			if !jsonEqualValue(wantValue, gotTyped[key]) {
				return false
			}
		}
		return true
	case []any:
		gotTyped, ok := got.([]any)
		if !ok || len(wantTyped) != len(gotTyped) {
			return false
		}
		for index := range wantTyped {
			if !jsonEqualValue(wantTyped[index], gotTyped[index]) {
				return false
			}
		}
		return true
	default:
		return want == got
	}
}

func compactJSON(t *testing.T, value string) string {
	t.Helper()

	var raw any
	if err := json.Unmarshal([]byte(value), &raw); err != nil {
		t.Fatalf("compact json unmarshal: %v", err)
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("compact json marshal: %v", err)
	}

	return string(encoded)
}

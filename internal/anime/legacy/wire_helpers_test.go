package legacy

import "testing"

func TestLegacyJSONEqual(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		want any
		got  any
		eq   bool
	}{
		{
			name: "nested objects and arrays match",
			want: map[string]any{"nested": map[string]any{"list": []any{float64(1), "two", true}}},
			got:  map[string]any{"nested": map[string]any{"list": []any{float64(1), "two", true}}},
			eq:   true,
		},
		{
			name: "missing object key fails",
			want: map[string]any{"nested": map[string]any{"keep": true, "miss": false}},
			got:  map[string]any{"nested": map[string]any{"keep": true}},
			eq:   false,
		},
		{
			name: "array order mismatch fails",
			want: []any{"a", "b"},
			got:  []any{"b", "a"},
			eq:   false,
		},
		{
			name: "scalar equality uses exact value",
			want: "same",
			got:  "same",
			eq:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := legacyJSONEqual(tt.want, tt.got); got != tt.eq {
				t.Fatalf("legacyJSONEqual() = %v, want %v", got, tt.eq)
			}
		})
	}
}

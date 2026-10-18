package contracts

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestMobileAnimeSeasonWireShape(t *testing.T) {
	grade := 4
	cases := []struct {
		name   string
		season *MobileAnimeSeason
		want   string
	}{
		{name: "not a candidate", season: nil, want: ""},
		{name: "ungraded candidate", season: &MobileAnimeSeason{SeasonID: "s1"}, want: `"season":{"seasonId":"s1","grade":null}`},
		{name: "graded candidate", season: &MobileAnimeSeason{SeasonID: "s1", Grade: &grade}, want: `"season":{"seasonId":"s1","grade":4}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			encoded, err := json.Marshal(MobileAnime{ID: "a", Season: tc.season})
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			body := string(encoded)
			if tc.want == "" && strings.Contains(body, `"season"`) {
				t.Fatalf("non-candidate serialized a season: %s", body)
			}
			if tc.want != "" && !strings.Contains(body, tc.want) {
				t.Fatalf("body %s, want it to contain %s", body, tc.want)
			}
		})
	}
}

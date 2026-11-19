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
		encoded, err := json.Marshal(MobileAnime{ID: "a", Season: tc.season})
		if err != nil {
			t.Errorf("%s: marshal: %v", tc.name, err)
			continue
		}
		body := string(encoded)
		if tc.want == "" && strings.Contains(body, `"season"`) {
			t.Errorf("%s: non-candidate serialized a season: %s", tc.name, body)
			continue
		}
		if tc.want != "" && !strings.Contains(body, tc.want) {
			t.Errorf("%s: body %s, want it to contain %s", tc.name, body, tc.want)
		}
	}
}

package filesystem

import "testing"

func TestEpisodeBaseNamePadsToTwoDigitsAndLetsLongerNumbersThrough(t *testing.T) {
	for _, tc := range []struct {
		episode int
		want    string
	}{
		{episode: 4, want: "Show - 04"},
		{episode: 12, want: "Show - 12"},
		{episode: 100, want: "Show - 100"},
	} {
		got, err := EpisodeBaseName("Show", tc.episode)
		if err != nil {
			t.Fatalf("episode %d: %v", tc.episode, err)
		}
		if got != tc.want {
			t.Fatalf("episode %d: name = %q, want %q", tc.episode, got, tc.want)
		}
	}
}

// Canonical names carry characters Windows forbids in a filename. Without
// sanitizing, the rename fails outright on some of the most-watched shows.
func TestEpisodeBaseNameStripsFilesystemReservedCharacters(t *testing.T) {
	for _, tc := range []struct {
		canonical string
		want      string
	}{
		{canonical: "Re:Zero", want: "ReZero - 01"},
		{canonical: "Fate/Zero", want: "FateZero - 01"},
		{canonical: `Kaguya-sama: Love is War`, want: "Kaguya-sama Love is War - 01"},
		{canonical: `A*B?C"D<E>F|G\H`, want: "ABCDEFGH - 01"},
		{canonical: "Bell\x07Show", want: "BellShow - 01"},
	} {
		got, err := EpisodeBaseName(tc.canonical, 1)
		if err != nil {
			t.Fatalf("%q: %v", tc.canonical, err)
		}
		if got != tc.want {
			t.Fatalf("%q: name = %q, want %q", tc.canonical, got, tc.want)
		}
	}
}

// A canonical name that sanitizes away entirely would produce " - 01", which is
// worse than the opaque hoster name it would replace.
func TestEpisodeBaseNameRefusesAnEmptyCanonicalName(t *testing.T) {
	for _, canonical := range []string{"", "   ", `///`} {
		if got, err := EpisodeBaseName(canonical, 1); err == nil {
			t.Fatalf("%q: name = %q, want a refusal for an unusable canonical name", canonical, got)
		}
	}
}

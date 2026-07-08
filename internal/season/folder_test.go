package season

import (
	"path/filepath"
	"testing"
)

func TestSanitizeFolderName(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "clean name is unchanged", in: "Uma Musume Pretty Derby", want: "Uma Musume Pretty Derby"},
		{name: "colon becomes space", in: "Re:Zero", want: "Re Zero"},
		{name: "slash becomes space", in: "Fate/stay night", want: "Fate stay night"},
		{name: "every windows-illegal char is stripped", in: `a<b>c:d"e/f\g|h?i*j`, want: "a b c d e f g h i j"},
		{name: "consecutive illegal chars collapse to one space", in: "A::B", want: "A B"},
		{name: "trailing dots and spaces are trimmed", in: "Anime.  ", want: "Anime"},
		{name: "leading and trailing whitespace is trimmed", in: "  Naruto  ", want: "Naruto"},
		{name: "all-illegal name sanitizes to empty", in: `:/\|`, want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeFolderName(tt.in); got != tt.want {
				t.Fatalf("sanitizeFolderName(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestDeriveDownloadFolder(t *testing.T) {
	root := filepath.Join("D:", "Anime")

	tests := []struct {
		name  string
		root  string
		anime string
		want  string
	}{
		{name: "joins root and sanitized name", root: root, anime: "Uma Musume Pretty Derby", want: filepath.Join(root, "Uma Musume Pretty Derby")},
		{name: "sanitizes the name before joining", root: root, anime: "Re:Zero", want: filepath.Join(root, "Re Zero")},
		{name: "empty root yields empty folder (no valid absolute path)", root: "", anime: "Naruto", want: ""},
		{name: "name that sanitizes to empty yields empty folder", root: root, anime: `:/\`, want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := deriveDownloadFolder(tt.root, tt.anime); got != tt.want {
				t.Fatalf("deriveDownloadFolder(%q, %q) = %q, want %q", tt.root, tt.anime, got, tt.want)
			}
		})
	}
}

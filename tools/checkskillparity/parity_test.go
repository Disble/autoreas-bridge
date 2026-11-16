package checkskillparity

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// TestMirroredSkillsAreIdentical fails when a mirrored skill differs between
// .claude/skills and .agents/skills, naming every file that differs or exists
// on one side only. Both folders are read by different agent runtimes.
func TestMirroredSkillsAreIdentical(t *testing.T) {
	t.Parallel()

	root := filepath.Clean(filepath.Join("..", ".."))
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("repo root %q missing go.mod: %v", root, err)
	}
	for _, skill := range MirroredSkills {
		left := filepath.Join(root, ".claude", "skills", skill)
		right := filepath.Join(root, ".agents", "skills", skill)
		differences, err := Differences(left, right)
		if err != nil {
			t.Fatalf("compare skill %s: %v", skill, err)
		}
		for _, difference := range differences {
			t.Errorf(".claude/skills/%s vs .agents/skills/%s: %s; make both copies byte-identical (ADR-032 §5)",
				skill, skill, difference)
		}
	}
}

// TestDifferencesNamesEveryMismatch covers identical trees, a changed byte, a
// file on one side only (either side, nested too) and a folder missing on
// either side.
func TestDifferencesNamesEveryMismatch(t *testing.T) {
	t.Parallel()

	same := map[string]string{"SKILL.md": "rule\n", "references/a.md": "ref\n"}
	cases := []struct {
		name  string
		left  map[string]string
		right map[string]string
		want  []string
	}{
		{name: "identical trees", left: same, right: same},
		{
			name:  "one byte differs",
			left:  same,
			right: map[string]string{"SKILL.md": "rulf\n", "references/a.md": "ref\n"},
			want:  []string{"differs: SKILL.md"},
		},
		{
			name:  "nested file only on the left",
			left:  same,
			right: map[string]string{"SKILL.md": "rule\n"},
			want:  []string{"missing in right: references/a.md"},
		},
		{
			name:  "file only on the right",
			left:  map[string]string{"references/a.md": "ref\n"},
			right: same,
			want:  []string{"missing in left: SKILL.md"},
		},
		{
			name:  "left folder missing",
			right: same,
			want:  []string{"missing in left: SKILL.md", "missing in left: references/a.md"},
		},
		{
			name: "right folder missing",
			left: same,
			want: []string{"missing in right: SKILL.md", "missing in right: references/a.md"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			base := t.TempDir()
			left := writeTree(t, filepath.Join(base, "left"), tc.left)
			right := writeTree(t, filepath.Join(base, "right"), tc.right)
			got, err := Differences(left, right)
			if err != nil {
				t.Fatalf("Differences() error = %v", err)
			}
			if !slices.Equal(got, tc.want) {
				t.Fatalf("Differences() = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestDifferencesRejectsTwoMissingFolders keeps a listed skill that exists in
// neither folder from passing as "no differences".
func TestDifferencesRejectsTwoMissingFolders(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	if _, err := Differences(filepath.Join(base, "left"), filepath.Join(base, "right")); err == nil {
		t.Fatal("Differences() error = nil, want an error for a skill missing on both sides")
	}
}

// writeTree creates files (slash-separated relative path -> content) under dir;
// nil files leave dir absent.
func writeTree(t *testing.T, dir string, files map[string]string) string {
	t.Helper()

	for relative, content := range files {
		path := filepath.Join(dir, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

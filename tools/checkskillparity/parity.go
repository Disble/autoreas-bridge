// Package checkskillparity keeps the agent skills that every runtime reads
// byte-identical in .claude/skills and .agents/skills (ADR-032 §5). Its test
// runs in the pre-commit job skill-parity whenever a file under either folder
// is staged.
package checkskillparity

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"slices"
)

// MirroredSkills are the skills whose two copies must not differ. Add a skill
// here once both copies are identical; never list one to fix it later.
var MirroredSkills = []string{"autoreas-theme", "bridge-data"}

// Differences compares two skill folders and returns, in path order, one
// "differs: <path>", "missing in left: <path>" or "missing in right: <path>"
// per mismatched file (slash-separated, relative to the folder). It fails when
// neither folder exists.
func Differences(left, right string) ([]string, error) {
	leftFiles, err := readTree(left)
	if err != nil {
		return nil, err
	}
	rightFiles, err := readTree(right)
	if err != nil {
		return nil, err
	}
	if leftFiles == nil && rightFiles == nil {
		return nil, fmt.Errorf("neither %s nor %s exists", left, right)
	}
	union := map[string][]byte{}
	maps.Copy(union, leftFiles)
	maps.Copy(union, rightFiles)
	var differences []string
	for _, path := range slices.Sorted(maps.Keys(union)) {
		leftContent, inLeft := leftFiles[path]
		rightContent, inRight := rightFiles[path]
		switch {
		case !inLeft:
			differences = append(differences, "missing in left: "+path)
		case !inRight:
			differences = append(differences, "missing in right: "+path)
		case !bytes.Equal(leftContent, rightContent):
			differences = append(differences, "differs: "+path)
		}
	}
	return differences, nil
}

// readTree returns every regular file under dir by slash-separated relative
// path, or nil when dir does not exist.
func readTree(dir string) (map[string][]byte, error) {
	if _, err := os.Stat(dir); errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	files := map[string][]byte{}
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			return walkErr
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		files[filepath.ToSlash(relative)] = content
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("read skill folder %s: %w", dir, err)
	}
	return files, nil
}

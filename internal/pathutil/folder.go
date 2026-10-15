// Package pathutil contains pure path-shape helpers shared by bounded contexts.
package pathutil

import (
	"path/filepath"
	"strings"
)

const windowsIllegalFolderChars = `<>:"/\|?*`

// SanitizeFolderName turns a name into a valid Windows directory segment.
func SanitizeFolderName(name string) string {
	var b strings.Builder
	for _, r := range name {
		if r < 0x20 || strings.ContainsRune(windowsIllegalFolderChars, r) {
			b.WriteRune(' ')
			continue
		}
		b.WriteRune(r)
	}
	return strings.TrimRight(strings.Join(strings.Fields(b.String()), " "), ". ")
}

// RelativeFolder returns folder below root, `/`-separated, or "" when it is
// not strictly inside root (ADR 027). Matching ignores case and treats `\`
// and `/` alike, and it cuts only at a segment boundary, so `D:\Anime` never
// claims `D:\Anime2\X`. Nested subfolders are kept whole.
func RelativeFolder(root, folder string) string {
	base := strings.TrimRight(strings.ReplaceAll(strings.TrimSpace(root), `\`, "/"), "/")
	path := strings.ReplaceAll(strings.TrimSpace(folder), `\`, "/")
	if base == "" || len(path) <= len(base) || path[len(base)] != '/' || !strings.EqualFold(path[:len(base)], base) {
		return ""
	}
	return strings.Trim(path[len(base):], "/")
}

// DeriveFolder joins a configured root with a sanitized name without touching the filesystem.
func DeriveFolder(root, name string) string {
	if strings.TrimSpace(root) == "" {
		return ""
	}
	segment := SanitizeFolderName(name)
	if segment == "" {
		return ""
	}
	return filepath.Join(root, segment)
}

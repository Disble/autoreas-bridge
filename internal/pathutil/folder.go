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

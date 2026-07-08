package season

import (
	"path/filepath"
	"strings"
)

// windowsIllegalFolderChars are the characters Windows forbids in a path
// segment. A derived download folder must be a valid Windows directory name, so
// each of these (plus ASCII control chars) is replaced with a space before the
// name is used as a folder (mirrors what a user picking a folder in Legacy would
// never have typed).
const windowsIllegalFolderChars = `<>:"/\|?*`

// sanitizeFolderName turns a raw anime name into a valid Windows folder segment:
// every illegal or control character becomes a space, runs of whitespace collapse
// to a single space, and leading/trailing whitespace and trailing dots are
// trimmed (Windows rejects names that end in a dot or space). A name made up
// entirely of illegal characters sanitizes to the empty string, which the caller
// treats as "cannot derive a folder".
func sanitizeFolderName(name string) string {
	var b strings.Builder
	for _, r := range name {
		if r < 0x20 || strings.ContainsRune(windowsIllegalFolderChars, r) {
			b.WriteRune(' ')
			continue
		}
		b.WriteRune(r)
	}
	collapsed := strings.Join(strings.Fields(b.String()), " ")
	return strings.TrimRight(collapsed, ". ")
}

// deriveDownloadFolder builds the DEFAULT absolute download folder for a
// newly-created season anime: the configured downloads root joined with the
// sanitized anime name. It returns "" (no default) when the root is not
// configured or the name sanitizes to empty, so the caller leaves the anime's
// carpeta absent rather than fabricating an invalid path. A user-picked override
// always takes precedence over this default.
func deriveDownloadFolder(root, name string) string {
	if root == "" {
		return ""
	}
	segment := sanitizeFolderName(name)
	if segment == "" {
		return ""
	}
	return filepath.Join(root, segment)
}

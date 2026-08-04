package season

import (
	"autoreas-bridge/internal/pathutil"
)

// sanitizeFolderName turns a raw anime name into a valid Windows folder segment:
// every illegal or control character becomes a space, runs of whitespace collapse
// to a single space, and leading/trailing whitespace and trailing dots are
// trimmed (Windows rejects names that end in a dot or space). A name made up
// entirely of illegal characters sanitizes to the empty string, which the caller
// treats as "cannot derive a folder".
func sanitizeFolderName(name string) string {
	return pathutil.SanitizeFolderName(name)
}

// deriveDownloadFolder builds the DEFAULT absolute download folder for a
// newly-created season anime: the configured downloads root joined with the
// sanitized anime name. It returns "" (no default) when the root is not
// configured or the name sanitizes to empty, so the caller leaves the anime's
// carpeta absent rather than fabricating an invalid path. A user-picked override
// always takes precedence over this default.
func deriveDownloadFolder(root, name string) string {
	return pathutil.DeriveFolder(root, name)
}

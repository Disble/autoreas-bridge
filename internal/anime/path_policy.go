package anime

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var localDrivePathPattern = regexp.MustCompile(`^[A-Za-z]:[\\/]`)

// ValidatePageURL rejects unsafe page URLs before they cross the desktop boundary.
func ValidatePageURL(value string) error {
	trimmed := strings.TrimSpace(value)
	parsed, err := url.ParseRequestURI(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil {
		return fmt.Errorf("unsafe page url %q", value)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("unsafe page url %q", value)
	}
	return nil
}

// ValidateLocalFolder rejects unsafe local folder paths before desktop actions use them.
func ValidateLocalFolder(value string) error {
	trimmed := strings.TrimSpace(value)
	if strings.HasPrefix(trimmed, `\\`) || strings.HasPrefix(trimmed, `//`) || strings.HasPrefix(trimmed, `\\?\`) || strings.HasPrefix(trimmed, `\\.\`) {
		return fmt.Errorf("unsafe folder path %q", value)
	}
	if !localDrivePathPattern.MatchString(trimmed) || strings.ContainsAny(trimmed[2:], `:*?"<>|`) || strings.ContainsAny(trimmed, "\x00\r\n") {
		return fmt.Errorf("unsafe folder path %q", value)
	}
	for _, segment := range strings.FieldsFunc(trimmed[3:], func(r rune) bool { return r == '\\' || r == '/' }) {
		if segment == ".." || segment == "." {
			return fmt.Errorf("unsafe folder path %q", value)
		}
	}
	return nil
}

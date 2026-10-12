//go:build !windows

package media

import "os"

// creationNs reports that this platform's creation time is unavailable.
//
// The duration notice is a Windows feature. Off Windows the reading stays missing and the entry
// unusable, rather than falling back to a timestamp that does not mean the same thing.
func creationNs(info os.FileInfo) (string, error) {
	return "", errNoCreationTime
}

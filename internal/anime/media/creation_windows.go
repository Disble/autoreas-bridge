//go:build windows

package media

import (
	"os"
	"strconv"
	"syscall"
)

// creationNs returns the file's Windows creation time in nanoseconds since the epoch.
//
// It is the real creation time as Windows records it, never the POSIX ctime and never a substitute
// of the modification time: the identity decision orders files by chronology, so a guessed creation
// time would silently reorder the episodes. A description Windows cannot date reports an error, and
// the caller treats that reading as unusable.
func creationNs(info os.FileInfo) (string, error) {
	data, ok := info.Sys().(*syscall.Win32FileAttributeData)
	if !ok {
		return "", errNoCreationTime
	}
	return strconv.FormatInt(data.CreationTime.Nanoseconds(), 10), nil
}

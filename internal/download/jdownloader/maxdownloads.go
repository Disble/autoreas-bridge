package jdownloader

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// generalSettingsFile is the JD config holding the global download limits. JDownloader
// persists every config interface as cfg/<interfaceName>.json beside its executable.
const generalSettingsFile = "org.jdownloader.settings.GeneralSettings.json"

// generalSettings mirrors only the field this reader needs. The real file holds ~100 keys.
type generalSettings struct {
	// MaxSimultaneousDownloads is a pointer so an absent key is distinguishable from an
	// explicit 0 -- they mean different things and only one of them is a configured value.
	MaxSimultaneousDownloads *int `json:"maxsimultanedownloads"`
}

// MaxSimultaneousDownloads reads JDownloader's global "Max. simultaneous Downloads" setting
// from the config file beside exePath.
//
// This is deliberately a LOCAL FILE read and deliberately lives in Bridge, not in the
// jdownloader-go client: the MyJDownloader API addresses devices that may be on another
// machine, where a local cfg path means nothing. Bridge launches and owns a local JD, so
// here the file is real.
//
// Bridge needs this because it downloads several animes concurrently while JD runs only
// this many at a time. The surplus sits queued, produces no .part file and reports nothing
// running, and the hoster watch reads that silence as a dead hoster.
func MaxSimultaneousDownloads(exePath string) (int, error) {
	path := filepath.Join(filepath.Dir(exePath), "cfg", generalSettingsFile)

	data, err := os.ReadFile(path)
	if err != nil {
		return 0, fmt.Errorf("jdownloader: read %s: %w", path, err)
	}

	var settings generalSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return 0, fmt.Errorf("jdownloader: parse %s: %w", path, err)
	}

	if settings.MaxSimultaneousDownloads == nil {
		return 0, fmt.Errorf("jdownloader: maxsimultanedownloads not set in %s", path)
	}
	if *settings.MaxSimultaneousDownloads < 1 {
		return 0, fmt.Errorf("jdownloader: maxsimultanedownloads is %d in %s", *settings.MaxSimultaneousDownloads, path)
	}
	return *settings.MaxSimultaneousDownloads, nil
}

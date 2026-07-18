package anime

import (
	"fmt"
	"os"
	"path/filepath"
)

// ResolveAnimeDataPath returns the default legacy anime data path under the
// current user's config directory.
func ResolveAnimeDataPath() (string, error) {
	baseDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config dir for anime data: %w", err)
	}

	return filepath.Join(baseDir, "Autoreas", "data", "animes.dat"), nil
}

// Command devdata refreshes a development copy of the bridge database.
//
// Usage:
//
//	go run ./tools/devdata -to <absolute directory>
//
// Then start a development bridge with AUTOREAS_DATA_DIR set to that directory
// and AUTOREAS_BRIDGE_ADDR set to a free port (docs/observability/development-database.md).
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	to := flag.String("to", "", "absolute directory for the copy (never the live data directory)")
	from := flag.String("from", "", "live bridge.db to copy (default: the platform data directory)")
	flag.Parse()

	src := *from
	if src == "" {
		// Mirrors internal/sync's platform path on purpose: the tool must keep
		// reading the live file even when AUTOREAS_DATA_DIR is set in this shell.
		base, err := os.UserConfigDir()
		if err != nil {
			fmt.Fprintln(os.Stderr, "resolve config dir:", err)
			os.Exit(1)
		}
		src = filepath.Join(base, "Autoreas", "data", copyName)
	}

	dst, err := copyDatabase(src, *to)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("copied %s\n    to %s\n", src, dst)
}

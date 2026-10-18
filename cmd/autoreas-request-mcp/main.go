// Command autoreas-request-mcp runs the read-only MCP sidecar that answers the
// Activity questions (status, incidents, history, runs, recorder, requests and
// response versions) from the bridge database.
package main

import (
	"context"
	"log"
	"time"

	server "autoreas-bridge/internal/mcp/requestcapture"
)

func main() {
	path, err := server.ResolveBridgeDBPath()
	if err != nil {
		log.Fatal(err)
	}
	reader, err := server.OpenReader(path)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = reader.Close() }()
	if err := server.NewServer(reader, time.Now).Run(context.Background()); err != nil {
		log.Fatal(err)
	}
}

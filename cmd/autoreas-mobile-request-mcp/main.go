// Command autoreas-mobile-request-mcp runs the read-only MCP sidecar for captured mobile requests.
package main

import (
	"context"
	"log"

	server "autoreas-bridge/internal/mcp/mobilecapture"
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
	if err := server.NewServer(reader).Run(context.Background()); err != nil {
		log.Fatal(err)
	}
}

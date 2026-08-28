package api

import (
	"net"
	"strconv"
	"strings"
)

// AddrEnvVar overrides the persisted listen address.
//
// It exists because the failure this whole mechanism answers to -- the port
// being taken -- is exactly the failure that makes the settings screen
// unreachable. An escape hatch that lives behind the UI is no escape hatch,
// so the environment wins over anything stored.
const AddrEnvVar = "AUTOREAS_BRIDGE_ADDR"

// ResolveAddr picks the address the HTTP API binds, preferring the environment
// override, then the persisted setting, then DefaultAddr.
//
// An unusable value is skipped rather than fatal, and returned as rejected so
// the caller can say so out loud. Refusing to start on a bad address would
// recreate the failure this exists to prevent: docs/learning-log.md records a
// lost bind setting startupErr, which gated startup, which left download
// readiness reporting unavailable.
//
// A bare port number expands to every interface, because someone editing this
// setting types a port, not a bind address.
func ResolveAddr(setting string, getenv func(string) string) (addr string, rejected string) {
	var override string
	if getenv != nil {
		override = getenv(AddrEnvVar)
	}

	for _, candidate := range []string{override, setting} {
		trimmed := strings.TrimSpace(candidate)
		if trimmed == "" {
			continue
		}
		if normalised, ok := normaliseAddr(trimmed); ok {
			return normalised, rejected
		}
		if rejected == "" {
			rejected = trimmed
		}
	}

	return DefaultAddr, rejected
}

// normaliseAddr turns a configured value into an address net.Listen accepts,
// reporting whether it could. A value made only of digits is read as a port.
func normaliseAddr(value string) (string, bool) {
	if port, err := strconv.Atoi(value); err == nil {
		if !usablePort(port) {
			return "", false
		}
		return net.JoinHostPort("0.0.0.0", strconv.Itoa(port)), true
	}

	host, portText, err := net.SplitHostPort(value)
	if err != nil {
		return "", false
	}
	// Atoi reports 0 on failure, and usablePort already rejects 0, so a separate
	// error branch here would be unreachable rather than defensive.
	port, _ := strconv.Atoi(portText)
	if !usablePort(port) {
		return "", false
	}

	return net.JoinHostPort(host, portText), true
}

// usablePort rejects the values a TCP listener cannot take. Port 0 is excluded
// deliberately: the kernel would assign a random free port, which binds fine
// and then leaves the pairing QR advertising an address that changes on every
// start.
func usablePort(port int) bool {
	return port > 0 && port <= 65535
}

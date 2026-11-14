package dbstall

import (
	"bytes"
	"cmp"
	"encoding/json"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

const (
	// bridgeFramePrefix marks a frame of the Bridge's own code.
	bridgeFramePrefix = "autoreas-bridge/internal/"
	// connWaitFrame is where a goroutine waits for the pool's connection: it
	// is a victim of the stall, not its cause.
	connWaitFrame = "database/sql.(*DB).conn"
	// dumperFramePrefix marks the goroutine that wrote the dump.
	dumperFramePrefix = "runtime/pprof."
	// maxSuspectFrames is how many Bridge frames a suspect keeps, innermost first.
	maxSuspectFrames = 4
)

// goroutineHeader matches a debug=2 goroutine header such as
// "goroutine 12 [chan receive, 46 minutes]:".
var goroutineHeader = regexp.MustCompile(`^goroutine (\d+) \[([^\]]*)\]:$`)

// waitMinutes matches the wait time the runtime adds to a long-blocked goroutine.
var waitMinutes = regexp.MustCompile(`(\d+) minutes?`)

// Suspect is a goroutine that may hold the connection: it runs Bridge code and
// is not one of the goroutines waiting for the connection. Frames are its
// Bridge frames, innermost first, without the module prefix.
type Suspect struct {
	Goroutine   int
	State       string
	WaitMinutes int
	Frames      []string
}

// Suspects reads a debug=2 goroutine dump and returns the suspects, the longest
// blocked first. It drops the goroutines waiting for the connection, the one
// that wrote the dump, and those with no Bridge frame.
func Suspects(dump []byte) []Suspect {
	suspects := []Suspect{}
	for block := range bytes.SplitSeq(dump, []byte("\n\n")) {
		if suspect, ok := readSuspect(string(block)); ok {
			suspects = append(suspects, suspect)
		}
	}
	slices.SortStableFunc(suspects, func(a, b Suspect) int {
		return cmp.Or(cmp.Compare(b.WaitMinutes, a.WaitMinutes), cmp.Compare(a.Goroutine, b.Goroutine))
	})
	return suspects
}

// readSuspect reads one goroutine block and reports whether it is a suspect.
func readSuspect(block string) (Suspect, bool) {
	lines := strings.Split(strings.TrimSpace(block), "\n")
	match := goroutineHeader.FindStringSubmatch(lines[0])
	if match == nil {
		return Suspect{}, false
	}
	suspect := Suspect{State: strings.TrimSpace(strings.SplitN(match[2], ",", 2)[0])}
	suspect.Goroutine, _ = strconv.Atoi(match[1])
	if minutes := waitMinutes.FindStringSubmatch(match[2]); minutes != nil {
		suspect.WaitMinutes, _ = strconv.Atoi(minutes[1])
	}
	// File lines (tab-indented) and "created by" lines never carry a frame
	// prefix, so they fall through every check below.
	for _, line := range lines[1:] {
		function := functionName(line)
		if function == connWaitFrame || strings.HasPrefix(function, dumperFramePrefix) {
			return Suspect{}, false
		}
		if name, ok := strings.CutPrefix(function, bridgeFramePrefix); ok && len(suspect.Frames) < maxSuspectFrames {
			suspect.Frames = append(suspect.Frames, name)
		}
	}
	return suspect, len(suspect.Frames) > 0
}

// functionName drops the argument list a dump prints after a function name.
func functionName(line string) string {
	if open := strings.LastIndex(line, "("); open >= 0 {
		return line[:open]
	}
	return line
}

// Metadata is the stall's Activity record: the abandoned route, the pool, and
// as many suspects as fit in maxBytes of JSON, in order. A runtime_events row
// over its bound loses all of its metadata, so the suspects stop before it and
// suspectsTruncated says some were left out; suspectsFound counts them all.
func (h Header) Metadata(suspects []Suspect, maxBytes int) map[string]any {
	metadata := map[string]any{
		"route": h.Route, "poolMaxOpen": h.Pool.MaxOpen, "poolInUse": h.Pool.InUse, "poolIdle": h.Pool.Idle,
		"poolWaitCount": h.Pool.WaitCount, "poolWaitDurationMs": h.Pool.WaitDurationMS, "suspectsFound": len(suspects),
	}
	kept := []map[string]any{}
	for _, suspect := range suspects {
		entry := map[string]any{"goroutine": suspect.Goroutine, "state": suspect.State, "frames": suspect.Frames}
		if suspect.WaitMinutes > 0 {
			entry["waitMinutes"] = suspect.WaitMinutes
		}
		metadata["suspects"] = append(kept, entry)
		metadata["suspectsTruncated"] = true
		if encoded, err := json.Marshal(metadata); err != nil || len(encoded) > maxBytes {
			break
		}
		kept = append(kept, entry)
	}
	metadata["suspects"] = kept
	if len(kept) == len(suspects) {
		delete(metadata, "suspectsTruncated")
	}
	return metadata
}

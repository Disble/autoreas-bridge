// Package tracerbullet provides the minimal event-bus demonstration flow.
package tracerbullet

import "fmt"

type stdoutSink struct{}

// NewStdoutSink creates a trace sink that writes messages to standard output.
func NewStdoutSink() TraceRecorder {
	return stdoutSink{}
}

func (stdoutSink) Record(message string) {
	fmt.Println(message)
}

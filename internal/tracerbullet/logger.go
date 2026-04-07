package tracerbullet

import "fmt"

type stdoutSink struct{}

func NewStdoutSink() TraceSink {
	return stdoutSink{}
}

func (stdoutSink) Record(message string) {
	fmt.Println(message)
}

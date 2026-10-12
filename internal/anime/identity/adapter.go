package identity

// adapter wires the pure decision algorithm behind the port. It adds no
// logic of its own.
type adapter struct{}

// New returns the Identifier port backed by the pure algorithm.
func New() Identifier { return adapter{} }

// Identify implements Identifier.
func (adapter) Identify(req Request) Result { return decide(req) }

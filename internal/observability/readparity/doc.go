// Package readparity contains observability adapter conformance tests. It is
// the observability fitness function: these tests assert capability parity for
// both adapters, while each adapter verifies in its own package that its
// projections preserve the core's answers. Together, the checks fail when a
// capability disappears or is hidden without a mechanical reason.
package readparity

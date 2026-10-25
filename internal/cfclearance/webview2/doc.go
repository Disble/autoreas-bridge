// Package webview2 is the Windows adapter for the cfclearance Solver port. A solve runs the
// application's own executable again as a windowless child (SolveFlag) that hosts a WebView2
// engine in a never-shown window, lets Cloudflare's managed challenge complete there, and reports
// the resulting cookies and User-Agent back on one marked stdout line (the protocol in
// protocol.go). ProcessSolver is the parent side: it confines the child and every browser process
// it spawns to a kill-on-close job object, bounds its output and time, and refuses anything the
// protocol cannot validate. On other platforms every solve fails with cfclearance.ErrUnsupported.
package webview2

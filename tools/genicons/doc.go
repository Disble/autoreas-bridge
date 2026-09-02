// Command genicons derives every application icon from a single master PNG.
//
// build/appicon.png is the master. Before this tool existed each derived icon
// was hand-maintained, and they drifted: resources/tray-icon.ico still carried
// the pre-rebrand artwork while build/windows/icon.ico held a single 32px entry
// that Explorer had to upscale for its large views.
//
// Run it with no flags to regenerate; run it with -check to fail when a target
// no longer matches the master. The pre-commit gate uses -check.
package main

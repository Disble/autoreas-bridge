//go:build windows

package webview2

import (
	"errors"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"github.com/wailsapp/go-webview2/webviewloader"
	"golang.org/x/sys/windows"
)

var (
	user32               = windows.NewLazySystemDLL("user32.dll")
	procRegisterClassExW = user32.NewProc("RegisterClassExW")
	procCreateWindowExW  = user32.NewProc("CreateWindowExW")
	procDestroyWindow    = user32.NewProc("DestroyWindow")
	procDefWindowProcW   = user32.NewProc("DefWindowProcW")
	procGetMessageW      = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
	procSetTimer         = user32.NewProc("SetTimer")
	procKillTimer        = user32.NewProc("KillTimer")
	procIsWindowVisible  = user32.NewProc("IsWindowVisible")
)

const (
	wsPopup        = 0x80000000
	wsExToolWindow = 0x00000080
	wsExNoActivate = 0x08000000
	wmTimer        = 0x0113
	// pollEvery is the cookie poll period in milliseconds.
	pollEvery = 500
	// offscreen keeps the never-shown window off every monitor even if it were ever shown.
	offscreen = -32000
	// windowClass names the host window class, registered once per process.
	windowClass = "AutoreasCfClearanceSolver"
	// uaMessagePrefix tags the page's navigator.userAgent report on the web message channel.
	uaMessagePrefix = "cfclearance-ua:"
	// runtimeUnavailable prefixes the failure reported when no WebView2 runtime is installed.
	runtimeUnavailable = "webview2 runtime unavailable"
)

// wndClassExW mirrors WNDCLASSEXW.
type wndClassExW struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     windows.Handle
	hIcon         windows.Handle
	hCursor       windows.Handle
	hbrBackground windows.Handle
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       windows.Handle
}

// winMsg mirrors MSG.
type winMsg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      struct{ x, y int32 }
}

// controllerVtable mirrors ICoreWebView2Controller up to Close, which the packaged binding
// does not expose; closing the controller is what makes the browser processes exit.
type controllerVtable struct {
	queryInterface, addRef, release                                                      uintptr
	getIsVisible, putIsVisible, getBounds, putBounds, getZoomFactor, putZoomFactor       uintptr
	addZoomFactorChanged, removeZoomFactorChanged, setBoundsAndZoomFactor, moveFocus     uintptr
	addMoveFocusRequested, removeMoveFocusRequested, addGotFocus, removeGotFocus         uintptr
	addLostFocus, removeLostFocus, addAcceleratorKeyPressed, removeAcceleratorKeyPressed uintptr
	getParentWindow, putParentWindow, notifyParentWindowPositionChanged, close           uintptr
}

// runEngine loads origin in a WebView2 that is never shown, lets the engine pass the challenge
// on its own, and reports the clearance once a cf_clearance other than rejected exists. It
// runs on a locked OS thread with a single-threaded COM apartment, as WebView2 requires.
func runEngine(req engineRequest) Result {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if _, err := webviewloader.GetAvailableCoreWebView2BrowserVersionString(""); err != nil {
		return Result{Error: runtimeUnavailable + ": " + err.Error()}
	}
	_ = windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED)
	defer windows.CoUninitialize()
	hwnd, err := createHiddenWindow()
	if err != nil {
		return Result{Error: err.Error()}
	}
	defer func() { _, _, _ = procDestroyWindow.Call(hwnd) }()
	if req.onWindow != nil {
		req.onWindow(hwnd)
	}
	s := &engineSession{req: req, hwnd: hwnd, deadline: time.Now().Add(req.budget)}
	return s.run()
}

// engineSession is the state of one solve on the engine's UI thread.
type engineSession struct {
	req      engineRequest
	hwnd     uintptr
	deadline time.Time
	manager  *edge.ICoreWebView2CookieManager
	handler  *cookiesHandler
	pending  bool // a GetCookies call is awaiting its completion
	res      Result
}

// run embeds the engine in the hidden window, navigates and pumps until the solve ends.
func (s *engineSession) run() Result {
	wv := edge.NewChromium()
	wv.DataPath = s.req.dataDir
	wv.MessageCallback = s.onMessage
	wv.SetErrorCallback(s.req.fatal)
	if !wv.Embed(s.hwnd) {
		return Result{Error: "webview2 embed failed"}
	}
	defer closeController(wv.GetController())
	wv.Resize()
	wv.Init(`window.chrome.webview.postMessage("` + uaMessagePrefix + `" + navigator.userAgent)`)
	manager, err := wv.GetCookieManager()
	if err != nil {
		return Result{Error: "webview2 cookie manager: " + err.Error()}
	}
	defer manager.Release()
	if s.req.rejected != "" {
		// The engine still holds the refused value and would not be challenged again.
		_ = manager.DeleteCookies(clearanceCookie, s.req.origin+"/")
	}
	s.manager, s.handler = manager, newCookiesHandler(s.onCookies)
	wv.Navigate(s.req.origin + "/")
	s.pump()
	runtime.KeepAlive(s.handler)
	if windowVisible(s.hwnd) {
		return Result{Error: "hidden window reported visible; refusing to report"}
	}
	return s.res
}

// onMessage records the User-Agent the page reports. The clearance is bound to the identity
// the challenge saw, and navigator.userAgent is that value.
func (s *engineSession) onMessage(msg string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) {
	if ua, ok := strings.CutPrefix(msg, uaMessagePrefix); ok {
		s.res.UserAgent = ua
	}
}

// onCookies ends the solve once a fresh cf_clearance and the User-Agent are both known.
func (s *engineSession) onCookies(hr uintptr, cookies []Cookie) {
	s.pending = false
	if hr != 0 || s.res.UserAgent == "" || !freshClearance(cookies, s.req.rejected) {
		return
	}
	s.res.Cookies = cookies
	_, _, _ = procPostQuitMessage.Call(0)
}

// onTick runs on every poll: it refuses a window that became visible, ends on an exhausted
// budget, and otherwise asks for the cookies again. It reports false when the loop must stop.
func (s *engineSession) onTick() bool {
	if windowVisible(s.hwnd) {
		s.res = Result{Error: "hidden window reported visible; refusing to report"}
		return false
	}
	if time.Now().After(s.deadline) {
		s.res = Result{UserAgent: s.res.UserAgent, Error: "timed out waiting for the challenge to clear"}
		return false
	}
	if !s.pending && requestCookies(s.manager, s.req.origin+"/", s.handler) == nil {
		s.pending = true
	}
	return true
}

// pump runs the UI thread's message loop, polling on a thread timer, until the solve ends.
func (s *engineSession) pump() {
	timer, _, _ := procSetTimer.Call(0, 0, pollEvery, 0)
	defer func() { _, _, _ = procKillTimer.Call(0, timer) }()
	var m winMsg
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 || int32(r) == -1 {
			return
		}
		if m.message == wmTimer && m.hwnd == 0 {
			if !s.onTick() {
				return
			}
			continue
		}
		_, _, _ = procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		_, _, _ = procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

// The window class is process-wide, so it is registered exactly once.
var (
	classOnce sync.Once
	classErr  error
)

// registerClass registers the host window class on first use.
func registerClass() error {
	classOnce.Do(func() {
		var hinst windows.Handle
		_ = windows.GetModuleHandleEx(0, nil, &hinst)
		cls, err := windows.UTF16PtrFromString(windowClass)
		if err != nil {
			classErr = err
			return
		}
		wc := wndClassExW{lpfnWndProc: procDefWindowProcW.Addr(), hInstance: hinst, lpszClassName: cls}
		wc.cbSize = uint32(unsafe.Sizeof(wc))
		if atom, _, callErr := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); atom == 0 {
			classErr = fmt.Errorf("RegisterClassExW: %w", callErr)
		}
	})
	return classErr
}

// createHiddenWindow creates the engine's host window: a popup tool window that never
// activates, placed off every monitor, never shown. There is no ShowWindow call in this
// package, and the window is checked for visibility before it is used.
func createHiddenWindow() (uintptr, error) {
	if err := registerClass(); err != nil {
		return 0, err
	}
	cls, _ := windows.UTF16PtrFromString(windowClass)
	var hinst windows.Handle
	_ = windows.GetModuleHandleEx(0, nil, &hinst)
	pos := int32(offscreen)
	hwnd, _, callErr := procCreateWindowExW.Call(wsExToolWindow|wsExNoActivate, uintptr(unsafe.Pointer(cls)), 0,
		wsPopup, uintptr(pos), uintptr(pos), 1280, 800, 0, 0, uintptr(hinst), 0)
	if hwnd == 0 {
		return 0, fmt.Errorf("CreateWindowExW: %w", callErr)
	}
	if windowVisible(hwnd) {
		_, _, _ = procDestroyWindow.Call(hwnd)
		return 0, errors.New("hidden window reported visible at creation")
	}
	return hwnd, nil
}

// windowVisible reports whether Windows considers hwnd visible; an invalid handle is not.
func windowVisible(hwnd uintptr) bool {
	visible, _, _ := procIsWindowVisible.Call(hwnd)
	return visible != 0
}

// closeController closes the WebView2 controller so the engine's browser processes exit.
func closeController(c *edge.ICoreWebView2Controller) {
	if c == nil {
		return
	}
	vtable := (*controllerVtable)(*(*unsafe.Pointer)(unsafe.Pointer(c)))
	_, _, _ = syscall.SyscallN(vtable.close, uintptr(unsafe.Pointer(c)))
}

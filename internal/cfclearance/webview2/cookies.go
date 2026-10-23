//go:build windows

package webview2

import (
	"syscall"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

// ICoreWebView2CookieManager::GetCookies is asynchronous: it takes a completion handler and
// delivers the list on the UI thread, and the list is only alive while the handler runs. The
// packaged binding declares a synchronous out parameter instead, so this file calls the slot
// itself with a real handler and copies the cookies out inside the callback.

// cookieManagerVtable mirrors the leading slots of ICoreWebView2CookieManager.
type cookieManagerVtable struct {
	queryInterface, addRef, release, createCookie, copyCookie, getCookies uintptr
}

// cookiesHandlerVtable mirrors ICoreWebView2GetCookiesCompletedHandler.
type cookiesHandlerVtable struct {
	queryInterface, addRef, release, invoke uintptr
}

// cookiesHandler is the completion handler the runtime invokes with the cookie list. Its first
// field is the vtable pointer, which is what makes it a COM interface.
type cookiesHandler struct {
	vtbl   *cookiesHandlerVtable
	onDone func(hr uintptr, cookies []Cookie)
}

// cookiesVtbl is the one process-wide vtable every handler shares; callbacks are never freed,
// so they are created once.
var cookiesVtbl = &cookiesHandlerVtable{
	queryInterface: windows.NewCallback(func(this *cookiesHandler, _, out *unsafe.Pointer) uintptr {
		*out = unsafe.Pointer(this)
		return 0
	}),
	addRef:  windows.NewCallback(func(*cookiesHandler) uintptr { return 1 }),
	release: windows.NewCallback(func(*cookiesHandler) uintptr { return 1 }),
	invoke: windows.NewCallback(func(this *cookiesHandler, hr uintptr, list *edge.ICoreWebView2CookieList) uintptr {
		this.onDone(hr, readCookies(list))
		return 0
	}),
}

// newCookiesHandler wraps fn as a COM completion handler that receives a copy of the list.
func newCookiesHandler(fn func(hr uintptr, cookies []Cookie)) *cookiesHandler {
	return &cookiesHandler{vtbl: cookiesVtbl, onDone: fn}
}

// requestCookies asks the runtime for the cookies of uri; the report arrives through h on the
// UI thread once the message loop runs.
func requestCookies(manager *edge.ICoreWebView2CookieManager, uri string, h *cookiesHandler) error {
	vtable := (*cookieManagerVtable)(*(*unsafe.Pointer)(unsafe.Pointer(manager)))
	utf16URI, err := windows.UTF16PtrFromString(uri)
	if err != nil {
		return err
	}
	hr, _, _ := syscall.SyscallN(vtable.getCookies, uintptr(unsafe.Pointer(manager)),
		uintptr(unsafe.Pointer(utf16URI)), uintptr(unsafe.Pointer(h)))
	if hr != 0 {
		return syscall.Errno(hr)
	}
	return nil
}

// readCookies copies every cookie out of the runtime's list; it must run inside the
// completion handler because the runtime releases the list when the handler returns.
func readCookies(list *edge.ICoreWebView2CookieList) []Cookie {
	if list == nil {
		return nil
	}
	n, err := list.GetCount()
	if err != nil {
		return nil
	}
	out := make([]Cookie, 0, n)
	for i := uint32(0); i < n; i++ {
		item, err := list.GetItem(i)
		if err != nil || item == nil {
			continue
		}
		out = append(out, readCookie(item))
		item.Release()
	}
	return out
}

// readCookie copies one cookie's attributes; an attribute that cannot be read stays zero and
// the parent's validation decides whether the cookie is usable.
func readCookie(item *edge.ICoreWebView2Cookie) Cookie {
	c := Cookie{}
	c.Name, _ = item.GetName()
	c.Value, _ = item.GetValue()
	c.Domain, _ = item.GetDomain()
	c.Path, _ = item.GetPath()
	c.Expires, _ = item.GetExpires()
	c.Secure, _ = item.GetIsSecure()
	c.HTTPOnly, _ = item.GetIsHttpOnly()
	return c
}

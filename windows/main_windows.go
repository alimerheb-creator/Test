//go:build windows

package main

import (
	"os"
	"path/filepath"
	"unsafe"

	"github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
)

var (
	user32              = windows.NewLazySystemDLL("user32.dll")
	shell32             = windows.NewLazySystemDLL("shell32.dll")
	pMessageBox         = user32.NewProc("MessageBoxW")
	pFindWindow         = user32.NewProc("FindWindowW")
	pShowWindow         = user32.NewProc("ShowWindow")
	pGetWindowLongPtr   = user32.NewProc("GetWindowLongPtrW")
	pSetWindowLongPtr   = user32.NewProc("SetWindowLongPtrW")
	pGetWindowPlacement = user32.NewProc("GetWindowPlacement")
	pSetWindowPlacement = user32.NewProc("SetWindowPlacement")
	pMonitorFromWindow  = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfo     = user32.NewProc("GetMonitorInfoW")
	pSetWindowPos       = user32.NewProc("SetWindowPos")
	pShellExecute       = shell32.NewProc("ShellExecuteW")
)

const (
	title              = "Sixth Front"
	wsOverlappedWindow = 0x00CF0000
	swHide             = 0
	swShowNormal       = 1
	swMaximize         = 3
	swpNoSize          = 0x0001
	swpNoMove          = 0x0002
	swpNoZOrder        = 0x0004
	swpFrameChanged    = 0x0020
	swpNoOwnerZOrder   = 0x0200
	mbIconError        = 0x10
	mbIconInformation  = 0x40
	monitorNearest     = 2
)

var gwlStyle = -16

type point struct{ X, Y int32 }
type rect struct{ Left, Top, Right, Bottom int32 }
type windowPlacement struct {
	Length, Flags, ShowCmd   uint32
	MinPosition, MaxPosition point
	NormalPosition           rect
}
type monitorInfo struct {
	Size          uint32
	Monitor, Work rect
	Flags         uint32
}

func u16(s string) uintptr { p, _ := windows.UTF16PtrFromString(s); return uintptr(unsafe.Pointer(p)) }

func message(text string, icon uintptr) { _, _, _ = pMessageBox.Call(0, u16(text), u16(title), icon) }

func main() {
	url, running, err := serve()
	if err != nil {
		message("Sixth Front could not start:\n"+err.Error(), mbIconError)
		return
	}
	if running {
		message("Sixth Front is already running.", mbIconInformation)
		return
	}

	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "SixthFront")
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus:     true,
		DataPath:      data,
		WindowOptions: webview2.WindowOptions{Title: title, Width: 1280, Height: 760, IconId: 1, Center: true},
	})
	if w == nil {
		// No Microsoft Edge WebView2 Runtime (it comes with Windows 11 and up-to-date Windows 10): play in the browser.
		if h, _, _ := pFindWindow.Call(u16("webview"), u16(title)); h != 0 {
			_, _, _ = pShowWindow.Call(h, swHide)
		}
		_, _, _ = pShellExecute.Call(0, u16("open"), u16(url), 0, 0, swShowNormal)
		message("Sixth Front opened in your web browser, because the Microsoft Edge WebView2 Runtime it plays in "+
			"is not installed (get it free from Microsoft to play in its own window).\n\n"+
			"Keep this box open while you play. Click OK to quit.", mbIconInformation)
		return
	}

	hwnd := uintptr(w.Window())
	_, _, _ = pShowWindow.Call(hwnd, swMaximize)
	var saved windowPlacement
	_ = w.Bind("sixthFrontFullscreen", func() bool { return toggleFullscreen(hwnd, &saved) })
	w.Init(`addEventListener('keydown', (e) => {
  if (e.key !== 'F11' || e.repeat) return;
  e.preventDefault();
  if (window.sixthFrontFullscreen) window.sixthFrontFullscreen();
}, true);`)
	w.Navigate(url)
	w.Run()
}

// toggleFullscreen switches between a borderless window covering the whole screen and the normal window (F11).
func toggleFullscreen(hwnd uintptr, saved *windowPlacement) bool {
	style, _, _ := pGetWindowLongPtr.Call(hwnd, uintptr(gwlStyle))
	if style&wsOverlappedWindow != 0 {
		saved.Length = uint32(unsafe.Sizeof(*saved))
		_, _, _ = pGetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(saved)))
		mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
		mon, _, _ := pMonitorFromWindow.Call(hwnd, monitorNearest)
		_, _, _ = pGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi)))
		_, _, _ = pSetWindowLongPtr.Call(hwnd, uintptr(gwlStyle), style&^wsOverlappedWindow)
		r := mi.Monitor
		_, _, _ = pSetWindowPos.Call(hwnd, 0, uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top),
			swpNoOwnerZOrder|swpFrameChanged)
		return true
	}
	_, _, _ = pSetWindowLongPtr.Call(hwnd, uintptr(gwlStyle), style|wsOverlappedWindow)
	_, _, _ = pSetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(saved)))
	_, _, _ = pSetWindowPos.Call(hwnd, 0, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged)
	return false
}

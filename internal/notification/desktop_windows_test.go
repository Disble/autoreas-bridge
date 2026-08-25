//go:build windows

package notification

import (
	"context"
	"errors"
	"strings"
	"testing"

	toast "git.sr.ht/~jackmordaunt/go-toast/v2"
)

func TestWindowsDesktopAdapterSetsAppDataBeforePush(t *testing.T) {
	originalSetAppData := setDesktopToastAppData
	originalPush := pushDesktopToast
	t.Cleanup(func() {
		setDesktopToastAppData = originalSetAppData
		pushDesktopToast = originalPush
	})

	calls := make([]string, 0, 2)
	setDesktopToastAppData = func(data toast.AppData) error {
		calls = append(calls, "set-app-data")
		if data.AppID != desktopToastAppID {
			t.Fatalf("expected AppID %q, got %q", desktopToastAppID, data.AppID)
		}
		return nil
	}
	pushDesktopToast = func(appID string, xml string) error {
		calls = append(calls, "push")
		if appID != desktopToastAppID {
			t.Fatalf("expected push AppID %q, got %q", desktopToastAppID, appID)
		}
		if !strings.Contains(xml, "Download run started") {
			t.Fatalf("expected toast XML to contain title, got %s", xml)
		}
		return nil
	}

	adapter := NewDesktopToastAdapter()
	err := adapter.Deliver(context.Background(), Delivery{Notification: Notification{Title: "Download run started", Body: "Download check started."}})
	if err != nil {
		t.Fatalf("expected deliver to succeed, got %v", err)
	}
	if !adapter.Delivered() {
		t.Fatal("expected adapter to mark delivery successful")
	}
	if got, want := strings.Join(calls, ","), "set-app-data,push"; got != want {
		t.Fatalf("expected call order %q, got %q", want, got)
	}
}

func TestWindowsDesktopAdapterDoesNotPushWhenAppDataFails(t *testing.T) {
	originalSetAppData := setDesktopToastAppData
	originalPush := pushDesktopToast
	t.Cleanup(func() {
		setDesktopToastAppData = originalSetAppData
		pushDesktopToast = originalPush
	})

	setDesktopToastAppData = func(data toast.AppData) error {
		return errors.New("registry unavailable")
	}
	pushDesktopToast = func(appID string, xml string) error {
		t.Fatal("push must not be called when app data registration fails")
		return nil
	}

	adapter := NewDesktopToastAdapter()
	err := adapter.Deliver(context.Background(), Delivery{Notification: Notification{Title: "Download run started"}})
	if err == nil {
		t.Fatal("expected deliver to return app data error")
	}
	if !strings.Contains(err.Error(), "desktop toast app data") {
		t.Fatalf("expected app data error context, got %v", err)
	}
	if adapter.Delivered() {
		t.Fatal("expected adapter to report not delivered")
	}
}

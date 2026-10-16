package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/settings"
)

// failingSeasonCheckTimeStore embeds a real settings store and fails only the
// season check time read and write, standing in for a locked settings database.
type failingSeasonCheckTimeStore struct {
	*settings.SQLiteStore
}

func (failingSeasonCheckTimeStore) SeasonCheckTime(context.Context) (string, error) {
	return "", errors.New("check time unreadable")
}

func (failingSeasonCheckTimeStore) SetSeasonCheckTime(context.Context, string) error {
	return errors.New("check time unwritable")
}

// panickingSeasonCheckTimeStore stands in for the harness's unusable database,
// whose reads panic instead of erroring; the check runs on the scheduler
// goroutine, where an unrecovered panic would take the whole app down.
type panickingSeasonCheckTimeStore struct {
	failingSeasonCheckTimeStore
}

func (panickingSeasonCheckTimeStore) SeasonCheckTime(context.Context) (string, error) {
	panic("unusable settings database")
}

func TestGetSeasonCheckTimeFallsBackToTheDefault(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		store func(t *testing.T) appSettingsStore
	}{
		{name: "no settings store", store: func(*testing.T) appSettingsStore { return nil }},
		{name: "unset", store: func(t *testing.T) appSettingsStore { return newRenameSettingsStore(t) }},
		{name: "read error", store: func(t *testing.T) appSettingsStore {
			return failingSeasonCheckTimeStore{SQLiteStore: newRenameSettingsStore(t)}
		}},
		{name: "panicking store", store: func(*testing.T) appSettingsStore {
			return panickingSeasonCheckTimeStore{}
		}},
		{name: "invalid stored value", store: func(t *testing.T) appSettingsStore {
			store := newRenameSettingsStore(t)
			if err := store.SetSeasonCheckTime(context.Background(), "25:99"); err != nil {
				t.Fatalf("seed: %v", err)
			}
			return store
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app := newAppTestApp(t)
			app.settingsStore = tc.store(t)
			if got := app.GetSeasonCheckTime(); got != "21:00" {
				t.Fatalf("GetSeasonCheckTime = %q, want the 21:00 default", got)
			}
		})
	}
}

func TestSetSeasonCheckTimePersistsAndWakesTheSeasonScheduler(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)
	scheduler := &fakeAppScheduler{}
	app.seasonScheduler = scheduler

	if got := app.SetSeasonCheckTime("07:30"); got != "ok" {
		t.Fatalf("SetSeasonCheckTime = %q, want \"ok\"", got)
	}
	if got := app.GetSeasonCheckTime(); got != "07:30" {
		t.Fatalf("GetSeasonCheckTime = %q, want the saved 07:30", got)
	}
	if scheduler.notifyConfigChangedCalls != 1 {
		t.Fatalf("NotifyConfigChanged calls = %d, want 1", scheduler.notifyConfigChangedCalls)
	}
}

func TestSetSeasonCheckTimeRejectsAnythingButHHMM(t *testing.T) {
	t.Parallel()

	for _, value := range []string{"", "9:00", "24:00", "12:60", "12:5", "noon", " 07:30", "07:30:00"} {
		t.Run(value, func(t *testing.T) {
			t.Parallel()
			app := newAppTestApp(t)
			app.settingsStore = newRenameSettingsStore(t)
			scheduler := &fakeAppScheduler{}
			app.seasonScheduler = scheduler

			want := "invalid time \"" + value + "\": use HH:MM (00:00-23:59)"
			if got := app.SetSeasonCheckTime(value); got != want {
				t.Fatalf("SetSeasonCheckTime(%q) = %q, want %q", value, got, want)
			}
			if got := app.GetSeasonCheckTime(); got != "21:00" {
				t.Fatalf("GetSeasonCheckTime = %q, want the untouched 21:00 default", got)
			}
			if scheduler.notifyConfigChangedCalls != 0 {
				t.Fatalf("a rejected time must not wake the scheduler")
			}
		})
	}
}

func TestSetSeasonCheckTimeAcceptsTheDayBoundaries(t *testing.T) {
	t.Parallel()

	for _, value := range []string{"00:00", "23:59"} {
		app := newAppTestApp(t)
		app.settingsStore = newRenameSettingsStore(t)
		if got := app.SetSeasonCheckTime(value); got != "ok" {
			t.Fatalf("SetSeasonCheckTime(%q) = %q, want \"ok\"", value, got)
		}
		if got := app.GetSeasonCheckTime(); got != value {
			t.Fatalf("GetSeasonCheckTime = %q, want %q", got, value)
		}
	}
}

func TestSetSeasonCheckTimeSurfacesStoreFailures(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = nil
	if got := app.SetSeasonCheckTime("07:30"); got != "settings store unavailable" {
		t.Fatalf("SetSeasonCheckTime without a store = %q", got)
	}

	app.settingsStore = failingSeasonCheckTimeStore{SQLiteStore: newRenameSettingsStore(t)}
	scheduler := &fakeAppScheduler{}
	app.seasonScheduler = scheduler
	if got := app.SetSeasonCheckTime("07:30"); got != "check time unwritable" {
		t.Fatalf("SetSeasonCheckTime = %q, want the store error surfaced", got)
	}
	if scheduler.notifyConfigChangedCalls != 0 {
		t.Fatalf("a failed save must not wake the scheduler")
	}
}

func TestSeasonScheduleStoreReadsTheConfiguredTime(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)
	store := &seasonScheduleStore{checkTime: app.seasonCheckTime}

	cfg, err := store.GetScheduleConfig(context.Background())
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if cfg.DailyTimeHHMM != "21:00" || !cfg.Enabled || cfg.EnabledWeekdays != allWeekdaysMask {
		t.Fatalf("default config = %+v, want enabled every day at 21:00", cfg)
	}

	if got := app.SetSeasonCheckTime("06:15"); got != "ok" {
		t.Fatalf("SetSeasonCheckTime = %q", got)
	}
	cfg, err = store.GetScheduleConfig(context.Background())
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if cfg.DailyTimeHHMM != "06:15" {
		t.Fatalf("DailyTimeHHMM = %q, want the saved 06:15", cfg.DailyTimeHHMM)
	}
}

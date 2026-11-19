package download

import (
	"context"
	"runtime"
	"testing"
)

// TestSQLiteStoreJDConfigPasswordIsAbsentThenStoredEncryptedThenKeptOnANilUpdate
// saves a config without a password and reads HasPassword=false, saves one with
// a password that round-trips through DecryptedPassword and is never stored as
// plaintext (DPAPI, asserted on Windows), then saves new fields with a nil
// password and keeps the stored one.
func TestSQLiteStoreJDConfigPasswordIsAbsentThenStoredEncryptedThenKeptOnANilUpdate(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SetJDConfig(ctx, JDConfig{Email: "a@b.com"}, nil); err != nil {
		t.Fatalf("SetJDConfig: %v", err)
	}
	assertNoJDPasswordStored(t, store)

	password := "super-secret-myjd-password"
	cfg := JDConfig{Email: "user@example.com", DeviceName: "MyPC", DefaultDestDir: "C:/anime"}
	if err := store.SetJDConfig(ctx, cfg, &password); err != nil {
		t.Fatalf("SetJDConfig: %v", err)
	}
	got, err := store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if !got.HasPassword || got.Email != cfg.Email || got.DeviceName != cfg.DeviceName {
		t.Fatalf("unexpected JD config round-trip: %#v", got)
	}
	assertDecryptedJDPassword(t, store, password)
	if runtime.GOOS == "windows" {
		var blob []byte
		if err := db.QueryRowContext(ctx, `SELECT myjd_password_encrypted FROM download_jd_config WHERE id = 1`).Scan(&blob); err != nil {
			t.Fatalf("query stored blob: %v", err)
		}
		if len(blob) == 0 || containsBytes(blob, []byte(password)) {
			t.Fatal("expected a non-empty stored blob that NEVER contains the plaintext password bytes")
		}
	}

	if err := store.SetJDConfig(ctx, JDConfig{Email: "new@b.com", DeviceName: "PC2"}, nil); err != nil {
		t.Fatalf("second SetJDConfig with nil password: %v", err)
	}
	got, err = store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if got.Email != "new@b.com" || got.DeviceName != "PC2" || !got.HasPassword {
		t.Fatalf("unexpected updated config: %#v", got)
	}
	assertDecryptedJDPassword(t, store, password)
}

// assertNoJDPasswordStored fails when the store reports or decrypts a password.
func assertNoJDPasswordStored(t *testing.T, store *SQLiteStore) {
	t.Helper()
	ctx := context.Background()

	got, err := store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if got.HasPassword {
		t.Fatal("expected HasPassword=false when no password has ever been set")
	}
	_, ok, err := store.DecryptedPassword(ctx)
	if err != nil {
		t.Fatalf("DecryptedPassword: %v", err)
	}
	if ok {
		t.Fatal("expected DecryptedPassword ok=false when no password is stored")
	}
}

// assertDecryptedJDPassword fails when DecryptedPassword does not return want.
func assertDecryptedJDPassword(t *testing.T, store *SQLiteStore, want string) {
	t.Helper()

	plain, ok, err := store.DecryptedPassword(context.Background())
	if err != nil {
		t.Fatalf("DecryptedPassword: %v", err)
	}
	if !ok || plain != want {
		t.Fatalf("expected DecryptedPassword to return the stored password, got ok=%v plain=%q", ok, plain)
	}
}

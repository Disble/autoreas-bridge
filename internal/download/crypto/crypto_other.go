//go:build !windows

// Package crypto provides the Protect/Unprotect seam used to encrypt the MyJDownloader
// password at rest (design.md §7, ADR-4/ADR-7). This file is a CLEARLY-LABELED, NON-SECURE
// fake that exists ONLY so the non-Windows CI build compiles and non-security tests run on
// Linux/macOS. It MUST NOT be treated as satisfying any "encrypted at rest" security
// scenario (download-config spec "Non-Windows fake never counts as secure storage";
// design §7 W7 / §12).
package crypto

import "errors"

// Insecure is always true on non-Windows builds: this implementation provides NO real
// encryption. Callers/tests MUST NOT rely on it for any security guarantee.
const Insecure = true

const insecureFakePrefix = "INSECURE-NONWINDOWS-FAKE:"

// Protect is a trivial, NON-SECURE obfuscation (prefix-tag, not encryption) that exists
// solely to keep the non-Windows build compiling. It is intentionally reversible without
// any key material -- never use this build's ciphertext as a real secret store.
func Protect(plaintext []byte) ([]byte, error) {
	out := make([]byte, 0, len(insecureFakePrefix)+len(plaintext))
	out = append(out, []byte(insecureFakePrefix)...)
	out = append(out, plaintext...)
	return out, nil
}

// Unprotect reverses the non-secure Protect fake above. It returns an error (and empty
// plaintext) for any blob lacking the fake's tag, mirroring the "never return plaintext
// on failure" shape of the real DPAPI seam, even though this build provides no real
// security guarantee.
func Unprotect(ciphertext []byte) ([]byte, error) {
	prefix := []byte(insecureFakePrefix)
	if len(ciphertext) < len(prefix) || string(ciphertext[:len(prefix)]) != insecureFakePrefix {
		return []byte{}, errors.New("crypto: invalid insecure-fake blob")
	}
	out := make([]byte, len(ciphertext)-len(prefix))
	copy(out, ciphertext[len(prefix):])
	return out, nil
}

/**
 * Extracts a user-facing message from an unknown rejection value.
 *
 * `error instanceof Error` alone is not enough at the Wails boundary: a Go
 * binding that returns an error rejects its promise with a plain **string**,
 * not an Error instance. Code that only reads `.message` off real Errors
 * therefore discards every backend diagnostic and substitutes a generic
 * sentence — which is how "Download readiness unavailable / Failed to load
 * animes" hid the real cause. Falls back only when there is genuinely no text.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    return error.trim().length > 0 ? error.trim() : fallback;
  }

  if (error instanceof Error) {
    return error.message.trim().length > 0 ? error.message.trim() : fallback;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
  }

  return fallback;
}

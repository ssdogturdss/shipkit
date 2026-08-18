/**
 * Helpers for normalizing user-supplied credentials before they are encrypted
 * and stored, or used as HTTP bearer credentials at runtime.
 *
 * Copy/paste frequently introduces stray whitespace or hidden non-ASCII
 * characters (e.g. an arrow glyph, an emoji, or a smart quote) into a token.
 * Such a value cannot be placed in an HTTP header — Node throws
 * "Cannot convert argument to a ByteString ... value ... greater than 255".
 * We catch this at the source so the user gets an actionable message instead
 * of a cryptic crash mid-pipeline.
 */

/** Bearer tokens are printable ASCII with no spaces or control characters. */
const HEADER_SAFE_TOKEN = /^[\x21-\x7E]+$/;

export class CredentialFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialFormatError";
  }
}

/** True when `token` is safe to interpolate into an HTTP header value. */
export function isHeaderSafeToken(token: string): boolean {
  return HEADER_SAFE_TOKEN.test(token);
}

/**
 * Trim a pasted bearer credential and verify it is safe to use in an HTTP
 * header. Returns null for empty input. Throws {@link CredentialFormatError}
 * when the value contains spaces, control characters, or non-ASCII characters.
 */
export function cleanBearerToken(value: string | null | undefined, label: string): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!isHeaderSafeToken(trimmed)) {
    throw new CredentialFormatError(
      `${label} contains invalid characters (likely spaces or a hidden symbol picked up while copying). Re-copy it from the source as plain text.`,
    );
  }
  return trimmed;
}

/**
 * Resolve pipeline credentials from environment Secrets, falling back to the
 * encrypted value stored on the config row.
 *
 * Each secret-backed field may be supplied as a Replit Secret using one of two
 * names, checked in this order (first match wins):
 *   1. Per-pipeline:  SHIPKIT_PIPELINE_<configId>_<SUFFIX>
 *   2. Global:        SHIPKIT_<SUFFIX>
 * If neither is set, the value saved on the config (database) is used. This
 * keeps multi-pipeline setups working while letting the most sensitive keys
 * (e.g. the App Store .p8) live only in Secrets and never touch the database.
 *
 * The SHIPKIT_ prefix avoids collisions with common environment variables such
 * as GITHUB_TOKEN that other tooling may set.
 */

export type CredentialField =
  | "githubToken"
  | "easToken"
  | "appStoreKeyId"
  | "appStoreIssuerId"
  | "appStorePrivateKey";

/** Secret-name suffix for each credential field. */
const SECRET_SUFFIX: Record<CredentialField, string> = {
  githubToken: "GITHUB_TOKEN",
  easToken: "EAS_TOKEN",
  appStoreKeyId: "APP_STORE_KEY_ID",
  appStoreIssuerId: "APP_STORE_ISSUER_ID",
  appStorePrivateKey: "APP_STORE_PRIVATE_KEY",
};

function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Returns the Secret value for a field — per-pipeline name first, then the
 * global name — or null when no matching Secret is set.
 */
export function readCredentialSecret(configId: number, field: CredentialField): string | null {
  const suffix = SECRET_SUFFIX[field];
  return readEnv(`SHIPKIT_PIPELINE_${configId}_${suffix}`) ?? readEnv(`SHIPKIT_${suffix}`);
}

/**
 * Effective credential value: a matching Secret takes precedence, otherwise the
 * stored database value is used.
 *
 * `dbValue` may be a value or a getter. When a getter is passed it is only
 * invoked if no Secret is set, so a configured Secret fully bypasses database
 * decryption (a malformed/stale encrypted column can't break a Secret-only
 * setup).
 */
export function resolveCredential(
  configId: number,
  field: CredentialField,
  dbValue: string | null | (() => string | null),
): string | null {
  const secret = readCredentialSecret(configId, field);
  if (secret !== null) return secret;
  return typeof dbValue === "function" ? dbValue() : dbValue;
}

/**
 * True when a Secret supplies this field. Used for UI status without decrypting
 * the database value.
 */
export function hasCredentialSecret(configId: number, field: CredentialField): boolean {
  return readCredentialSecret(configId, field) !== null;
}

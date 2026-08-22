import crypto from "crypto";

/**
 * Field-level encryption for the secrets we store at rest:
 * PaymentProviderConfiguration.secretKey / .webhookSecret, and
 * SmsConfiguration.apiKey. AES-256-GCM via Node's built-in crypto - no new
 * dependency, no external KMS to provision.
 *
 * The encryption key itself lives ONLY in the ENCRYPTION_KEY env var, never
 * in the database - a DB leak alone (a leaked DATABASE_URL, a stray backup)
 * is then useless to an attacker without also having the deploy platform's
 * environment variables.
 *
 * Rollout safety: decryptSecret() treats any value that doesn't start with
 * our "enc:v1:" prefix as a legacy plaintext value written before this was
 * added, and returns it unchanged rather than throwing. That means this can
 * ship without an urgent cutover - nothing breaks the moment it deploys.
 * Every value gets encrypted going forward the next time it's saved via the
 * admin UI, and scripts/encrypt-existing-secrets.ts can be run once to
 * proactively encrypt whatever's still sitting in plaintext instead of
 * waiting for that to happen naturally.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce length for GCM
const AUTH_TAG_LENGTH = 16;
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to your environment before saving payment or SMS secrets."
    );
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must decode to exactly 32 bytes. Generate one with `openssl rand -base64 32` and make sure it's copied in full."
    );
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) {
    // Legacy plaintext - see rollout note above.
    return value;
  }
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncrypted(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(PREFIX));
}

/**
 * Decrypts the two secret fields on a PaymentProviderConfiguration row.
 * Call this exactly once, right after loading the config from the DB, and
 * use the returned object everywhere downstream (provider calls, signature
 * verification) - never read department.paymentConfig.secretKey directly.
 */
export function decryptPaymentSecrets<T extends { secretKey: string | null; webhookSecret: string | null }>(
  config: T
): T {
  return {
    ...config,
    secretKey: config.secretKey ? decryptSecret(config.secretKey) : config.secretKey,
    webhookSecret: config.webhookSecret ? decryptSecret(config.webhookSecret) : config.webhookSecret,
  };
}

/** Same idea for SmsConfiguration.apiKey. */
export function decryptSmsApiKey<T extends { apiKey: string | null }>(config: T): T {
  return { ...config, apiKey: config.apiKey ? decryptSecret(config.apiKey) : config.apiKey };
}

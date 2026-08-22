import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted, decryptPaymentSecrets, decryptSmsApiKey } from "@/lib/crypto/field-encryption";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64"); // deterministic 32-byte key for tests

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value", () => {
    const encrypted = encryptSecret("sk_test_super_secret_123");
    expect(encrypted).not.toBe("sk_test_super_secret_123");
    expect(decryptSecret(encrypted)).toBe("sk_test_super_secret_123");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-value");
    expect(decryptSecret(b)).toBe("same-value");
  });

  it("passes through a legacy plaintext value unchanged", () => {
    expect(decryptSecret("sk_live_already_stored_as_plaintext")).toBe("sk_live_already_stored_as_plaintext");
  });

  it("throws if the ciphertext has been tampered with", () => {
    const encrypted = encryptSecret("sk_test_123");
    const tampered = encrypted.slice(0, -4) + "abcd";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws a clear error when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY is not set/);
  });

  it("throws a clear error when ENCRYPTION_KEY is the wrong length", () => {
    process.env.ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});

describe("isEncrypted", () => {
  it("recognizes an encrypted value", () => {
    expect(isEncrypted(encryptSecret("x"))).toBe(true);
  });

  it("recognizes plaintext / null / undefined as not encrypted", () => {
    expect(isEncrypted("sk_live_plain")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});

describe("decryptPaymentSecrets", () => {
  it("decrypts secretKey and webhookSecret, leaves everything else untouched", () => {
    const config = {
      provider: "PAYSTACK",
      secretKey: encryptSecret("sk_live_abc"),
      webhookSecret: encryptSecret("wh_secret_xyz"),
    };
    const result = decryptPaymentSecrets(config);
    expect(result.secretKey).toBe("sk_live_abc");
    expect(result.webhookSecret).toBe("wh_secret_xyz");
    expect(result.provider).toBe("PAYSTACK");
  });

  it("leaves null secrets as null", () => {
    const result = decryptPaymentSecrets({ secretKey: null, webhookSecret: null });
    expect(result.secretKey).toBeNull();
    expect(result.webhookSecret).toBeNull();
  });
});

describe("decryptSmsApiKey", () => {
  it("decrypts apiKey", () => {
    const result = decryptSmsApiKey({ apiKey: encryptSecret("at_key_123"), username: "sandbox" });
    expect(result.apiKey).toBe("at_key_123");
    expect(result.username).toBe("sandbox");
  });
});

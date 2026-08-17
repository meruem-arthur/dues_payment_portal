import crypto from "crypto";

/**
 * Generates a random, readable password suitable for a financial secretary
 * account created during department setup. Avoids visually ambiguous
 * characters (0/O, 1/l/I) since these are often read off a screen and typed
 * by hand on a phone.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const SYMBOLS = "!@#$%&*";

export function generatePassword(length = 12): string {
  const bytes = crypto.randomBytes(length);
  let password = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");

  // Guarantee at least one symbol and one digit so it satisfies typical
  // "strong password" expectations, without weakening the random base.
  const symbol = SYMBOLS[crypto.randomInt(SYMBOLS.length)];
  const digit = String(crypto.randomInt(10));
  password = symbol + digit + password.slice(2);

  return password;
}

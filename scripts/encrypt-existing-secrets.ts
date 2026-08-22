// One-off migration helper: encrypts any PaymentProviderConfiguration
// secretKey/webhookSecret and SmsConfiguration apiKey that are still
// stored as legacy plaintext (i.e. don't already start with "enc:v1:").
//
// NOT required before deploying the encryption change - field-encryption.ts
// reads legacy plaintext transparently, so nothing breaks without this.
// Running it just closes the gap immediately instead of waiting for each
// config to get naturally re-saved through the admin UI.
//
// Safe to run more than once - already-encrypted values are left alone.
//
// Usage (requires ENCRYPTION_KEY and DATABASE_URL already set in your env):
//   npx tsx scripts/encrypt-existing-secrets.ts

import { prisma } from "../src/lib/db";
import { encryptSecret, isEncrypted } from "../src/lib/crypto/field-encryption";

async function main() {
  let paymentConfigsUpdated = 0;
  let smsConfigsUpdated = 0;

  const paymentConfigs = await prisma.paymentProviderConfiguration.findMany();
  for (const config of paymentConfigs) {
    const data: { secretKey?: string; webhookSecret?: string } = {};
    if (config.secretKey && !isEncrypted(config.secretKey)) {
      data.secretKey = encryptSecret(config.secretKey);
    }
    if (config.webhookSecret && !isEncrypted(config.webhookSecret)) {
      data.webhookSecret = encryptSecret(config.webhookSecret);
    }
    if (Object.keys(data).length > 0) {
      await prisma.paymentProviderConfiguration.update({ where: { id: config.id }, data });
      paymentConfigsUpdated++;
    }
  }

  const smsConfigs = await prisma.smsConfiguration.findMany();
  for (const config of smsConfigs) {
    if (config.apiKey && !isEncrypted(config.apiKey)) {
      await prisma.smsConfiguration.update({
        where: { id: config.id },
        data: { apiKey: encryptSecret(config.apiKey) },
      });
      smsConfigsUpdated++;
    }
  }

  console.log(`Encrypted ${paymentConfigsUpdated} payment config(s) and ${smsConfigsUpdated} SMS config(s).`);
  console.log("Any already-encrypted rows were left untouched. Safe to re-run any time.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

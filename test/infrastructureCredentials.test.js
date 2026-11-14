const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encryptCredentials,
  decryptCredentials,
} = require("../infrastructure/credentials");

test("encrypts and decrypts credentials using an environment key", () => {
  const originalKey = process.env.SNMP_CREDENTIALS_KEY;
  process.env.SNMP_CREDENTIALS_KEY = "a".repeat(64);

  try {
    const credentials = { version: "v2c", community: "test-secret" };
    const encrypted = encryptCredentials(credentials);

    assert.notEqual(encrypted, JSON.stringify(credentials));
    assert.deepEqual(decryptCredentials(encrypted), credentials);
    assert.throws(() => decryptCredentials(encrypted.slice(0, -4)));
  } finally {
    if (originalKey === undefined) {
      delete process.env.SNMP_CREDENTIALS_KEY;
    } else {
      process.env.SNMP_CREDENTIALS_KEY = originalKey;
    }
  }
});

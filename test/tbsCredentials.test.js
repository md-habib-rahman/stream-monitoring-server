const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encryptCredentials,
  decryptCredentials,
} = require("../services/tbs/credentials");

test("encrypts TBS credentials with a dedicated environment key", () => {
  const originalKey = process.env.TBS_CREDENTIALS_KEY;
  process.env.TBS_CREDENTIALS_KEY = "b".repeat(64);

  try {
    const credentials = { username: "operator", password: "example-secret" };
    const encrypted = encryptCredentials(credentials);

    assert.match(encrypted, /^v1:/);
    assert.notEqual(encrypted.includes(credentials.password), true);
    assert.deepEqual(decryptCredentials(encrypted), credentials);
    assert.throws(() => decryptCredentials(`${encrypted.slice(0, -4)}AAAA`));
  } finally {
    if (originalKey === undefined) {
      delete process.env.TBS_CREDENTIALS_KEY;
    } else {
      process.env.TBS_CREDENTIALS_KEY = originalKey;
    }
  }
});

test("requires a 32-byte hexadecimal encryption key", () => {
  const originalKey = process.env.TBS_CREDENTIALS_KEY;
  delete process.env.TBS_CREDENTIALS_KEY;

  try {
    assert.throws(() =>
      encryptCredentials({ username: "operator", password: "secret" }),
    );
    process.env.TBS_CREDENTIALS_KEY = "not-a-key";
    assert.throws(() =>
      encryptCredentials({ username: "operator", password: "secret" }),
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.TBS_CREDENTIALS_KEY;
    } else {
      process.env.TBS_CREDENTIALS_KEY = originalKey;
    }
  }
});

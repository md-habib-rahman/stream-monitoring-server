const {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} = require("node:crypto");

function getEncryptionKey() {
  const value = process.env.SNMP_CREDENTIALS_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) {
    throw new Error("SNMP_CREDENTIALS_KEY must be a 32-byte hexadecimal key");
  }

  return Buffer.from(value, "hex");
}

function encryptCredentials(credentials) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `v1:${nonce.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decryptCredentials(value) {
  const [version, nonce, tag, ciphertext] = String(value).split(":");
  if (version !== "v1" || !nonce || !tag || !ciphertext) {
    throw new Error("Unsupported or invalid encrypted SNMP credentials");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext);
}

module.exports = {
  encryptCredentials,
  decryptCredentials,
};

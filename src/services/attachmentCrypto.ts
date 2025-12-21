import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const MAGIC = Buffer.from("SSENC1");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export const encryptAttachment = (data: Buffer, key: Buffer): Buffer => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, encrypted]);
};

export const decryptAttachment = (data: Buffer, key: Buffer): Buffer => {
  if (data.length < MAGIC.length || !data.subarray(0, MAGIC.length).equals(MAGIC)) {
    return data;
  }
  const offset = MAGIC.length;
  const iv = data.subarray(offset, offset + IV_LENGTH);
  const tag = data.subarray(offset + IV_LENGTH, offset + IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(offset + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

import { describe, expect, it } from "vitest";
import { encryptAttachment, decryptAttachment } from "../src/services/attachmentCrypto";
import { resolveStoragePath } from "../src/services/storagePaths";

describe("attachment encryption + storage isolation", () => {
  it("encrypts bytes and decrypts back to original content", () => {
    const key = Buffer.alloc(32, 7);
    const plaintext = Buffer.from("safety-secret");
    const encrypted = encryptAttachment(plaintext, key);

    expect(encrypted.equals(plaintext)).toBe(false);
    const decrypted = decryptAttachment(encrypted, key);
    expect(decrypted.toString("utf8")).toBe("safety-secret");
  });

  it("keeps storage paths within the org root", () => {
    const { root, filePath } = resolveStoragePath("/var/safety/org-a", "case-1/file.txt");
    expect(filePath.startsWith(root)).toBe(true);
    expect(() => resolveStoragePath("/var/safety/org-a", "../org-b/file.txt")).toThrow();
  });

  it("separates storage roots across orgs", () => {
    const storageKey = "case-1/file.txt";
    const orgA = resolveStoragePath("/var/safety/org-a", storageKey);
    const orgB = resolveStoragePath("/var/safety/org-b", storageKey);
    expect(orgA.filePath).not.toBe(orgB.filePath);
  });
});

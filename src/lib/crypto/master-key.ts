import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const MASTER_KEY_CIPHER_PREFIX = "ssfw-aes-256-gcm:v1";

const AES_256_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

export class MasterKeyConfigurationError extends Error {
	readonly code = "master_encryption_key_not_configured";

	constructor(message = "MASTER_ENCRYPTION_KEY must be a 32-byte key.") {
		super(message);
		this.name = "MasterKeyConfigurationError";
	}
}

export class MasterKeyCiphertextFormatError extends Error {
	readonly code = "master_key_ciphertext_format_invalid";

	constructor() {
		super(
			`Ciphertext must use ${MASTER_KEY_CIPHER_PREFIX}:<iv>:<tag>:<ciphertext>.`,
		);
		this.name = "MasterKeyCiphertextFormatError";
	}
}

export type MasterKeyEncryptOptions = {
	readonly key?: string | Buffer | Uint8Array;
	readonly iv?: Buffer | Uint8Array;
};

export type MasterKeyDecryptOptions = {
	readonly key?: string | Buffer | Uint8Array;
};

export function encryptWithMasterKey(
	plaintext: string,
	options: MasterKeyEncryptOptions = {},
): Buffer {
	const key = resolveMasterEncryptionKey(options.key);
	const iv = Buffer.from(options.iv ?? randomBytes(GCM_IV_BYTES));

	if (iv.byteLength !== GCM_IV_BYTES) {
		throw new MasterKeyConfigurationError(
			`AES-256-GCM IV must be ${GCM_IV_BYTES} bytes.`,
		);
	}

	const cipher = createCipheriv("aes-256-gcm", key, iv, {
		authTagLength: GCM_TAG_BYTES,
	});
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return Buffer.from(
		[
			MASTER_KEY_CIPHER_PREFIX,
			iv.toString("base64url"),
			tag.toString("base64url"),
			ciphertext.toString("base64url"),
		].join(":"),
		"utf8",
	);
}

export function decryptWithMasterKey(
	ciphertext: Buffer | Uint8Array | string,
	options: MasterKeyDecryptOptions = {},
): string {
	const key = resolveMasterEncryptionKey(options.key);
	const encoded =
		typeof ciphertext === "string"
			? ciphertext
			: Buffer.from(ciphertext).toString("utf8");
	const parts = encoded.split(":");

	if (
		parts.length !== 5 ||
		parts[0] !== "ssfw-aes-256-gcm" ||
		parts[1] !== "v1"
	) {
		throw new MasterKeyCiphertextFormatError();
	}

	const [, , encodedIv, encodedTag, encodedCiphertext] = parts;
	const iv = decodeBase64Url(encodedIv);
	const tag = decodeBase64Url(encodedTag);
	const encrypted = decodeBase64Url(encodedCiphertext);

	if (iv.byteLength !== GCM_IV_BYTES || tag.byteLength !== GCM_TAG_BYTES) {
		throw new MasterKeyCiphertextFormatError();
	}

	const decipher = createDecipheriv("aes-256-gcm", key, iv, {
		authTagLength: GCM_TAG_BYTES,
	});
	decipher.setAuthTag(tag);

	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
		"utf8",
	);
}

export function resolveMasterEncryptionKey(
	key: string | Buffer | Uint8Array | undefined = process.env
		.MASTER_ENCRYPTION_KEY,
): Buffer {
	if (!key) {
		throw new MasterKeyConfigurationError(
			"MASTER_ENCRYPTION_KEY is required for BYOK encryption.",
		);
	}

	const decoded =
		typeof key === "string" ? decodeKeyString(key) : Buffer.from(key);

	if (decoded.byteLength !== AES_256_KEY_BYTES) {
		throw new MasterKeyConfigurationError(
			"MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM.",
		);
	}

	return decoded;
}

function decodeKeyString(key: string): Buffer {
	const trimmed = key.trim();

	if (trimmed.startsWith("base64:")) {
		return Buffer.from(trimmed.slice("base64:".length), "base64");
	}

	if (trimmed.startsWith("base64url:")) {
		return Buffer.from(trimmed.slice("base64url:".length), "base64url");
	}

	if (/^[0-9a-f]{64}$/i.test(trimmed)) {
		return Buffer.from(trimmed, "hex");
	}

	return Buffer.from(trimmed, "utf8");
}

function decodeBase64Url(value: string | undefined): Buffer {
	if (!value) {
		throw new MasterKeyCiphertextFormatError();
	}

	try {
		return Buffer.from(value, "base64url");
	} catch {
		throw new MasterKeyCiphertextFormatError();
	}
}

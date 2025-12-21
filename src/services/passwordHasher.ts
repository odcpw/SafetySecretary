import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 64
};

const encodeParams = () => `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}`;

const parseParams = (value: string) => {
  const [algo, n, r, p] = value.split("$");
  if (algo !== "scrypt") {
    throw new Error("Unsupported password hash format");
  }
  const parsed = {
    N: Number.parseInt(n ?? "", 10),
    r: Number.parseInt(r ?? "", 10),
    p: Number.parseInt(p ?? "", 10),
    keyLen: SCRYPT_PARAMS.keyLen
  };
  if (!Number.isFinite(parsed.N) || !Number.isFinite(parsed.r) || !Number.isFinite(parsed.p)) {
    throw new Error("Invalid password hash parameters");
  }
  return parsed;
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p
  })) as Buffer;
  return `${encodeParams()}$${salt.toString("base64")}$${derived.toString("base64")}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split("$");
  if (parts.length < 6) {
    return false;
  }
  const params = parseParams(parts.slice(0, 4).join("$"));
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (!salt.length || !expected.length) {
    return false;
  }
  const derived = (await scrypt(password, salt, params.keyLen, {
    N: params.N,
    r: params.r,
    p: params.p
  })) as Buffer;
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
};

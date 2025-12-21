import path from "node:path";

export const resolveStoragePath = (storageRoot: string, storageKey: string) => {
  const root = path.resolve(storageRoot);
  const filePath = path.resolve(root, storageKey);
  if (!filePath.startsWith(root + path.sep)) {
    throw new Error("Invalid storageKey");
  }
  return { root, filePath };
};

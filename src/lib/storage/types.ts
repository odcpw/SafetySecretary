export type StorageBody = string | Buffer | Uint8Array | ArrayBuffer;

export interface StoragePutOptions {
  readonly contentType?: string;
  readonly sizeBytes?: number;
  readonly customMetadata?: Readonly<Record<string, string>>;
}

export interface StorageObjectMetadata {
  readonly key: string;
  readonly contentType?: string;
  readonly sizeBytes: number;
  readonly updatedAt: Date;
  readonly customMetadata?: Readonly<Record<string, string>>;
}

export interface StorageObject {
  readonly body: Buffer;
  readonly metadata: StorageObjectMetadata;
}

export interface StorageListOptions {
  readonly limit?: number;
}

export interface StorageListResult {
  readonly items: readonly StorageObjectMetadata[];
  readonly truncated: boolean;
}

export interface Storage {
  put(
    key: string,
    body: StorageBody,
    options?: StoragePutOptions,
  ): Promise<StorageObjectMetadata>;
  get(key: string): Promise<StorageObject>;
  head(key: string): Promise<StorageObjectMetadata>;
  delete(key: string): Promise<void>;
  list(prefix: string, options?: StorageListOptions): Promise<StorageListResult>;
}

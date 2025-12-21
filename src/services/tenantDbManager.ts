import { PrismaClient } from "@prisma/client";

type TenantClientEntry = {
  client: PrismaClient;
  lastUsedAt: number;
};

export class TenantDbManager {
  private readonly clients = new Map<string, TenantClientEntry>();

  getClient(connectionString: string): PrismaClient {
    const existing = this.clients.get(connectionString);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.client;
    }
    const client = new PrismaClient({ datasources: { db: { url: connectionString } } });
    this.clients.set(connectionString, { client, lastUsedAt: Date.now() });
    return client;
  }

  async disconnectAll(): Promise<void> {
    const entries = [...this.clients.values()];
    await Promise.all(entries.map((entry) => entry.client.$disconnect()));
    this.clients.clear();
  }
}

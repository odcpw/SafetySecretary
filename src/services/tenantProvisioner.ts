import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";
import { RegistryService, normalizeOrgSlug } from "./registryService";

type ProvisionInput = {
  slug: string;
  name: string;
  storageRoot?: string;
  dbConnectionString?: string;
};

type ProvisionResult = {
  orgId: string;
  slug: string;
  dbConnectionString: string;
  storageRoot: string;
};

const buildDefaultStorageRoot = (slug: string) => path.resolve(env.attachmentsDir, slug);

const buildTenantDbName = (slug: string) => `ss_${slug.replace(/[^a-z0-9_]/g, "_")}`;

const withDatabase = (adminUrl: string, database: string) => {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
};

export const runTenantMigrations = async (databaseUrl: string) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "inherit"
      }
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy exited with code ${code}`));
    });
    child.on("error", reject);
  });
};

export class TenantProvisioner {
  constructor(private readonly registryService: RegistryService) {}

  async provisionOrg(input: ProvisionInput): Promise<ProvisionResult> {
    const slug = normalizeOrgSlug(input.slug);
    if (!slug) {
      throw new Error("Invalid org slug");
    }

    const storageRoot = input.storageRoot ? path.resolve(input.storageRoot) : buildDefaultStorageRoot(slug);
    let dbConnectionString = input.dbConnectionString;

    if (!dbConnectionString) {
      if (!env.postgresAdminUrl) {
        throw new Error("POSTGRES_ADMIN_URL is required to create tenant databases");
      }
      const dbName = buildTenantDbName(slug);
      await this.createDatabase(env.postgresAdminUrl, dbName);
      dbConnectionString = withDatabase(env.postgresAdminUrl, dbName);
    }

    const org = await this.registryService.createOrganization({
      slug,
      name: input.name,
      dbConnectionString,
      storageRoot
    });

    await runTenantMigrations(dbConnectionString);

    return {
      orgId: org.id,
      slug: org.slug,
      dbConnectionString: org.dbConnectionString,
      storageRoot: org.storageRoot
    };
  }

  private async createDatabase(adminUrl: string, dbName: string): Promise<void> {
    const safeName = dbName.replace(/"/g, "\"\"");
    const adminClient = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    try {
      const existing = (await adminClient.$queryRawUnsafe<{ datname: string }[]>(
        "SELECT datname FROM pg_database WHERE datname = $1",
        dbName
      )) as { datname: string }[];
      if (existing.length === 0) {
        await adminClient.$executeRawUnsafe(`CREATE DATABASE "${safeName}"`);
      }
    } finally {
      await adminClient.$disconnect();
    }
  }
}

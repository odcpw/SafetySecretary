import { RegistryService } from "../services/registryService";
import { TenantProvisioner, runTenantMigrations } from "../services/tenantProvisioner";
import { hashPassword } from "../services/passwordHasher";

type ParsedArgs = {
  command: string | null;
  options: Record<string, string>;
};

const parseArgs = (argv: string[]): ParsedArgs => {
  const [command, ...rest] = argv;
  const options: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      options[key] = "true";
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return { command: command ?? null, options };
};

const printUsage = () => {
  console.log(`
SafetySecretary admin CLI

Commands:
  org:create --slug <slug> --name <name> [--storage-root <path>] [--db-url <url>]
  org:migrate --slug <slug> | --all
  user:reset-password --org <slug> --username <username> --password <password>
  user:unlock --org <slug> --username <username>
  user:revoke-sessions --org <slug> --username <username>
  org:revoke-sessions --slug <slug>
`);
};

const requireOption = (options: Record<string, string>, key: string) => {
  const value = options[key];
  if (!value || value === "true") {
    throw new Error(`Missing required option --${key}`);
  }
  return value;
};

const main = async () => {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const registry = new RegistryService();
  await registry.connect();

  try {
    if (command === "org:create") {
      const slug = requireOption(options, "slug");
      const name = requireOption(options, "name");
      const storageRoot = options["storage-root"];
      const dbUrl = options["db-url"];

      const provisioner = new TenantProvisioner(registry);
      const result = await provisioner.provisionOrg({
        slug,
        name,
        storageRoot: storageRoot || undefined,
        dbConnectionString: dbUrl || undefined
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === "org:migrate") {
      const slug = options.slug;
      const runAll = options.all === "true";
      if (!slug && !runAll) {
        throw new Error("Provide --slug <slug> or --all");
      }
      const orgs = runAll ? await registry.listOrganizations() : [];
      if (slug) {
        const org = await registry.getOrganizationBySlug(slug);
        if (!org) {
          throw new Error(`Organization not found for slug ${slug}`);
        }
        await runTenantMigrations(org.dbConnectionString);
        console.log(`✓ Migrated ${org.slug}`);
        return;
      }

      for (const org of orgs) {
        await runTenantMigrations(org.dbConnectionString);
        console.log(`✓ Migrated ${org.slug}`);
      }
      return;
    }

    if (command === "user:reset-password") {
      const orgSlug = requireOption(options, "org");
      const username = requireOption(options, "username");
      const password = requireOption(options, "password");
      const org = await registry.getOrganizationBySlug(orgSlug);
      if (!org) {
        throw new Error(`Organization not found for slug ${orgSlug}`);
      }
      const user = await registry.getOrgUserByUsername(org.id, username);
      if (!user) {
        throw new Error(`User not found for ${username} in ${orgSlug}`);
      }
      const passwordHash = await hashPassword(password);
      await registry.updateOrgUser(user.id, { passwordHash });
      console.log(`✓ Password reset for ${username} (${orgSlug})`);
      return;
    }

    if (command === "user:unlock") {
      const orgSlug = requireOption(options, "org");
      const username = requireOption(options, "username");
      const org = await registry.getOrganizationBySlug(orgSlug);
      if (!org) {
        throw new Error(`Organization not found for slug ${orgSlug}`);
      }
      const user = await registry.getOrgUserByUsername(org.id, username);
      if (!user) {
        throw new Error(`User not found for ${username} in ${orgSlug}`);
      }
      await registry.updateOrgUser(user.id, { status: "ACTIVE", failedAttempts: 0, lockedUntil: null });
      console.log(`✓ Unlocked ${username} (${orgSlug})`);
      return;
    }

    if (command === "user:revoke-sessions") {
      const orgSlug = requireOption(options, "org");
      const username = requireOption(options, "username");
      const org = await registry.getOrganizationBySlug(orgSlug);
      if (!org) {
        throw new Error(`Organization not found for slug ${orgSlug}`);
      }
      const user = await registry.getOrgUserByUsername(org.id, username);
      if (!user) {
        throw new Error(`User not found for ${username} in ${orgSlug}`);
      }
      const count = await registry.deleteOrgSessionsForUser(user.id);
      console.log(`✓ Revoked ${count} session(s) for ${username} (${orgSlug})`);
      return;
    }

    if (command === "org:revoke-sessions") {
      const orgSlug = requireOption(options, "slug");
      const org = await registry.getOrganizationBySlug(orgSlug);
      if (!org) {
        throw new Error(`Organization not found for slug ${orgSlug}`);
      }
      const count = await registry.deleteOrgSessionsForOrg(org.id);
      console.log(`✓ Revoked ${count} session(s) for ${orgSlug}`);
      return;
    }

    printUsage();
    process.exitCode = 1;
  } finally {
    await registry.disconnect();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

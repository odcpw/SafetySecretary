import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL", "REGISTRY_DATABASE_URL"];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[config] ${key} is not set; using placeholder. Set it in your .env file.`);
  }
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/safetysecretary",
  registryDatabaseUrl:
    process.env.REGISTRY_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/safetysecretary_registry",
  openAiKey: process.env.OPENAI_API_KEY,
  attachmentsDir: process.env.SAFETYSECRETARY_ATTACHMENTS_DIR ?? "artifacts/attachments",
  attachmentMaxBytes: Number(process.env.SAFETYSECRETARY_ATTACHMENT_MAX_BYTES) || 15 * 1024 * 1024,
  sessionCookieName: process.env.SAFETYSECRETARY_SESSION_COOKIE ?? "ss_session",
  adminSessionCookieName: process.env.SAFETYSECRETARY_ADMIN_COOKIE ?? "ss_admin_session",
  sessionTtlHours: Number(process.env.SAFETYSECRETARY_SESSION_TTL_HOURS) || 8,
  rememberSessionDays: Number(process.env.SAFETYSECRETARY_SESSION_REMEMBER_DAYS) || 10,
  postgresAdminUrl: process.env.POSTGRES_ADMIN_URL,
  nodeEnv: process.env.NODE_ENV ?? "development",
  adminBootstrapToken: process.env.SAFETYSECRETARY_ADMIN_BOOTSTRAP_TOKEN,
  allowedOrigins: (process.env.SAFETYSECRETARY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  cookieSameSite: (() => {
    const value = (process.env.SAFETYSECRETARY_COOKIE_SAMESITE ?? "lax").toLowerCase();
    if (value === "strict" || value === "none" || value === "lax") {
      return value;
    }
    return "lax";
  })(),
  cookieSecure:
    process.env.SAFETYSECRETARY_COOKIE_SECURE !== undefined
      ? process.env.SAFETYSECRETARY_COOKIE_SECURE === "true"
      : (process.env.NODE_ENV ?? "development") === "production"
};

const demoLoginFlag = process.env.SAFETYSECRETARY_DEMO_LOGIN_ENABLED === "true";
const demoOrgSlug = process.env.SAFETYSECRETARY_DEMO_ORG_SLUG?.trim() || null;
const demoOrgName = process.env.SAFETYSECRETARY_DEMO_ORG_NAME?.trim() || null;
const demoDbUrl = process.env.SAFETYSECRETARY_DEMO_DB_URL?.trim() || null;
const demoStorageRoot = process.env.SAFETYSECRETARY_DEMO_STORAGE_ROOT?.trim() || null;
const demoUserUsername = process.env.SAFETYSECRETARY_DEMO_USER_USERNAME?.trim() || null;
const demoUserEmail = process.env.SAFETYSECRETARY_DEMO_USER_EMAIL?.trim() || null;

const demoConfigComplete = Boolean(
  demoOrgSlug && demoOrgName && demoDbUrl && demoStorageRoot && demoUserUsername && demoUserEmail
);

if (demoLoginFlag && !demoConfigComplete) {
  console.warn("[config] Demo login enabled but missing required demo env vars; demo login is disabled.");
}

export const demoConfig = {
  enabled: demoLoginFlag && demoConfigComplete,
  configured: demoLoginFlag,
  orgSlug: demoOrgSlug,
  orgName: demoOrgName,
  dbUrl: demoDbUrl,
  storageRoot: demoStorageRoot,
  userUsername: demoUserUsername,
  userEmail: demoUserEmail
};

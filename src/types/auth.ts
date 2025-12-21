import type { OrgRole } from "../../prisma/generated/registry";

export type OrgAuthContext = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgRole: OrgRole;
  userId: string;
  username: string;
  email: string;
  locale: string;
  storageRoot: string;
  dbConnectionString: string;
  encryptionKeyRef?: string | null;
  isDemo?: boolean;
};

export type PlatformAuthContext = {
  adminId: string;
  username: string;
  email: string;
};

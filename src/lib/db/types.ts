export type SupportedLanguage = "de" | "en" | "fr" | "it";

export type TenantRecord = {
  id: string;
  name: string;
  defaultLanguage: SupportedLanguage;
  createdAt: Date;
  deletedAt: Date | null;
};

export type UserRecord = {
  id: string;
  email: string;
  uiLocale: SupportedLanguage | null;
  createdAt: Date;
};

export type TenantMembershipRecord = {
  id: string;
  tenantId: string;
  userId: string;
  createdAt: Date;
};

export type InvitationRecord = {
  id: string;
  tenantId: string;
  recipientEmail: string;
  tokenHash: Uint8Array;
  expiresAt: Date;
  consumedAt: Date | null;
  createdBy: string;
};

export type MagicLinkTokenRecord = {
  id: string;
  email: string;
  tokenHash: Uint8Array;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tenantId: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
  deviceHint: string | null;
};

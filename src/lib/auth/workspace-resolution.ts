import type { Language, Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
	type DbExecutor,
	prisma as defaultPrisma,
	provisionTenantSchema as defaultProvisionTenantSchema,
} from "../db";
import { type WorkspaceKind, classifyEmailWorkspace } from "./email-domain";

export type ResolvedWorkspace = {
	email: string;
	userId: string;
	tenantId: string;
	workspaceKind: WorkspaceKind;
	domain: string;
	createdTenant: boolean;
};

export type ResolveWorkspaceInput = {
	email: string;
	defaultLanguage?: Language;
};

export type WorkspaceProvisionTenantSchema = (
	tenantId: string,
	client: DbExecutor,
) => Promise<unknown>;

export type ResolveWorkspaceOptions = {
	prisma?: PrismaClient;
	provisionTenantSchema?: WorkspaceProvisionTenantSchema;
	transactionOptions?: ResolveWorkspaceTransactionOptions;
};

type ResolveWorkspaceTransactionOptions = {
	isolationLevel?: Prisma.TransactionIsolationLevel;
	maxWait?: number;
	timeout?: number;
};

type WorkspaceTransactionClient = Prisma.TransactionClient;

export class WorkspaceResolutionError extends Error {
	readonly code = "INVALID_EMAIL";

	constructor() {
		super("Workspace resolution requires a valid email address.");
		this.name = "WorkspaceResolutionError";
	}
}

const MAX_RESOLUTION_ATTEMPTS = 2;
const DEFAULT_WORKSPACE_LANGUAGE = "en" satisfies Language;

export async function resolveOrCreateWorkspaceForEmail(
	input: ResolveWorkspaceInput,
	options: ResolveWorkspaceOptions = {},
): Promise<ResolvedWorkspace> {
	const classification = classifyEmailWorkspace(input.email);

	if (!classification.ok) {
		throw new WorkspaceResolutionError();
	}

	const db = options.prisma ?? defaultPrisma;
	const provisionTenantSchema =
		options.provisionTenantSchema ?? defaultProvisionTenantSchema;
	const defaultLanguage = input.defaultLanguage ?? DEFAULT_WORKSPACE_LANGUAGE;

	for (let attempt = 1; attempt <= MAX_RESOLUTION_ATTEMPTS; attempt += 1) {
		try {
			return await db.$transaction(
				async (tx) => {
					const user = await tx.user.upsert({
						where: { email: classification.email },
						update: {},
						create: { email: classification.email },
					});

					if (classification.workspaceKind === "personal") {
						return resolvePersonalWorkspace({
							defaultLanguage,
							domain: classification.domain,
							email: classification.email,
							provisionTenantSchema,
							tx,
							userId: user.id,
						});
					}

					return resolveCompanyWorkspace({
						defaultLanguage,
						domain: classification.domain,
						email: classification.email,
						provisionTenantSchema,
						tx,
						userId: user.id,
					});
				},
				{
					timeout: 15_000,
					...options.transactionOptions,
				},
			);
		} catch (error) {
			if (attempt < MAX_RESOLUTION_ATTEMPTS && isUniqueConflict(error)) {
				continue;
			}

			throw error;
		}
	}

	throw new Error("Workspace resolution retry budget exhausted.");
}

async function resolvePersonalWorkspace(input: {
	defaultLanguage: Language;
	domain: string;
	email: string;
	provisionTenantSchema: WorkspaceProvisionTenantSchema;
	tx: WorkspaceTransactionClient;
	userId: string;
}): Promise<ResolvedWorkspace> {
	const existingTenant = await input.tx.tenant.findFirst({
		where: {
			createdByUserId: input.userId,
			workspaceKind: "personal",
		},
		select: { id: true },
	});

	if (existingTenant) {
		await ensureMembership(input.tx, existingTenant.id, input.userId);
		return {
			email: input.email,
			userId: input.userId,
			tenantId: existingTenant.id,
			workspaceKind: "personal",
			domain: input.domain,
			createdTenant: false,
		};
	}

	const tenant = await input.tx.tenant.create({
		data: {
			name: input.email,
			defaultLanguage: input.defaultLanguage,
			workspaceKind: "personal",
			createdByUserId: input.userId,
		},
	});

	await input.provisionTenantSchema(tenant.id, input.tx);
	await ensureMembership(input.tx, tenant.id, input.userId);

	return {
		email: input.email,
		userId: input.userId,
		tenantId: tenant.id,
		workspaceKind: "personal",
		domain: input.domain,
		createdTenant: true,
	};
}

async function resolveCompanyWorkspace(input: {
	defaultLanguage: Language;
	domain: string;
	email: string;
	provisionTenantSchema: WorkspaceProvisionTenantSchema;
	tx: WorkspaceTransactionClient;
	userId: string;
}): Promise<ResolvedWorkspace> {
	const existingDomain = await input.tx.tenantDomain.findUnique({
		where: { domain: input.domain },
		select: { tenantId: true },
	});

	if (existingDomain) {
		await ensureMembership(input.tx, existingDomain.tenantId, input.userId);
		return {
			email: input.email,
			userId: input.userId,
			tenantId: existingDomain.tenantId,
			workspaceKind: "company",
			domain: input.domain,
			createdTenant: false,
		};
	}

	const tenant = await input.tx.tenant.create({
		data: {
			name: input.domain,
			defaultLanguage: input.defaultLanguage,
			workspaceKind: "company",
			createdByUserId: input.userId,
		},
	});

	await input.provisionTenantSchema(tenant.id, input.tx);
	await input.tx.tenantDomain.create({
		data: {
			id: randomUUID(),
			tenantId: tenant.id,
			domain: input.domain,
		},
	});
	await ensureMembership(input.tx, tenant.id, input.userId);

	return {
		email: input.email,
		userId: input.userId,
		tenantId: tenant.id,
		workspaceKind: "company",
		domain: input.domain,
		createdTenant: true,
	};
}

async function ensureMembership(
	tx: WorkspaceTransactionClient,
	tenantId: string,
	userId: string,
): Promise<void> {
	await tx.tenantMembership.upsert({
		where: {
			tenantId_userId: {
				tenantId,
				userId,
			},
		},
		update: {},
		create: {
			tenantId,
			userId,
		},
	});
}

function isUniqueConflict(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "P2002"
	);
}

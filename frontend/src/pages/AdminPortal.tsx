import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useI18n } from "@/i18n/I18nContext";

type AdminOrg = {
  id: string;
  slug: string;
  name: string;
  status: string;
  dbConnectionString: string;
  storageRoot: string;
  encryptionKeyRef?: string | null;
};

type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  failedAttempts: number;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
};

const maskConnectionString = (value: string) => {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "****";
    }
    return url.toString();
  } catch {
    return value;
  }
};

export const AdminPortal = () => {
  const { t, formatDate, formatDateTime } = useI18n();
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [orgForm, setOrgForm] = useState({
    slug: "",
    name: "",
    storageRoot: "",
    dbConnectionString: ""
  });
  const [orgStatus, setOrgStatus] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({
    orgId: "",
    username: "",
    email: "",
    password: "",
    role: "ADMIN"
  });
  const [userStatus, setUserStatus] = useState<string | null>(null);

  const selectedOrg = useMemo(
    () => orgs.find((org) => org.id === selectedOrgId) ?? null,
    [orgs, selectedOrgId]
  );

  const loadOrgs = async () => {
    setOrgsLoading(true);
    setOrgsError(null);
    try {
      const response = await fetch("/api/admin/orgs", { credentials: "include" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as { orgs: AdminOrg[] };
      setOrgs(payload.orgs ?? []);
      if (!selectedOrgId && payload.orgs?.length) {
        setSelectedOrgId(payload.orgs[0]!.id);
      }
    } catch (err) {
      setOrgsError(err instanceof Error ? err.message : t("admin.errors.loadOrgs"));
    } finally {
      setOrgsLoading(false);
    }
  };

  const loadUsers = async (orgId: string) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await fetch(`/api/admin/orgs/${orgId}/users`, { credentials: "include" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as { users: AdminUser[] };
      setUsers(payload.users ?? []);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : t("admin.errors.loadUsers"));
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    void loadOrgs();
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      void loadUsers(selectedOrgId);
      setUserForm((prev) => ({ ...prev, orgId: selectedOrgId }));
    }
  }, [selectedOrgId]);

  const handleCreateOrg = async (event: React.FormEvent) => {
    event.preventDefault();
    setOrgStatus(t("admin.status.provisioningOrg"));
    try {
      const response = await fetch("/api/admin/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          slug: orgForm.slug.trim(),
          name: orgForm.name.trim(),
          storageRoot: orgForm.storageRoot.trim() || undefined,
          dbConnectionString: orgForm.dbConnectionString.trim() || undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("admin.errors.provisionOrg"));
      }
      setOrgForm({ slug: "", name: "", storageRoot: "", dbConnectionString: "" });
      setOrgStatus(t("admin.status.orgCreated"));
      await loadOrgs();
    } catch (err) {
      setOrgStatus(err instanceof Error ? err.message : t("admin.errors.provisionOrg"));
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userForm.orgId) {
      setUserStatus(t("admin.errors.selectOrg"));
      return;
    }
    setUserStatus(t("admin.status.creatingUser"));
    try {
      const response = await fetch(`/api/admin/orgs/${userForm.orgId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: userForm.username.trim(),
          email: userForm.email.trim(),
          password: userForm.password,
          role: userForm.role
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("admin.errors.createUser"));
      }
      setUserForm((prev) => ({ ...prev, username: "", email: "", password: "" }));
      setUserStatus(t("admin.status.userCreated"));
      await loadUsers(userForm.orgId);
    } catch (err) {
      setUserStatus(err instanceof Error ? err.message : t("admin.errors.createUser"));
    }
  };

  const handleUserPatch = async (userId: string, patch: Partial<AdminUser>) => {
    if (!selectedOrgId) return;
    setUserStatus(t("admin.status.updatingUser"));
    try {
      const response = await fetch(`/api/admin/orgs/${selectedOrgId}/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("admin.errors.updateUser"));
      }
      setUserStatus(t("admin.status.userUpdated"));
      await loadUsers(selectedOrgId);
    } catch (err) {
      setUserStatus(err instanceof Error ? err.message : t("admin.errors.updateUser"));
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!selectedOrgId) return;
    const nextPassword = window.prompt(t("admin.prompts.resetPassword"));
    if (!nextPassword) return;
    setUserStatus(t("admin.status.resettingPassword"));
    try {
      const response = await fetch(`/api/admin/orgs/${selectedOrgId}/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: nextPassword })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("admin.errors.resetPassword"));
      }
      setUserStatus(t("admin.status.passwordReset"));
    } catch (err) {
      setUserStatus(err instanceof Error ? err.message : t("admin.errors.resetPassword"));
    }
  };

  const handleUnlock = async (userId: string) => {
    if (!selectedOrgId) return;
    setUserStatus(t("admin.status.unlockingUser"));
    try {
      const response = await fetch(`/api/admin/orgs/${selectedOrgId}/users/${userId}/unlock`, {
        method: "POST",
        credentials: "include"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("admin.errors.unlockUser"));
      }
      setUserStatus(t("admin.status.userUnlocked"));
      await loadUsers(selectedOrgId);
    } catch (err) {
      setUserStatus(err instanceof Error ? err.message : t("admin.errors.unlockUser"));
    }
  };

  const handleRevokeUserSessions = async (userId: string) => {
    if (!selectedOrgId) return;
    if (!window.confirm(t("admin.prompts.revokeUserSessions"))) {
      return;
    }
    setUserStatus(t("admin.status.revokingSessions"));
    try {
      const response = await fetch(`/api/admin/orgs/${selectedOrgId}/users/${userId}/revoke-sessions`, {
        method: "POST",
        credentials: "include"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("admin.errors.revokeSessions"));
      }
      setUserStatus(
        t("admin.status.sessionsRevoked", { values: { count: payload.revoked ?? 0 } })
      );
    } catch (err) {
      setUserStatus(err instanceof Error ? err.message : t("admin.errors.revokeSessions"));
    }
  };

  const handleRevokeOrgSessions = async () => {
    if (!selectedOrgId) return;
    if (!window.confirm(t("admin.prompts.revokeOrgSessions"))) {
      return;
    }
    setUserStatus(t("admin.status.revokingOrgSessions"));
    try {
      const response = await fetch(`/api/admin/orgs/${selectedOrgId}/revoke-sessions`, {
        method: "POST",
        credentials: "include"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("admin.errors.revokeOrgSessions"));
      }
      setUserStatus(
        t("admin.status.orgSessionsRevoked", { values: { count: payload.revoked ?? 0 } })
      );
    } catch (err) {
      setUserStatus(err instanceof Error ? err.message : t("admin.errors.revokeOrgSessions"));
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/admin/login";
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <div className="workspace-topbar__summary">
          <p className="text-label">{t("admin.platformLabel")}</p>
          <h1>{t("admin.title")}</h1>
          <p>{t("admin.subtitle")}</p>
        </div>
        <div className="workspace-topbar__actions">
          <ThemeToggle />
          <button type="button" className="btn-outline" onClick={handleLogout}>
            {t("common.signOut")}
          </button>
        </div>
      </header>

      <main className="workspace-main">
        <div className="workspace-main__inner admin-grid">
          <section className="app-panel admin-panel">
            <h2>{t("admin.organizations")}</h2>
            {orgsLoading && <p className="text-muted">{t("admin.loadingOrgs")}</p>}
            {orgsError && <p className="text-error">{orgsError}</p>}
            {!orgsLoading && orgs.length === 0 && (
              <p className="text-muted">{t("admin.emptyOrgs")}</p>
            )}
            {orgs.length > 0 && (
              <div className="admin-orgs">
                <label>
                  {t("admin.selectOrg")}
                  <select
                    value={selectedOrgId ?? ""}
                    onChange={(event) => setSelectedOrgId(event.target.value)}
                  >
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.slug})
                      </option>
                    ))}
                  </select>
                </label>

                {selectedOrg && (
                  <div className="admin-org-meta">
                    <div>
                      <span className="text-muted">{t("admin.statusLabel")}</span>
                      <strong>{selectedOrg.status}</strong>
                    </div>
                    <div>
                      <span className="text-muted">{t("admin.storageRoot")}</span>
                      <code>{selectedOrg.storageRoot}</code>
                    </div>
                    <div>
                      <span className="text-muted">{t("admin.dbConnection")}</span>
                      <code>{maskConnectionString(selectedOrg.dbConnectionString)}</code>
                    </div>
                    <div className="admin-actions-cell">
                      <button type="button" className="btn-outline" onClick={handleRevokeOrgSessions}>
                        {t("admin.revokeOrgSessions")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form className="admin-form" onSubmit={handleCreateOrg}>
              <h3>{t("admin.provisionOrg")}</h3>
              <label>
                {t("admin.slug")}
                <input
                  value={orgForm.slug}
                  onChange={(event) => setOrgForm((prev) => ({ ...prev, slug: event.target.value }))}
                  placeholder={t("admin.placeholders.slug")}
                  required
                />
              </label>
              <label>
                {t("admin.name")}
                <input
                  value={orgForm.name}
                  onChange={(event) => setOrgForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder={t("admin.placeholders.name")}
                  required
                />
              </label>
              <label>
                {t("admin.storageRootLabel")}
                <input
                  value={orgForm.storageRoot}
                  onChange={(event) => setOrgForm((prev) => ({ ...prev, storageRoot: event.target.value }))}
                  placeholder={t("admin.placeholders.storageRoot")}
                />
              </label>
              <label>
                {t("admin.dbConnectionLabel")}
                <input
                  value={orgForm.dbConnectionString}
                  onChange={(event) => setOrgForm((prev) => ({ ...prev, dbConnectionString: event.target.value }))}
                  placeholder={t("admin.placeholders.dbConnection")}
                />
              </label>
              {orgStatus && <p className="text-muted">{orgStatus}</p>}
              <button type="submit">{t("admin.createOrg")}</button>
            </form>
          </section>

          <section className="app-panel admin-panel">
            <h2>{t("admin.users")}</h2>
            {usersLoading && <p className="text-muted">{t("admin.loadingUsers")}</p>}
            {usersError && <p className="text-error">{usersError}</p>}

            {selectedOrgId && users.length > 0 && (
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("admin.userTable.user")}</th>
                      <th>{t("admin.role")}</th>
                      <th>{t("admin.statusLabel")}</th>
                      <th>{t("admin.userTable.lockout")}</th>
                      <th>{t("admin.userTable.lastLogin")}</th>
                      <th>{t("admin.userTable.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.username}</strong>
                          <div className="text-muted">{user.email}</div>
                        </td>
                        <td>
                          <select
                            value={user.role}
                            onChange={(event) => handleUserPatch(user.id, { role: event.target.value })}
                          >
                            <option value="OWNER">{t("admin.roles.owner")}</option>
                            <option value="ADMIN">{t("admin.roles.admin")}</option>
                            <option value="MEMBER">{t("admin.roles.member")}</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={user.status}
                            onChange={(event) => handleUserPatch(user.id, { status: event.target.value })}
                          >
                            <option value="ACTIVE">{t("admin.userStatus.active")}</option>
                            <option value="LOCKED">{t("admin.userStatus.locked")}</option>
                            <option value="DISABLED">{t("admin.userStatus.disabled")}</option>
                          </select>
                        </td>
                        <td>
                          {user.lockedUntil ? formatDateTime(user.lockedUntil) : t("common.noData")}
                        </td>
                        <td>
                          {user.lastLoginAt ? formatDate(user.lastLoginAt) : t("common.noData")}
                        </td>
                        <td className="admin-actions-cell">
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => handleResetPassword(user.id)}
                          >
                            {t("admin.resetPassword")}
                          </button>
                          <button
                            type="button"
                            className="btn-outline"
                            disabled={user.status !== "LOCKED" && !user.lockedUntil}
                            onClick={() => handleUnlock(user.id)}
                          >
                            {t("admin.unlock")}
                          </button>
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => handleRevokeUserSessions(user.id)}
                          >
                            {t("admin.revokeSessions")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedOrgId && users.length === 0 && !usersLoading && (
              <p className="text-muted">{t("admin.emptyUsers")}</p>
            )}

            <form className="admin-form" onSubmit={handleCreateUser}>
              <h3>{t("admin.createUser")}</h3>
              <label>
                {t("admin.userForm.organization")}
                <select
                  value={userForm.orgId}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, orgId: event.target.value }))}
                >
                  <option value="">{t("admin.userForm.selectOrg")}</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("admin.userForm.username")}
                <input
                  value={userForm.username}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder={t("admin.placeholders.username")}
                  required
                />
              </label>
              <label>
                {t("admin.userForm.email")}
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder={t("admin.placeholders.email")}
                  required
                />
              </label>
              <label>
                {t("admin.role")}
                <select
                  value={userForm.role}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}
                >
                  <option value="OWNER">{t("admin.roles.owner")}</option>
                  <option value="ADMIN">{t("admin.roles.admin")}</option>
                  <option value="MEMBER">{t("admin.roles.member")}</option>
                </select>
              </label>
              <label>
                {t("admin.userForm.password")}
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </label>
              {userStatus && <p className="text-muted">{userStatus}</p>}
              <button type="submit">{t("admin.createUser")}</button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
};

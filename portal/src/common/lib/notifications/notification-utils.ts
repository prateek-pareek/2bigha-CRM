export type AppNotification = {
  _id: string;
  title: string;
  message: string;
  type?: string;
  isRead?: boolean;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type NotificationProduct = "crm" | "hrms" | "pm" | "auto";

export function productFromPathname(pathname: string): NotificationProduct {
  if (pathname.startsWith("/crm")) return "crm";
  if (pathname.startsWith("/pm")) return "pm";
  if (pathname.startsWith("/hrms")) return "hrms";
  return "auto";
}

function normalizeAppLink(link: unknown): string | null {
  const raw = String(link || "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function pickObjectId(...values: unknown[]): string {
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (/^[a-f0-9]{24}$/i.test(id)) return id;
  }
  return "";
}

export function isCrmNotification(notification: AppNotification): boolean {
  if (isPmNotification(notification)) return false;

  const type = String(notification?.type || "").toLowerCase();
  const metadata = notification?.metadata || {};
  const module = String(metadata.module || "").toLowerCase();

  if (metadata.inboxEmailId) return true;
  if (type.startsWith("crm_")) return true;
  if (type === "reminder") return true;
  if (
    [
      "leads",
      "contacts",
      "clients",
      "organizations",
      "inbox",
    ].includes(module)
  ) {
    return true;
  }
  const relatedType = String(metadata.relatedType || "").toLowerCase();
  if (
    [
      "lead",
      "contact",
      "client",
      "organization",
    ].includes(relatedType)
  ) {
    return true;
  }
  const link = normalizeAppLink(metadata.link);
  if (link?.startsWith("/crm")) return true;
  return false;
}

export function isPmNotification(notification: AppNotification): boolean {
  const metadata = notification?.metadata || {};
  const link = normalizeAppLink(metadata.link);
  if (link?.startsWith("/pm/")) return true;
  if (
    metadata.projectId ||
    metadata.issueId ||
    metadata.issueKey ||
    metadata.pageId ||
    metadata.spaceId
  ) {
    return true;
  }
  const type = String(notification?.type || "").toLowerCase();
  if (
    (type === "primary" || type === "warning" || type === "info") &&
    link?.includes("/pm/")
  ) {
    return true;
  }
  return false;
}

export function isHrmsNotification(notification: AppNotification): boolean {
  if (isCrmNotification(notification) || isPmNotification(notification)) {
    return false;
  }
  const type = String(notification?.type || "").toLowerCase();
  const metadata = notification?.metadata || {};
  const title = String(notification?.title || "").toLowerCase();
  const message = String(notification?.message || "").toLowerCase();

  if (
    metadata.leaveId ||
    metadata.expenseId ||
    metadata.employeeId ||
    metadata.policyId ||
    metadata.sopId
  ) {
    return true;
  }

  return [
    "announcement",
    "leave",
    "policy",
    "sop",
    "payroll",
    "expense",
    "info",
    "success",
    "warning",
    "danger",
    "force_logout",
  ].includes(type) ||
    title.includes("account") ||
    title.includes("profile") ||
    title.includes("access") ||
    message.includes("account") ||
    message.includes("profile") ||
    message.includes("access");
}

function resolveCrmEntityPath(metadata: Record<string, unknown>): string | null {
  const entityId = pickObjectId(
    metadata.entityId,
    metadata.recordId,
    metadata.relatedTo,
    metadata.leadId,
    metadata.contactId,
    metadata.clientId,
    metadata.organizationId,
  );
  if (!entityId) return null;

  const module = String(metadata.module || "").toLowerCase();
  const relatedType = String(metadata.relatedType || "").toLowerCase();

  if (module === "leads" || relatedType === "lead") {
    return `/crm/leads/${entityId}`;
  }
  if (module === "contacts" || relatedType === "contact") {
    return `/crm/contacts/${entityId}`;
  }
  if (module === "clients" || relatedType === "client") {
    return `/crm/clients/${entityId}`;
  }
  if (module === "organizations" || relatedType === "organization") {
    return `/crm/organizations/${entityId}`;
  }

  return null;
}

function resolvePmPath(metadata: Record<string, unknown>): string | null {
  const direct = normalizeAppLink(metadata.link);
  if (direct?.startsWith("/pm/")) return direct;

  const projectId = pickObjectId(metadata.projectId, metadata.project);
  const issueId = pickObjectId(metadata.issueId);
  const issueKey = String(metadata.issueKey || metadata.sourceIssueKey || "").trim();
  const pageId = pickObjectId(metadata.pageId);
  const spaceId = pickObjectId(metadata.spaceId, metadata.space);

  if (projectId && issueKey) {
    return `/pm/projects/${projectId}/board?selectedIssue=${encodeURIComponent(issueKey)}`;
  }
  if (projectId && issueId) {
    return `/pm/projects/${projectId}/board?issue=${issueId}`;
  }
  if (projectId) {
    return `/pm/projects/${projectId}/board`;
  }
  if (pageId && spaceId) {
    return `/pm/wiki/${spaceId}/${pageId}`;
  }
  if (pageId) {
    return `/pm/wiki`;
  }

  return null;
}

function resolveHrmsPath(metadata: Record<string, unknown>): string | null {
  const direct = normalizeAppLink(metadata.link);
  if (direct?.startsWith("/hrms/")) return direct;

  const leaveId = pickObjectId(metadata.leaveId);
  if (leaveId) return `/hrms/leaves/${leaveId}`;

  const expenseId = pickObjectId(metadata.expenseId);
  if (expenseId) return `/hrms/expenses/${expenseId}`;

  const employeeId = pickObjectId(metadata.employeeId);
  if (employeeId) return `/hrms/employees/${employeeId}`;

  if (metadata.policyId) return "/hrms/policies";
  if (metadata.sopId) return "/hrms/sops";

  return null;
}

export function resolveNotificationLink(
  notification: AppNotification,
  context: NotificationProduct = "auto",
): string {
  const metadata = notification?.metadata || {};
  const type = String(notification?.type || "").toLowerCase();

  const explicit = normalizeAppLink(metadata.link);
  if (explicit) return explicit;

  const crmPath = resolveCrmEntityPath(metadata);
  if (crmPath) return crmPath;

  const pmPath = resolvePmPath(metadata);
  if (pmPath) return pmPath;

  const hrmsPath = resolveHrmsPath(metadata);
  if (hrmsPath) return hrmsPath;

  if (metadata.inboxEmailId) return "/crm/inbox";

  if (type.startsWith("crm_")) return "/crm/inbox";
  if (type === "reminder") return "/crm/tasks";

  if (type === "announcement") return "/hrms/announcements";
  if (type === "leave") return "/hrms/leaves";
  if (type === "policy") return "/hrms/policies";
  if (type === "sop") return "/hrms/sops";
  if (type === "payroll") return "/hrms/payroll";

  const title = String(notification?.title || "").toLowerCase();
  const message = String(notification?.message || "").toLowerCase();
  if (
    [
      "info",
      "success",
      "warning",
      "danger",
      "force_logout",
    ].includes(type) ||
    title.includes("account") ||
    title.includes("profile") ||
    title.includes("access") ||
    message.includes("account") ||
    message.includes("profile") ||
    message.includes("access")
  ) {
    return "/hrms/employees";
  }

  if (context === "crm") return "/crm/workspace";
  if (context === "pm") return "/pm/boards";
  if (context === "hrms") return "/hrms/notifications";

  if (isPmNotification(notification)) return "/pm/boards";
  if (isCrmNotification(notification)) return "/crm/workspace";
  return "/hrms/notifications";
}

/** Navigate to the best target for a notification (shared by all portals). */
export function navigateToNotification(
  router: { push: (href: string) => void },
  notification: AppNotification,
  context: NotificationProduct = "auto",
): string {
  const href = resolveNotificationLink(notification, context);
  router.push(href);
  return href;
}

export function notificationTypeLabel(type?: string): string {
  const raw = String(type || "Info");
  if (raw.startsWith("CRM_")) {
    return raw
      .slice(4)
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return raw;
}

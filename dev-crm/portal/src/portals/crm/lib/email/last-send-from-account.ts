const LAST_SEND_FROM_ACCOUNT_KEY = "crm:last-send-from-account-id";

/** Last From mailbox chosen in the CRM email composer (lead/contact/deal/inbox). */
export function getLastSendFromAccountId(): string {
  if (typeof window === "undefined") return "";
  try {
    return String(localStorage.getItem(LAST_SEND_FROM_ACCOUNT_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setLastSendFromAccountId(accountId: string): void {
  const id = String(accountId || "").trim();
  if (!id || typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_SEND_FROM_ACCOUNT_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}

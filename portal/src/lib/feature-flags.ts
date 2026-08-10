/**
 * Quick Chat (floating widget + HR admin tools) — off unless explicitly enabled.
 * Set `NEXT_PUBLIC_ENABLE_QUICK_CHAT=true` in the portal env to turn it back on.
 */
export function isQuickChatEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_QUICK_CHAT === "true";
}

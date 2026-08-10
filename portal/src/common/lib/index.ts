/**
 * Suite shared surface — auth, shell helpers, and cross-product utilities.
 * Product apps (CRM / HRMS / PM) should depend on this, not on each other.
 *
 * See SEPARATION.md in this folder.
 */

export * from "./auth";
export * from "./rich-text";
export { default as suiteApi } from "./api";

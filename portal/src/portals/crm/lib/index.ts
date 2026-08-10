/**
 * CRM public surface — prefer these imports when building CRM UI / API clients.
 *
 * Future extract checklist: see SEPARATION.md in this folder.
 */

export * from "./ui";
export * from "./chrome";
export * from "./shell";
export { CRM_API_URL } from "./config";
export { default as crmApi, getCrmAuthToken } from "./api";
export { fetchCrmPipelines } from "./shared/pipelines-api";

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const API_HOST_URL = BASE;
export const API_BASE_URL = `${BASE}/api`;
export const CRM_API_URL =
  process.env.NEXT_PUBLIC_CRM_API_URL || `${BASE}/api`;

/** Legacy aliases — all point to the CRM API in this repo. */
export const HRMS_API_URL = CRM_API_URL;
export const PM_API_URL = CRM_API_URL;

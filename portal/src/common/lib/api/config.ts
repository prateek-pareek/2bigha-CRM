const BASE = process.env.NEXT_PUBLIC_API_URL || 'https://democrm.mathionix.tech';

export const API_HOST_URL = BASE;
export const API_BASE_URL = `${BASE}/api`;
export const CRM_API_URL = process.env.NEXT_PUBLIC_CRM_API_URL || `${BASE}/api`;
export const PM_API_URL = process.env.NEXT_PUBLIC_PM_API_URL || `${BASE}/api`;
export const HRMS_API_URL = process.env.NEXT_PUBLIC_HRMS_API_URL || `${BASE}/api`;

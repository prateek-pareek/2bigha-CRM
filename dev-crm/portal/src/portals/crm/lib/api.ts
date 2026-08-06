import axios from "axios";
import { CRM_API_URL } from '@/lib/crm/config';

/** Same resolution as CRM axios interceptor — raw fetch callers must use this too. */
export function getCrmAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("crm_token") ||
    localStorage.getItem("pm_token")
  );
}

const api = axios.create({
  baseURL: CRM_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getCrmAuthToken();
    
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('CRM API 401 Unauthorized:', error.config?.url);
      
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        const isAuthPage = currentPath.startsWith("/auth/login") || currentPath === "/login";

        if (!isAuthPage) {
          console.warn('Wiping session and redirecting to login from:', currentPath);
          
          // Clear localStorage
          localStorage.removeItem("token");
          localStorage.removeItem("crm_token");
          localStorage.removeItem("user");
          
          // Clear Cookies
          if (typeof document !== 'undefined') {
             document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
             document.cookie = "crm_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
             document.cookie = "hrms_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          }

          const currentUrl = window.location.href;
          if (!currentUrl.includes('error=unauthorized')) {
             window.location.href = "/auth/login?error=unauthorized&from=" + encodeURIComponent(currentPath);
          }
        } else {
           console.log('401 detected but already on auth page. Skipping redirect loop.');
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

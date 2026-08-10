import axios from "axios";
import { API_BASE_URL } from "@/lib/api/config";

/**
 * Suite-wide authenticated axios client (shared auth / master API).
 * Product-specific clients: `@/lib/crm/api`, `@/lib/hrms/api`, `@/lib/pm/api`.
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("pm_token") ||
    localStorage.getItem("crm_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn("Suite API 401 Unauthorized:", error.config?.url);

      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        const isAuthPage =
          currentPath.startsWith("/auth/login") || currentPath === "/login";
        const isPublicPage =
          currentPath.startsWith("/career-portal") ||
          /^\/portal\/[^/]+\/?$/.test(currentPath);

        if (!isAuthPage && !isPublicPage) {
          console.warn("Wiping session and redirecting to login from:", currentPath);

          localStorage.removeItem("token");
          localStorage.removeItem("user");

          if (typeof document !== "undefined") {
            document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            document.cookie = "hrms_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            document.cookie = "pm_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          }

          const currentUrl = window.location.href;
          if (!currentUrl.includes("error=unauthorized")) {
            window.location.href =
              "/auth/login?error=unauthorized&from=" + encodeURIComponent(currentPath);
          }
        } else {
          console.log("401 detected but already on auth page. Skipping redirect loop.");
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;

export type BrowserTabBrand =
  | "default"
  | "crm"
  | "hrms"
  | "pm"
  | "social"
  | "vault"
  | "portal";

const ICON_PATH: Record<BrowserTabBrand, string> = {
  default: "/brand/2bigha-logo.png",
  crm: "/favicons/crm.svg",
  hrms: "/favicons/hrms.svg",
  pm: "/favicons/pm.svg",
  social: "/favicons/social.svg",
  vault: "/favicons/portal.svg",
  portal: "/favicons/portal.svg",
};

function faviconMime(href: string): string {
  if (href.endsWith(".svg")) return "image/svg+xml";
  if (href.endsWith(".png")) return "image/png";
  if (href.endsWith(".ico")) return "image/x-icon";
  return "image/png";
}

/**
 * Updates the browser tab favicon to match the active app area (CRM, HRMS, etc.).
 */
export function setBrowserTabIcon(brand: BrowserTabBrand): void {
  if (typeof document === "undefined") return;
  const href = ICON_PATH[brand];
  const apply = (rel: string) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.type = faviconMime(href);
    link.href = href;
  };
  apply("icon");
  apply("shortcut icon");
}

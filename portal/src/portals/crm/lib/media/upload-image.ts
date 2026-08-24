import api from "@/lib/crm/api";

/**
 * CRM-scoped image upload — thin wrapper over `POST /uploads/image` using the
 * CRM axios client (`@/lib/crm/api`, Bearer token from `token`/`crm_token`/
 * `pm_token`), so auth headers match every other CRM request. Modeled on
 * `@/lib/media/upload-image.ts` (the HRMS-scoped equivalent) — no CRM-scoped
 * image upload existed before "Share Property" needed one.
 */
export type CrmImageUploadResult = {
  url: string;
  filename: string;
  width?: number;
  height?: number;
};

/** Upload one image file and return its stored (relative `/uploads/...`) URL. */
export async function uploadCrmImage(
  file: File,
  context = "property-share",
): Promise<CrmImageUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<CrmImageUploadResult>("/uploads/image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    params: { context },
  });
  return data;
}

/** Upload several images in parallel, in the order given. */
export async function uploadCrmImages(
  files: File[],
  context = "property-share",
): Promise<CrmImageUploadResult[]> {
  return Promise.all(files.map((file) => uploadCrmImage(file, context)));
}

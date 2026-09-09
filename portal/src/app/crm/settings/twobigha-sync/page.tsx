"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Kept for bookmarks — 2bigha sync now lives under Users & access. */
export default function TwoBighaSyncSettingsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/crm/settings/users?tab=twobigha-sync");
  }, [router]);
  return null;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";

type Props = {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
  onSuccess?: (property: PropertyListingRecord) => void;
};

/** Directly redirects to the full 5-step property wizard for PM property creation. */
export default function AddPmPropertyModal({
  open,
  onClose,
  leadId,
}: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams();
    if (leadId) params.set("leadId", leadId);
    params.set("bucket", "pm");
    router.push(`/crm/property-listings/new?${params.toString()}`);
    onClose();
  }, [open, leadId, router, onClose]);

  return null;
}

"use client";

import dynamic from "next/dynamic";
import { useEmailComposerStore } from "@/stores/emailComposerStore";

const GlobalEmailComposer = dynamic(
  () => import("@/components/crm/email/composer/GlobalEmailComposer"),
  { ssr: false },
);

export default function LazyGlobalEmailComposer() {
  const isOpen = useEmailComposerStore((s) => s.isOpen);
  if (!isOpen) return null;
  return <GlobalEmailComposer />;
}

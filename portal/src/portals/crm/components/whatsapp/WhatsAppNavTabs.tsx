"use client";

import Link from "next/link";
import { MessageCircle, FileText, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  active: "chats" | "templates" | "campaigns";
};

/** Sub-nav shared by the pages under the top-level "WhatsApp" sidebar item. */
export default function WhatsAppNavTabs({ active }: Props) {
  const tabs = [
    { id: "chats" as const, label: "Chats", href: "/crm/whatsapp", icon: MessageCircle },
    { id: "templates" as const, label: "Templates", href: "/crm/whatsapp/templates", icon: FileText },
    { id: "campaigns" as const, label: "Campaigns", href: "/crm/whatsapp/campaigns", icon: Megaphone },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition",
              isActive
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-text-muted hover:text-text-main",
            )}
          >
            <Icon size={14} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

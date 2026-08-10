"use client";

import {
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function UnauthorizedContent() {
  const { user, getDefaultRoute, isLoaded } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleParam = searchParams.get("module") || "";

  const handleGoToAvailable = () => {
    const route = getDefaultRoute();
    router.push(route);
  };

  const handleSignOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
    window.location.href = "/auth/login";
  };

  // Get a pretty name for the restricted module
  const getModuleLabel = (mod: string) => {
    const lower = mod.toLowerCase();
    if (lower === "crm") return "CRM Workspace";
    if (lower === "pm") return "Project Management";
    if (lower === "hrms") return "HRMS Portal";
    if (lower === "vault") return "Security Vault";
    if (lower === "social") return "Social Desk";
    return mod ? `${mod.toUpperCase()} Module` : "";
  };

  const moduleLabel = getModuleLabel(moduleParam);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#f4f5f7] dark:bg-[#121212] text-[#172b4d] dark:text-[#fafaf9] font-sans selection:bg-[#deebff] selection:text-[#0c66e4]">
      <div className="w-full max-w-[400px] flex flex-col items-center">
        {/* Clean, Structured Card matching JIRA.panel classes */}
        <div className="w-full bg-white dark:bg-[#1c1c1e] border border-[#dfe1e6] dark:border-[#2d2d30] rounded-sm p-8 shadow-[0_4px_12px_rgba(9,30,66,0.15)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
          {/* Centered Red Security Alert Icon */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#ffebe6] dark:bg-[#ffbdad]/15">
              <ShieldAlert size={24} className="text-[#de350b] dark:text-[#ff5630]" />
            </div>
          </div>

          <div className="text-center space-y-2 mb-6">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5e6c84] dark:text-[#a1a1aa]">
              Access Denied
            </span>
            <h1 className="text-xl font-medium tracking-tight text-[#172b4d] dark:text-[#fafaf9]">
              Security clearance required
            </h1>
            {moduleLabel && (
              <div className="inline-block mt-1 text-xs font-semibold text-[#0052cc] dark:text-[#4c9aff]">
                {moduleLabel}
              </div>
            )}
          </div>

          <div className="text-center space-y-4 mb-8 text-sm text-[#42526e] dark:text-[#d1d1d6] leading-relaxed">
            <p>
              {user?.firstName ? `Hi ${user.firstName}, it` : "It"} looks like your
              account does not have permission to access this module.
            </p>
            <p className="text-xs text-[#5e6c84] dark:text-[#a1a1aa]">
              Please contact your administrator if you believe this is an error in your
              clearance level.
            </p>
          </div>

          {/* Standard JIRA button alignments and paddings */}
          <div className="space-y-2">
            {isLoaded && (
              <button
                onClick={handleGoToAvailable}
                className="w-full flex items-center justify-center gap-2 h-9 rounded bg-[#0052cc] hover:bg-[#0047b3] text-white text-sm font-medium transition-colors cursor-pointer"
              >
                <LayoutDashboard size={16} />
                Go to My Dashboard
                <ArrowRight size={16} />
              </button>
            )}

            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 h-9 rounded border border-[#dfe1e6] dark:border-[#3f3f42] bg-white dark:bg-[#27272a] hover:bg-[#f4f5f7] dark:hover:bg-[#323235] text-[#172b4d] dark:text-[#fafaf9] text-sm font-medium transition-colors cursor-pointer"
            >
              <LogOut size={14} />
              Sign Out / Switch Account
            </button>
          </div>
        </div>

        {/* Footer Security Indicators */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <p className="text-[10px] font-semibold tracking-wider text-[#5e6c84] dark:text-[#a1a1aa] uppercase">
            System Security Instance
          </p>
          <div className="flex items-center gap-4 text-[9px] font-semibold text-[#5e6c84] dark:text-[#a1a1aa] uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <ShieldCheck size={11} className="text-[#36b37e]" /> Protected
            </span>
            <span className="w-1 h-1 rounded-full bg-[#ebecf0]" />
            <span className="flex items-center gap-1">
              <ShieldCheck size={11} className="text-[#36b37e]" /> Logged
            </span>
            <span className="w-1 h-1 rounded-full bg-[#ebecf0]" />
            <span className="flex items-center gap-1">
              <ShieldCheck size={11} className="text-[#36b37e]" /> Secure
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f5f7] dark:bg-[#121212]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0052cc]"></div>
        </div>
      }
    >
      <UnauthorizedContent />
    </Suspense>
  );
}

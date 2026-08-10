"use client";

import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

export default function PermissionRefreshBanner() {
    const { showRefreshPrompt } = usePermissions();

    if (!showRefreshPrompt) return null;

    const handleRefresh = async () => {
        // usePermissions.ts has already synced the new token and access versions 
        // from the /auth/me poll into localStorage. A simple reload is sufficient 
        // to re-evaluate permissions across the app without hitting 404 on an old endpoint.
        window.location.reload();
    };

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[95%] max-w-xl animate-in fade-in slide-in-from-top-4 duration-500 text-left">
            <div className="bg-slate-900 border border-white/10 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center animate-pulse">
                        <RefreshCw size={20} className="text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-black tracking-tight uppercase">Sync Required</p>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-tight">Access or project assignments have changed. Refresh to sync.</p>
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    className="bg-white text-slate-900 px-5 py-2 rounded-xl text-xs font-black shadow-lg hover:bg-slate-100 transition-all active:scale-95 whitespace-nowrap"
                >
                    Refresh Now
                </button>
            </div>
        </div>
    );
}

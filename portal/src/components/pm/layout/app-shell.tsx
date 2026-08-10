'use client';

import { useAuthStore } from '@/store/pm/auth-store';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from './sidebar';
import LazyPMGlobalSearch from './LazyPMGlobalSearch';

export function AppShell({ children }: { children: React.ReactNode }) {
    const token = useAuthStore((state) => state.token);
    const router = useRouter();
    const [hydrated, setHydrated] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Wait for Zustand's persist middleware to rehydrate from localStorage
    useEffect(() => {
        setHydrated(true);
        // Restore sidebar collapsed state
        const saved = localStorage.getItem('sidebar-collapsed');
        if (saved === 'true') setSidebarCollapsed(true);
    }, []);

    useEffect(() => {
        if (hydrated && !token) {
            router.replace('/auth/login');
        }
    }, [token, router, hydrated]);

    const handleToggleSidebar = () => {
        setSidebarCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', String(next));
            return next;
        });
    };

    if (!hydrated) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[var(--background)]">
                <div className="flex flex-col items-center gap-4 animate-pulse">
                    <div className="h-12 w-12 rounded-md bg-[#fff0ed] border border-[#ffb7a1]/60 flex items-center justify-center">
                        <div className="h-6 w-6 bg-[var(--hs-link)] rounded-md flex items-center justify-center shadow-sm">
                            <span className="text-white font-bold text-xs leading-none uppercase">M</span>
                        </div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] font-medium">Loading…</div>
                </div>
            </div>
        );
    }

    if (!token) return null;

    return (
        <div className="flex h-screen bg-[var(--background)] text-[var(--text-main)] overflow-hidden selection:bg-[var(--hs-link)]/15 selection:text-[var(--text-main)] theme-crm-hubspot">
            <Sidebar collapsed={sidebarCollapsed} onToggle={handleToggleSidebar} />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <header className="crm-app-header h-16 bg-[var(--crm-header-bg)] border-b border-[var(--border-color)] flex items-center px-6 md:px-8 shrink-0 sticky top-0 z-30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
                    <div className="flex-1 flex justify-center max-w-2xl mx-auto min-w-0">
                        <LazyPMGlobalSearch />
                    </div>
                </header>
                <main className="crm-app-main flex-1 overflow-auto relative custom-scrollbar bg-[var(--background)] border-l border-[var(--border-color)] p-6 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}

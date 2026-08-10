'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { setBrowserTabIcon } from '@/lib/browser-tab-brand';

export default function RootDispatcher() {
    const router = useRouter();
    const { isLoaded, getDefaultRoute } = usePermissions();

    useEffect(() => {
        setBrowserTabIcon('default');
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        const standalone = process.env.NEXT_PUBLIC_CRM_STANDALONE === 'true';
        router.replace(standalone ? '/crm/workspace' : getDefaultRoute());
    }, [isLoaded, router, getDefaultRoute]);

    return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-blue-500/20 animate-bounce">
                    M
                </div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em] animate-pulse">
                    Initializing 2Bigha...
                </div>
            </div>
        </div>
    );
}

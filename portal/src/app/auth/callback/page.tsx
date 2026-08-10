"use client";

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from "@/store/pm/auth-store";
import { Loader2, X } from 'lucide-react';

function CallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'error'>('loading');

    useEffect(() => {
        const token = searchParams.get('token');
        const userRaw = searchParams.get('user');
        const error = searchParams.get('error');

        if (error || !token || !userRaw) {
            setStatus('error');
            setTimeout(() => router.replace('/auth/login?error=auth_failed'), 3000);
            return;
        }

        try {
            const user = JSON.parse(decodeURIComponent(userRaw));

            // Standard storage
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            document.cookie = `token=${token}; path=/; max-age=604800`;

            // Sync with PM Auth Store
            useAuthStore.getState().setAuth(
                {
                    ...user,
                    id: user.id || user._id,
                    fullName: user.fullName || (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Member'),
                    role: user.role?.toUpperCase() || 'MEMBER',
                    permissions: user.permissions || (user.roleId?.permissions || []).map((p: any) => typeof p === 'string' ? p : p.key || p.name) || [],
                    isActive: user.isActive !== false
                },
                token
            );

            const permittedTools: string[] = (user.permittedTools || []).map((t: string) => t.toUpperCase());
            const fromPath = searchParams.get('from');

            if (fromPath && !fromPath.startsWith('/auth')) {
                router.replace(fromPath);
                return;
            }

            // Logical Redirection
            if (permittedTools.includes('HRMS')) {
                router.replace('/hrms/dashboard');
            } else if (permittedTools.includes('PM')) {
                router.replace('/pm/boards');
            } else if (permittedTools.includes('CRM')) {
                router.replace('/crm/workspace');
            } else if (permittedTools.includes('SOCIAL')) {
                router.replace('/social');
            } else {
                router.replace('/hrms/dashboard');
            }
        } catch (err) {
            console.error('Callback parsing failed', err);
            setStatus('error');
            setTimeout(() => router.replace('/auth/login?error=auth_failed'), 3000);
        }
    }, [router, searchParams]);

    return (
        <div className="min-h-screen bg-[#fcfdfe] flex items-center justify-center font-sans">
            <div className="text-center space-y-6">
                {status === 'loading' ? (
                    <div className="flex flex-col items-center gap-6 animate-in fade-in duration-700">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                            <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary/40" size={20} />
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-black text-text-main uppercase tracking-[0.3em] italic">Signing you in</p>
                            <p className="text-xs font-black text-text-muted uppercase tracking-[0.2em] opacity-40">Getting everything ready...</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-6 animate-in zoom-in-95 duration-500">
                        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center border border-rose-100 shadow-sm">
                            <X size={32} strokeWidth={3} />
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-black text-rose-600 uppercase tracking-[0.3em] italic">Sign-in Failed</p>
                            <p className="text-xs font-black text-text-muted uppercase tracking-[0.2em] opacity-40">Taking you back to login...</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CallbackPage() {
    return (
        <Suspense fallback={null}>
            <CallbackContent />
        </Suspense>
    );
}

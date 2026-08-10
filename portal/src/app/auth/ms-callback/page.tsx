"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function MsCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'error'>('loading');

    useEffect(() => {
        const token = searchParams.get('token');
        const userRaw = searchParams.get('user');
        const error = searchParams.get('error');

        if (error || !token || !userRaw) {
            setStatus('error');
            setTimeout(() => router.replace('/auth/login?error=ms_login_failed'), 2500);
            return;
        }

        try {
            const user = JSON.parse(decodeURIComponent(userRaw));

            // Store session identically to regular login
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            document.cookie = `token=${token}; path=/`;

            // Redirect based on permittedTools — most reliable signal from the server
            const managementRoles = ['ADMIN', 'CEO', 'CTO', 'MANAGER', 'EXECUTIVE', 'SENIOR MEMBER', 'ADMINISTRATOR'];
            const isAdmin = managementRoles.includes(user.role?.toUpperCase() || '');
            const permittedTools: string[] = (user.permittedTools || []).map((t: string) =>
                String(t || '').toUpperCase(),
            );
            const fromPath = searchParams.get('from');

            // Respect 'from' parameter if it's not another auth page
            if (fromPath && !fromPath.startsWith('/auth')) {
                router.replace(fromPath);
                return;
            }

            if (isAdmin) {
                if (permittedTools.includes('PM')) {
                    router.replace('/pm/boards');
                } else if (permittedTools.includes('CRM')) {
                    router.replace('/crm/workspace');
                } else if (permittedTools.includes('SOCIAL')) {
                    router.replace('/social');
                } else {
                    router.replace('/hrms/dashboard');
                }
            } else if (permittedTools.includes('HRMS')) {
                router.replace('/hrms/dashboard');
            } else if (permittedTools.includes('PM')) {
                router.replace('/pm/boards');
            } else if (permittedTools.includes('CRM')) {
                router.replace('/crm/workspace');
            } else if (permittedTools.includes('SOCIAL')) {
                router.replace('/social');
            } else {
                router.replace('/unauthorized?module=hrms');
            }
        } catch {
            setStatus('error');
            setTimeout(() => router.replace('/auth/login?error=ms_login_failed'), 2500);
        }
    }, [router, searchParams]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center space-y-4">
                {status === 'loading' ? (
                    <>
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-slate-600 font-semibold">Signing you in with Microsoft…</p>
                    </>
                ) : (
                    <>
                        <p className="text-red-500 font-semibold">Microsoft sign-in failed.</p>
                        <p className="text-slate-500 text-sm">Redirecting to login…</p>
                    </>
                )}
            </div>
        </div>
    );
}

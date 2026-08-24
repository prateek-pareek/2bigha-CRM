"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const isAuthPage = pathname.startsWith('/auth');
        const isUnauthorizedPage = pathname === '/unauthorized';
        const isClientPortalTokenPath =
            /^\/portal\/[^/]+\/?$/.test(pathname);
        const isPublicPage =
            pathname.startsWith('/wiki/public') ||
            pathname.startsWith('/career-portal') ||
            pathname.startsWith('/public/employee-agreements/sign') ||
            isClientPortalTokenPath;

        // Get search params for error and from checks
        const searchInput = window.location.search;
        const searchParams = new URLSearchParams(searchInput);
        const hasError = searchParams.has('error') || searchInput.includes('error=');
        const fromPath = searchParams.get('from');

        if (!token && !isAuthPage && !isUnauthorizedPage && !isPublicPage) {
            // Not logged in and not on auth page - redirect to login
            const redirectPath = `/auth/login?from=${encodeURIComponent(pathname)}`;
            router.replace(redirectPath);
        } else if (token && isAuthPage && !hasError) {
            // Already logged in and on login page (without error), redirect to a default dashboard
            // We'll try to get the user from localStorage to determine the best dashboard
            const savedUser = localStorage.getItem('user');

            // INITIAL target is the 'from' parameter if it exists and is not an auth page
            let targetPath = fromPath && !fromPath.startsWith('/auth') && fromPath.startsWith('/') ? fromPath : null;

            if (savedUser) {
                try {
                    const user = JSON.parse(savedUser);
                    const tools = (user.permittedTools || []).map((t: string) => t.toUpperCase());
                    const rolePermissions =
                        user?.roleId?.permissions?.map((p: any) =>
                            typeof p === 'string' ? p : p?.key || p?.name,
                        ) || [];
                    const directPermissions = Array.isArray(user?.permissions) ? user.permissions : [];
                    const allPermissions = [...directPermissions, ...rolePermissions];
                    const hasVaultAccess = allPermissions.some(
                        (p: string) => p === 'vault' || p.startsWith('vault:') || p.startsWith('hr-settings:'),
                    );
                    const managementRoles = ['ADMIN', 'CEO', 'CTO', 'MANAGER', 'EXECUTIVE', 'SENIOR MEMBER', 'ADMINISTRATOR'];
                    const isAdmin = managementRoles.includes(user.role?.toUpperCase() || '');

                    // ONLY calculate a default if we don't already have a valid 'from' path
                    if (!targetPath) {
                        targetPath = '/crm/workspace';
                    }
                } catch (e) {
                    if (!targetPath) targetPath = '/crm/workspace';
                }
            }

            router.replace(targetPath || '/crm/workspace');
        } else if (token) {
            setIsAuthenticated(true);
        }

        setIsLoading(false);
    }, [pathname, router]);

    const isAuthPage = pathname.startsWith('/auth');
    const isUnauthorizedPage = pathname === '/unauthorized';
    const isClientPortalTokenPath = /^\/portal\/[^/]+\/?$/.test(pathname);
    const isPublicPage =
        pathname.startsWith('/wiki/public') ||
        pathname.startsWith('/career-portal') ||
        pathname.startsWith('/public/employee-agreements/sign') ||
        isClientPortalTokenPath;

    if (isLoading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-background">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (isAuthPage || isUnauthorizedPage || isPublicPage) {
        return <>{children}</>;
    }

    if (!isAuthenticated) {
        return null; // Will redirect in useEffect
    }

    return <>{children}</>;
}

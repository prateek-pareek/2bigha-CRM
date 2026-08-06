import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    userId?: string;
    email: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    role: string;
    permissions: string[];
    permittedTools?: string[];
    pmProjects?: any[];
    pmSpaces?: any[];
    isActive: boolean;
}

interface AuthState {
    user: User | null;
    token: string | null;
    setAuth: (user: User, token: string) => void;
    logout: () => void;
}

const normalizeUser = (parsed: any): User => {
    const oid = String(parsed.id || parsed._id || parsed.userId || '');
    return {
        ...parsed,
        id: oid,
        userId: oid,
        fullName: parsed.fullName || (parsed.firstName ? `${parsed.firstName} ${parsed.lastName || ''}`.trim() : 'Member'),
        role: parsed.role?.toUpperCase() || 'MEMBER',
        permissions: parsed.permissions || (parsed.roleId?.permissions || []).map((p: any) => typeof p === 'string' ? p : p.key || p.name) || [],
        isActive: parsed.isActive !== false
    };
};

export const useAuthStore = create<AuthState>()(
    (set) => ({
        user: typeof window !== 'undefined' ? (() => {
            const saved = localStorage.getItem('pm_user') || localStorage.getItem('user');
            if (!saved) return null;
            try {
                return normalizeUser(JSON.parse(saved));
            } catch (e) {
                return null;
            }
        })() : null,
        token: typeof window !== 'undefined' ? (localStorage.getItem('pm_token') || localStorage.getItem('token')) : null,
        setAuth: (user, token) => {
            const normalized = normalizeUser(user);
            if (typeof window !== 'undefined') {
                localStorage.setItem('pm_token', token);
                localStorage.setItem('pm_user', JSON.stringify(normalized));
                // Also set general for fallback
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(normalized));
            }
            set({ user: normalized, token });
        },
        logout: () => {
            if (typeof window !== 'undefined') {
                localStorage.removeItem('pm_token');
                localStorage.removeItem('pm_user');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                // Hard redirect to clear all states and trigger AuthGuard
                window.location.href = '/auth/login';
            }
            set({ user: null, token: null });
        },
    })
);

// Listen for storage changes to sync across tabs/modules
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key === 'pm_token' || event.key === 'token') {
            const token = localStorage.getItem('pm_token') || localStorage.getItem('token');
            const savedUser = localStorage.getItem('pm_user') || localStorage.getItem('user');
            if (token && savedUser) {
                try {
                    const user = normalizeUser(JSON.parse(savedUser));
                    useAuthStore.setState({ token, user });
                } catch (e) {
                    // Ignore malformed user data
                }
            } else if (!token) {
                useAuthStore.setState({ token: null, user: null });
            }
        }
    });
}

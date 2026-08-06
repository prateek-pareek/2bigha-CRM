"use client";
// Force hot-reload clean rebuild after import update

import Sidebar from './Sidebar';
import { ThemeModeToggle } from './ThemeModeToggle';
import { Bell, LogOut, Menu } from 'lucide-react';
import dynamic from 'next/dynamic';
import NotificationList from '@/components/suite/notifications/NotificationList';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isQuickChatEnabled } from '@/lib/feature-flags';
import QuickChatWidget from './QuickChatWidget';

import api from '@/lib/pm/api';
import { io } from 'socket.io-client';
import { API_HOST_URL } from '@/lib/api/config';
import { getJwtSubjectFromBrowser } from '@/lib/jwt-subject';
import { cn } from '@/lib/utils';
import { ModuleJiraAppHeader } from '@/components/layout/module-jira-app-header';
import { jiraShellLayout } from '@/lib/pm/jira-ui';
import { crmShellLayout } from '@/lib/crm/shell';
import { hrmsShellLayout } from '@/lib/hrms/shell';
import { socialShellLayout } from '@/lib/social/shell';
import { Building2, Globe, Handshake, Kanban, KeyRound, LineChart, Share2 } from 'lucide-react';

function readSuiteSidebarPinnedInitial(): boolean {
    if (typeof window === 'undefined') return true;
    const pinned = localStorage.getItem('suiteSidebarPinned');
    if (pinned !== null) return pinned === 'true';
    const legacy = localStorage.getItem('suiteSidebarCollapsed');
    if (legacy !== null) return legacy === 'false';
    return true;
}

const QuickAddModal = dynamic(() => import('@/components/crm/records/create/QuickAddModal'), { ssr: false });
const LazyPMGlobalSearch = dynamic(() => import('@/components/pm/layout/LazyPMGlobalSearch'), { ssr: false });
const LazyGlobalSearch = dynamic(() => import('@/components/suite/search/LazyGlobalSearch'), { ssr: false });

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isWikiRoute = pathname.startsWith('/pm/wiki');
    const isPmRoute = pathname.startsWith('/pm');
    const isCrmRoute = pathname.startsWith('/crm');
    const isSocialRoute = pathname.startsWith('/social');
    const isHrmsRoute = pathname.startsWith('/hrms');
    const isVaultRoute = pathname.startsWith('/vault');
    const isExecutiveRoute = pathname.startsWith('/executive');
    const isClientPortalsRoute = pathname.startsWith('/client-portals');
    const isJiraModuleRoute =
        isCrmRoute ||
        isSocialRoute ||
        isHrmsRoute ||
        isVaultRoute ||
        isExecutiveRoute ||
        isClientPortalsRoute;
    const isSuiteJiraShell = isPmRoute || isJiraModuleRoute;
    const isPmBoardRoute = /^\/pm\/projects\/[^/]+\/board/.test(pathname);
    const isPmBoardsListRoute = pathname === '/pm/boards' || pathname.startsWith('/pm/boards/');
    const isPmFlushMain = isWikiRoute || isPmBoardRoute || isPmBoardsListRoute;
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [quickAddType, setQuickAddType] = useState<'Lead' | 'Deal' | 'Org' | 'Contact' | 'Note' | 'Task' | 'Call'>('Lead');
    const [quickAddPipelineId, setQuickAddPipelineId] = useState<string>('');
    const [quickAddStage, setQuickAddStage] = useState<string>('');
    const [quickAddSource, setQuickAddSource] = useState<string>('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [isTabVisible, setIsTabVisible] = useState(true);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const fetchUnreadCount = async () => {
        try {
            const res = await api.get('/notifications/unread-count');
            const count = typeof res.data === 'number' ? res.data : (res.data?.count || 0);
            setUnreadCount(count);
        } catch (err) {
            console.error('Failed to fetch unread count', err);
        }
    };

    useEffect(() => {
        const updateVisibility = () => setIsTabVisible(document.visibilityState === 'visible');
        updateVisibility();
        document.addEventListener('visibilitychange', updateVisibility);
        return () => document.removeEventListener('visibilitychange', updateVisibility);
    }, []);

    // Real-time updates via WebSockets
    useEffect(() => {
        if (!isTabVisible) return;
        const rooms = [getJwtSubjectFromBrowser()].filter(Boolean) as string[];
        if (!rooms.length) return;

        const socket = io(process.env.NEXT_PUBLIC_PM_API_URL || API_HOST_URL);

        socket.on('connect', () => {
            rooms.forEach(roomId => socket.emit('join-room', roomId));
        });

        socket.on('notification', () => {
            fetchUnreadCount();
        });

        const handleRefresh = () => fetchUnreadCount();
        window.addEventListener('notifications:refresh', handleRefresh);

        return () => {
            socket.disconnect();
            window.removeEventListener('notifications:refresh', handleRefresh);
        };
    }, [isTabVisible]);

    // Subscribe to custom event for global Quick Add trigger
    useEffect(() => {
        const handleTrigger = (e: any) => {
            setQuickAddType(e.detail?.type || 'Lead');
            setQuickAddPipelineId(e.detail?.pipelineId || '');
            setQuickAddStage(e.detail?.stage || '');
            setQuickAddSource(e.detail?.source || '');
            setIsQuickAddOpen(true);
        };
        window.addEventListener('trigger-quick-add', handleTrigger);
        return () => window.removeEventListener('trigger-quick-add', handleTrigger);
    }, []);

    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const saved = localStorage.getItem('user');
        if (saved) {
            try {
                setUser(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse user', e);
            }
        }
        
        const fetchIfVisible = () => {
            if (document.visibilityState !== 'visible') return;
            fetchUnreadCount();
        };
        fetchIfVisible();
        const interval = setInterval(fetchIfVisible, 120000); // Polling fallback (active tab only)
        const handleVisibility = () => fetchIfVisible();
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    const [isSidebarPinned, setIsSidebarPinned] = useState(readSuiteSidebarPinnedInitial);
    const [isSidebarHovered, setIsSidebarHovered] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const onSidebarState = (e: Event) => {
            const detail = (e as CustomEvent<{ pinned?: boolean }>).detail;
            if (typeof detail?.pinned !== 'boolean') return;
            setIsSidebarPinned(detail.pinned);
            if (!detail.pinned) setIsSidebarHovered(false);
        };
        window.addEventListener('suite-sidebar:state', onSidebarState);
        return () => window.removeEventListener('suite-sidebar:state', onSidebarState);
    }, []);

    const setHoveredState = (hovered: boolean) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        if (hovered) {
            setIsSidebarHovered(true);
        } else {
            hoverTimeoutRef.current = setTimeout(() => {
                setIsSidebarHovered(false);
            }, 180);
        }
    };

    const toggleSidebarPinned = () => {
        const next = !isSidebarPinned;
        setIsSidebarPinned(next);
        if (!next) setIsSidebarHovered(false);
        try {
            localStorage.setItem('suiteSidebarPinned', String(next));
            localStorage.setItem('suiteSidebarCollapsed', String(!next));
        } catch {}
        queueMicrotask(() => {
            window.dispatchEvent(
                new CustomEvent('suite-sidebar:state', {
                    detail: { collapsed: !next, pinned: next },
                }),
            );
        });
    };
    return (
        <div
            className={cn(
                "theme-crm-hubspot theme-collab-slack crm-app-shell slack-app-shell flex h-screen flex-col overflow-hidden",
                !isCrmRoute && "pm-jira-font",
            )}
        >
            {/* ── Full-width top header (always above sidebar) ── */}
            <div className="shrink-0 z-50 relative">
                {isPmRoute ? (
                    <ModuleJiraAppHeader
                        onMobileMenuClick={() => setIsMobileSidebarOpen(true)}
                        user={user}
                        unreadCount={unreadCount}
                        productName="Projects"
                        productHref="/pm/boards"
                        productIcon={Kanban}
                        productLogoClass="bg-[#007a87]"
                        isSidebarPinned={isSidebarPinned}
                        onSidebarToggleClick={toggleSidebarPinned}
                        onSidebarToggleMouseEnter={() => setHoveredState(true)}
                        onSidebarToggleMouseLeave={() => setHoveredState(false)}
                    />
                ) : isCrmRoute ? (
                    <ModuleJiraAppHeader
                        onMobileMenuClick={() => setIsMobileSidebarOpen(true)}
                        user={user}
                        unreadCount={unreadCount}
                        productName="CRM"
                        productHref="/crm/workspace/summary"
                        productIcon={Handshake}
                        productLogoClass="bg-[var(--primary,#e41f07)]"
                        isSidebarPinned={isSidebarPinned}
                        onSidebarToggleClick={toggleSidebarPinned}
                        onSidebarToggleMouseEnter={() => setHoveredState(true)}
                        onSidebarToggleMouseLeave={() => setHoveredState(false)}
                    />
                ) : isSocialRoute ? (
                    <ModuleJiraAppHeader
                        onMobileMenuClick={() => setIsMobileSidebarOpen(true)}
                        user={user}
                        unreadCount={unreadCount}
                        productName="Social desk"
                        productHref="/social"
                        productIcon={Share2}
                        productLogoClass="bg-[var(--primary,#e41f07)]"
                        isSidebarPinned={isSidebarPinned}
                        onSidebarToggleClick={toggleSidebarPinned}
                        onSidebarToggleMouseEnter={() => setHoveredState(true)}
                        onSidebarToggleMouseLeave={() => setHoveredState(false)}
                    />
                ) : isHrmsRoute ? (
                    <ModuleJiraAppHeader
                        onMobileMenuClick={() => setIsMobileSidebarOpen(true)}
                        user={user}
                        unreadCount={unreadCount}
                        productName="HRMS"
                        productHref="/hrms/dashboard"
                        productIcon={Building2}
                        productLogoClass="bg-[var(--primary,#fe3f51)]"
                        isSidebarPinned={isSidebarPinned}
                        onSidebarToggleClick={toggleSidebarPinned}
                        onSidebarToggleMouseEnter={() => setHoveredState(true)}
                        onSidebarToggleMouseLeave={() => setHoveredState(false)}
                    />
                ) : isVaultRoute ? (
                    <ModuleJiraAppHeader
                        onMobileMenuClick={() => setIsMobileSidebarOpen(true)}
                        user={user}
                        unreadCount={unreadCount}
                        productName="Vault"
                        productHref="/vault"
                        productIcon={KeyRound}
                        productLogoClass="bg-[#0c66e4]"
                        isSidebarPinned={isSidebarPinned}
                        onSidebarToggleClick={toggleSidebarPinned}
                        onSidebarToggleMouseEnter={() => setHoveredState(true)}
                        onSidebarToggleMouseLeave={() => setHoveredState(false)}
                    />
                ) : isExecutiveRoute ? (
                    <ModuleJiraAppHeader
                        onMobileMenuClick={() => setIsMobileSidebarOpen(true)}
                        user={user}
                        unreadCount={unreadCount}
                        productName="Executive"
                        productHref="/executive"
                        productIcon={LineChart}
                        productLogoClass="bg-[#5243aa]"
                        isSidebarPinned={isSidebarPinned}
                        onSidebarToggleClick={toggleSidebarPinned}
                        onSidebarToggleMouseEnter={() => setHoveredState(true)}
                        onSidebarToggleMouseLeave={() => setHoveredState(false)}
                    />
                ) : isClientPortalsRoute ? (
                    <ModuleJiraAppHeader
                        onMobileMenuClick={() => setIsMobileSidebarOpen(true)}
                        user={user}
                        unreadCount={unreadCount}
                        productName="Client Portals"
                        productHref="/client-portals"
                        productIcon={Globe}
                        productLogoClass="bg-[#00b8d9]"
                        isSidebarPinned={isSidebarPinned}
                        onSidebarToggleClick={toggleSidebarPinned}
                        onSidebarToggleMouseEnter={() => setHoveredState(true)}
                        onSidebarToggleMouseLeave={() => setHoveredState(false)}
                    />
                ) : (
                <header className="crm-app-header slack-app-header flex h-14 shrink-0 items-center justify-between border-b border-[var(--shell-border)] bg-[var(--shell-header-bg)] px-3 shadow-[0_1px_0_rgba(0,0,0,0.04)] md:px-6 z-50 dark:shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                    <div className="flex items-center gap-2 sm:gap-6 flex-1 min-w-0">
                        <button
                            type="button"
                            onClick={() => setIsMobileSidebarOpen(true)}
                            className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] lg:hidden shrink-0"
                            aria-label="Toggle navigation menu"
                        >
                            <Menu size={20} />
                        </button>
                        <div
                            data-tour="global-search"
                            className="w-full max-w-xs sm:max-w-xl flex justify-center mx-auto min-w-0"
                        >
                            {pathname.startsWith('/pm') ? (
                                <LazyPMGlobalSearch />
                            ) : (
                                <LazyGlobalSearch />
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                        <div
                            data-tour="notifications"
                            className="relative group/notify"
                            onMouseEnter={() => setIsNotificationOpen(true)}
                            onMouseLeave={() => setIsNotificationOpen(false)}
                        >
                            <button className="relative p-2 rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] group">
                                <Bell size={20} />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-2 border-[var(--card-bg)] bg-[var(--hs-link)] px-1 text-[9px] font-black text-white shadow-sm">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                            {isNotificationOpen && (
                                <div className="absolute top-full right-0 mt-2 visible opacity-100 transition-all duration-200 z-50">
                                    <NotificationList serverUnreadCount={unreadCount} />
                                </div>
                            )}
                        </div>
                        <ThemeModeToggle />
                        <div className="h-6 w-px bg-[var(--border-color)] mx-1" />
                        <div className="relative group/profile" data-tour="profile-menu">
                            <div className="flex cursor-pointer items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-[var(--surface-hover)]">
                                <div className="w-8 h-8 rounded-full bg-[var(--hs-link)] flex items-center justify-center text-xs font-bold text-white shadow-sm">
                                    {user?.firstName?.[0]}{user?.lastName?.[0] || 'U'}
                                </div>
                                <div className="hidden md:block">
                                    <p className="text-sm font-semibold text-text-main leading-none">{user?.firstName} {user?.lastName}</p>
                                    <p className="text-xs text-[var(--text-muted)] font-medium mt-1 uppercase tracking-wide">{user?.role || 'User'}</p>
                                </div>
                            </div>

                            <div className="absolute top-full right-0 z-50 mt-2 w-48 invisible rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] py-2 opacity-0 shadow-lg transition-all duration-200 group-hover/profile:visible group-hover/profile:opacity-100">
                                <button
                                    onClick={() => {
                                        localStorage.removeItem('token');
                                        localStorage.removeItem('user');
                                        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
                                        window.location.href = '/auth/login';
                                    }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#d94c53] hover:bg-[var(--surface-dim)] font-semibold transition-colors text-left"
                                >
                                    <LogOut size={14} />
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </header>
                )}
            </div>

            {/* ── Below header: sidebar + main content side by side ── */}
            <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
            <Sidebar
                mobileOpen={isMobileSidebarOpen}
                onMobileClose={() => setIsMobileSidebarOpen(false)}
                isPinned={isSidebarPinned}
                isHovered={isSidebarHovered}
                onPinnedChange={setIsSidebarPinned}
                onHoveredChange={setIsSidebarHovered}
            />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <main
                    data-tour="main-content"
                    className={cn(
                        'crm-app-main slack-app-main min-w-0 flex-1 custom-scrollbar',
                        isWikiRoute
                            ? 'flex min-h-0 flex-col overflow-hidden p-0'
                            : isPmFlushMain
                              ? 'relative flex min-h-0 flex-col overflow-hidden p-0'
                              : isCrmRoute
                                ? cn(crmShellLayout.main, crmShellLayout.mainPadded)
                                : isSocialRoute
                                  ? cn(socialShellLayout.main, socialShellLayout.mainPadded)
                                  : isHrmsRoute
                                    ? cn(hrmsShellLayout.main, hrmsShellLayout.mainPadded)
                                    : isSuiteJiraShell
                                    ? cn(jiraShellLayout.main, jiraShellLayout.mainPadded, 'pm-jira-internal')
                                    : 'overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6',
                    )}
                >
                    {children}
                </main>
            </div>
            </div>

            {isQuickAddOpen && (
                <QuickAddModal
                    isOpen
                    onClose={() => { setIsQuickAddOpen(false); setQuickAddPipelineId(''); setQuickAddStage(''); setQuickAddSource(''); }}
                    initialTab={quickAddType}
                    initialPipelineId={quickAddPipelineId}
                    initialStage={quickAddStage}
                    initialSource={quickAddSource}
                />
            )}
            {isQuickChatEnabled() && <QuickChatWidget />}
        </div>
    );
}

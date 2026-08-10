"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useMemo, useEffect, type ComponentType } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TOUR_PREPARE_EVENT } from '@/lib/platform-tour/start-tour';
import { cn } from '@/lib/utils';
import { jiraSidebarChrome } from '@/lib/pm/jira-ui';
import { MathionixSuiteSidebarBrand } from '@/components/MathionixBrand';
import api from '@/lib/pm/api';
import { fetchSalesAgentPendingCount } from '@/lib/crm/sales-agent';
import {
    BarChart3,
    Users,
    Handshake,
    Building2,
    Contact,
    FileText,
    CheckCircle,
    PhoneCall,
    Settings,
    UserCheck,
    TrendingUp,
    LayoutGrid,
    Layers,
    Lock as LockIcon,
    Mail,
    Briefcase,
    ShieldCheck,
    ShieldAlert,
    Server,
    UserCircle,
    LogOut,
    Kanban,
    Github,
    Zap,
    ChevronsUpDown,
    Check,
    Calendar,
    CalendarDays,
    Megaphone,
    Bell,
    ClipboardList,
    Clock,
    Receipt,
    LineChart,
    CircleDollarSign,
    ScrollText,
    Heart,
    Globe,
    Share2,
    PenSquare,
    Inbox,
    Search,
    Newspaper,
    KeyRound,
    ImageIcon,
    Wand2,
    Sparkles,
    Bot,
    Map,
    BookOpen,
    Target,
} from 'lucide-react';

const NAV_ICON_CLASS = 'h-4 w-4';

function isPmNavItemActive(
    pathname: string,
    href: string,
    matchBoardProject?: boolean,
) {
    if (matchBoardProject) {
        return (
            pathname.startsWith('/pm/boards') ||
            /\/pm\/projects\/[^/]+\/board/.test(pathname)
        );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

export type SuiteToolId = 'crm' | 'client-portals';

export type SuiteTool = {
    id: SuiteToolId;
    name: string;
    tagline: string;
    href: string;
    icon: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
    logoClass: string;
    logoClassIdle: string;
};

export const tools: SuiteTool[] = [
    {
        id: 'crm',
        name: 'CRM',
        tagline: 'Pipeline, clients & activities',
        href: '/crm/workspace',
        icon: Handshake,
        logoClass: 'bg-[#0c66e4]',
        logoClassIdle: 'bg-[#0c66e4]/15 text-[#0c66e4]',
    },
    {
        id: 'client-portals',
        name: 'Client Portals',
        tagline: 'Client updates & access',
        href: '/client-portals',
        icon: Globe,
        logoClass: 'bg-[#de350b]',
        logoClassIdle: 'bg-[#de350b]/15 text-[#de350b]',
    },
];

const executiveGroups = [
    {
        name: 'Overview',
        items: [
            { name: 'CEO Dashboard', href: '/executive', icon: LineChart, permission: 'dashboard' as const },
            { name: 'HRMS Dashboard', href: '/hrms/dashboard', icon: Building2, permission: 'dashboard' as const },
            { name: 'CRM Reports', href: '/crm/reports', icon: BarChart3, permission: 'dashboard:read' as const },
            { name: 'PM Dashboard', href: '/pm/dashboard', icon: LayoutGrid, permission: 'workload:read' as const },
            { name: 'Sales Copilot', href: '/crm/copilot', icon: Sparkles, permission: 'dashboard:read' as const },
        ],
    },
];

const vaultGroups = [
    {
        name: 'Vault',
        items: [
            { name: 'Passwords', href: '/vault', icon: KeyRound, permission: 'vault:read' as const },
        ],
    },
];

const socialGroups = [
    {
        name: 'Marketing',
        items: [
            { name: 'Overview', href: '/social', icon: LayoutGrid, permission: 'social:read' as const },
            {
                name: 'Reports & analytics',
                href: '/social/analytics',
                icon: BarChart3,
                permission: 'social:read' as const,
            },
            { name: 'Marketing Copilot', href: '/social/copilot', icon: Sparkles, permission: 'social:read' as const },
            { name: 'IT Strategies', href: '/social/strategies', icon: Target, permission: 'social:read' as const },
            { name: 'Compose', href: '/social/compose', icon: PenSquare, permission: 'social:write' as const },
            { name: 'Image studio', href: '/social/images', icon: ImageIcon, permission: 'social:write' as const },
            { name: 'AI content', href: '/social/ai-content', icon: Wand2, permission: 'social:write' as const },
            { name: 'Calendar', href: '/social/calendar', icon: CalendarDays, permission: 'social:read' as const },
            { name: 'SEO & rankings', href: '/social/seo', icon: Search, permission: 'social:read' as const },
            { name: 'Search Console', href: '/social/gsc', icon: LineChart, permission: 'social:read' as const },
            { name: 'Blog', href: '/social/blog', icon: Newspaper, permission: 'social:read' as const },
            {
                name: 'Portfolio & case studies',
                href: '/social/portfolio',
                icon: Briefcase,
                permission: 'social:read' as const,
            },
        ],
    },
];

const clientPortalGroups = [
    {
        name: 'Client Portals',
        items: [
            { name: 'Portal Console', href: '/client-portals', icon: Globe, permission: 'clients:read' as const },
        ],
    },
];

const crmGroups = [
    {
        name: 'Overview',
        items: [
            { name: 'Sales workspace', href: '/crm/workspace', icon: LayoutGrid, permission: 'dashboard:read' },
            { name: 'Report', href: '/crm/reports', icon: BarChart3, permission: 'dashboard:read' },
            { name: 'Sales Copilot', href: '/crm/copilot', icon: Bot, permission: 'dashboard:read' },
            { name: 'Data intelligence', href: '/crm/intelligence', icon: Sparkles, permission: 'dashboard:read' },
            { name: 'Sales agents', href: '/crm/agents/inbox', icon: Bot, permission: 'dashboard:read' },
            { name: 'Agent activity', href: '/crm/agents/activity', icon: Bot, permission: 'dashboard:read' },
            { name: 'Inbox', href: '/crm/inbox', icon: Mail, permission: 'inbox:read' },
            { name: 'Notifications', href: '/crm/notifications', icon: Bell, permission: 'dashboard:read' },
        ],
    },
    {
        name: 'Inbound',
        items: [
            { name: 'Leads', href: '/crm/leads', icon: Users, permission: 'leads:read' },
            { name: 'Website leads', href: '/crm/website-leads', icon: Globe, permission: 'leads:read' },
            { name: 'Clients', href: '/crm/clients', icon: UserCheck, permission: 'clients:read', adminOnly: true },
            { name: 'Deals', href: '/crm/deals', icon: Handshake, permission: 'deals:read' },
        ],
    },
    {
        name: 'Outbound',
        items: [
            { name: 'Outreach', href: '/crm/outreach', icon: TrendingUp, permission: 'outreach:read' },
            { name: 'Email campaigns', href: '/crm/campaigns', icon: Mail, permission: 'outreach:read' },
            {
                name: 'Proposals',
                href: '/crm/proposals',
                icon: ScrollText,
                permission: 'proposals',
            },
            {
                name: 'Postmaster Health',
                href: '/crm/postmaster',
                icon: ShieldAlert,
                permission: 'settings:read',
            },
        ],
    },
    {
        name: 'Data',
        items: [
            { name: 'Companies', href: '/crm/organizations', icon: Building2, permission: 'organizations:read' },
            { name: 'Contacts', href: '/crm/contacts', icon: Contact, permission: 'contacts:read' },
            { name: 'Segments', href: '/crm/segments', icon: Layers, permission: 'leads:read' },
        ],
    },
    {
        name: 'Activities',
        items: [
            { name: 'Notes', href: '/crm/notes', icon: FileText, permission: 'activities:read' },
            { name: 'Tasks', href: '/crm/tasks', icon: CheckCircle, permission: 'activities:read' },
            { name: 'Call Logs', href: '/crm/calls', icon: PhoneCall, permission: 'activities:read' },
        ],
    },
    {
        name: 'Settings',
        items: [
            { name: 'Settings', href: '/crm/settings', icon: Settings, permission: 'settings:read' },
            { name: 'Users & access', href: '/crm/settings/users', icon: Users, permission: 'settings:admin' },
            { name: 'Roles', href: '/crm/settings/roles', icon: ShieldCheck, permission: 'settings:admin' },
        ],
    },
];

const pmGroups = [
    {
        name: 'Overview',
        items: [
            { name: 'Dashboard', href: '/pm/dashboard', icon: BarChart3, permission: 'workload:read' as const },
            { name: 'Reports', href: '/pm/reports', icon: LineChart, permission: 'workload:read' as const },
            { name: 'Virtual Office', href: '/pm/virtual-office', icon: PhoneCall, permission: 'pm:read' as const },
            { name: 'For you', href: '/pm/for-you', icon: Zap, permission: 'pm:read' as const },
            { name: 'My Tasks', href: '/pm/my-tasks', icon: CheckCircle, permission: 'pm:read' as const },
            { name: 'Boards', href: '/pm/boards', icon: Kanban, permission: 'boards:read' as const, matchBoardProject: true as const },
        ],
    },
    {
        name: 'Knowledge',
        items: [
            { name: 'Strategy Collection', href: '/pm/strategy', icon: Target, permission: 'workload:read' as const },
            { name: 'Wiki', href: '/pm/wiki', icon: FileText, permission: 'wiki:read' as const },
            { name: 'Plans', href: '/pm/plans', icon: Map, permission: 'pm:read' as const },
        ],
    },
    {
        name: 'Administration',
        items: [
            { name: 'Workload', href: '/pm/admin/workload', icon: Users, permission: 'workload:read' as const },
            { name: 'GitHub', href: '/pm/settings/github', icon: Github, permission: 'boards:read' as const },
        ],
    },
];

/** HRMS: overview uses `hrms:read` (any HRMS module); other items use StaffManagement module ids. */
const hrmsGroups = [
    {
        name: 'Overview',
        items: [
            { name: 'Dashboard', href: '/hrms/dashboard', icon: BarChart3, permission: 'dashboard' as const },
            { name: 'Virtual Office', href: '/hrms/virtual-office', icon: PhoneCall, permission: 'hrms:read' as const },
        ],
    },
    {
        name: 'People',
        items: [
            { name: 'Employees', href: '/hrms/employees', icon: Users, permission: 'hrms:read' as const },
            { name: 'Leaves', href: '/hrms/leaves', icon: Mail, permission: 'leaves' as const },
            { name: 'Short Duration Leave', href: '/hrms/leaves/short-duration', icon: Clock, permission: 'leaves' as const },
            { name: 'Holidays', href: '/hrms/holidays', icon: Calendar, permission: 'holidays' as const },
            { name: 'Timesheets', href: '/hrms/timesheets', icon: Clock, permission: 'timesheets' as const },
        ],
    },
    {
        name: 'Payroll & expenses',
        items: [
            { name: 'Payroll', href: '/hrms/payroll', icon: CircleDollarSign, permission: 'payroll' as const },
            { name: 'Expenses', href: '/hrms/expenses', icon: Receipt, permission: 'expenses' as const },
            { name: 'Benefits', href: '/hrms/benefits', icon: Heart, permission: 'benefits' as const },
        ],
    },
    {
        name: 'Talent',
        items: [
            { name: 'Recruitment', href: '/hrms/recruitment', icon: UserCircle, permission: 'recruitment' as const },
            { name: 'Career portal', href: '/career-portal', icon: Globe, permission: 'recruitment' as const },
            { name: 'LMS', href: '/hrms/lms', icon: BookOpen, permission: 'lms' as const },
        ],
    },
    {
        name: 'Workplace',
        items: [
            { name: 'Announcements', href: '/hrms/announcements', icon: Megaphone, permission: 'announcements' as const },
            { name: 'Notifications', href: '/hrms/notifications', icon: Bell, permission: 'notifications' as const },
            { name: 'Company policies', href: '/hrms/policies', icon: FileText, permission: 'hrms:read' as const },
            { name: 'SOPs', href: '/hrms/sops', icon: ClipboardList, permission: 'sops' as const },
            { name: 'My Vault', href: '/hrms/my-vault', icon: KeyRound, permission: 'vault' as const },
        ],
    },
    {
        name: 'Administration',
        items: [
            { name: 'HR Admin', href: '/hrms/hr-settings', icon: ShieldCheck, permission: 'hrms:admin' as const },
            { name: 'Role Manager', href: '/hrms/roles', icon: Users, permission: 'hrms:admin' as const },
            { name: 'Audit Logs', href: '/hrms/audit-logs', icon: ClipboardList, permission: 'hrms:admin' as const },
            { name: 'Tech Services', href: '/hrms/tech-services', icon: Server, permission: 'tech-services:read' as const },
        ],
    },
];

const SUITE_SIDEBAR_COLLAPSED_KEY = 'suiteSidebarCollapsed';
const SUITE_SIDEBAR_PINNED_KEY = 'suiteSidebarPinned';
const SUITE_SIDEBAR_WIDTH_EXPANDED = '15rem';
const SUITE_SIDEBAR_WIDTH_COLLAPSED = '4rem';

function readSuiteSidebarPinned(): boolean {
    if (typeof window === 'undefined') return true;
    const pinned = localStorage.getItem(SUITE_SIDEBAR_PINNED_KEY);
    if (pinned !== null) return pinned === 'true';
    const legacy = localStorage.getItem(SUITE_SIDEBAR_COLLAPSED_KEY);
    if (legacy !== null) return legacy === 'false';
    return true;
}

function persistSuiteSidebarState(pinned: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SUITE_SIDEBAR_PINNED_KEY, String(pinned));
    localStorage.setItem(SUITE_SIDEBAR_COLLAPSED_KEY, String(!pinned));
    window.dispatchEvent(
        new CustomEvent('suite-sidebar:state', {
            detail: { collapsed: !pinned, pinned },
        }),
    );
}

export default function Sidebar({
    mobileOpen = false,
    onMobileClose,
    isPinned: controlledIsPinned,
    isHovered: controlledIsHovered,
    onPinnedChange,
    onHoveredChange,
}: {
    mobileOpen?: boolean;
    onMobileClose?: () => void;
    isPinned?: boolean;
    isHovered?: boolean;
    onPinnedChange?: (pinned: boolean) => void;
    onHoveredChange?: (hovered: boolean) => void;
}) {
    const pathname = usePathname();
    const { hasAccess, isAdmin, hasExecutiveAccess, permittedTools, permissions } = usePermissions();
    
    const [localIsPinned, setLocalIsPinned] = useState(readSuiteSidebarPinned);
    const isPinned = controlledIsPinned !== undefined ? controlledIsPinned : localIsPinned;
    const setIsPinned = onPinnedChange || setLocalIsPinned;

    const [localIsHovered, setLocalIsHovered] = useState(false);
    const isHovered = controlledIsHovered !== undefined ? controlledIsHovered : localIsHovered;
    const setIsHovered = onHoveredChange || setLocalIsHovered;

    const isExpanded = mobileOpen || isPinned || isHovered;
    const isCollapsed = !isExpanded;

    const [unreadNavCount, setUnreadNavCount] = useState(0);
    const [agentPendingCount, setAgentPendingCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const fetchAgentPending = async () => {
            try {
                const count = await fetchSalesAgentPendingCount();
                if (!cancelled) setAgentPendingCount(count);
            } catch {
                if (!cancelled) setAgentPendingCount(0);
            }
        };
        fetchAgentPending();
        const interval = window.setInterval(fetchAgentPending, 120000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [pathname]);

    useEffect(() => {
        let cancelled = false;
        const fetchUnread = async () => {
            try {
                const res = await api.get('/notifications/unread-count');
                const count = typeof res.data === 'number' ? res.data : Number(res.data?.count || 0);
                if (!cancelled) setUnreadNavCount(Number.isFinite(count) ? count : 0);
            } catch {
                if (!cancelled) setUnreadNavCount(0);
            }
        };
        fetchUnread();
        const interval = window.setInterval(fetchUnread, 120000);
        const refresh = () => fetchUnread();
        window.addEventListener('notifications:refresh', refresh);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
            window.removeEventListener('notifications:refresh', refresh);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(
            new CustomEvent('suite-sidebar:state', {
                detail: { collapsed: isCollapsed, pinned: isPinned },
            }),
        );
        document.documentElement.style.setProperty(
            '--suite-sidebar-width',
            isExpanded ? SUITE_SIDEBAR_WIDTH_EXPANDED : SUITE_SIDEBAR_WIDTH_COLLAPSED,
        );
    }, [isCollapsed, isPinned, isExpanded]);

    useEffect(() => {
        const expandForTour = () => {
            setIsPinned(true);
            persistSuiteSidebarState(true);
        };
        window.addEventListener(TOUR_PREPARE_EVENT, expandForTour);
        return () => window.removeEventListener(TOUR_PREPARE_EVENT, expandForTour);
    }, []);

    const toggleSidebar = () => {
        const next = !isPinned;
        // If collapsing, clear hover so sidebar doesn't stay expanded
        if (!next) setIsHovered(false);
        setIsPinned(next);
        persistSuiteSidebarState(next);
    };

    const activeToolId = useMemo(() => {
        if (pathname.startsWith('/client-portals')) return 'client-portals';
        return 'crm';
    }, [pathname]);

    const visibleTools = useMemo(() => {
        return tools.filter((t) => {
            if (isAdmin) return true;
            if (t.id === 'client-portals') {
                return hasAccess('clients:read');
            }
            return (
                Array.isArray(permittedTools) &&
                permittedTools.some((p) => p?.toUpperCase() === 'CRM')
            );
        });
    }, [isAdmin, permittedTools, hasAccess]);

    const activeTool = visibleTools.find((t) => t.id === activeToolId) ?? visibleTools[0];
    const ActiveToolIcon = activeTool?.icon;
    const canManageEmployees = isAdmin || hasAccess('employees:edit') || hasAccess('employees:delete') || hasAccess('employees:write');

    const activeToolName = tools.find(t => t.id === activeToolId)?.name || '2Bigha';
    const suiteNavGroups =
        activeToolId === 'client-portals' && visibleTools.some((t) => t.id === 'client-portals')
            ? clientPortalGroups
            : crmGroups;

    return (
        <>
            <div
                className={cn(
                    mobileOpen
                        ? "fixed inset-0 z-50 block lg:relative lg:z-40 lg:h-full lg:shrink-0"
                        : "hidden lg:block lg:relative lg:z-40 lg:h-full lg:shrink-0"
                )}
                style={mobileOpen ? undefined : {
                    width: isPinned ? SUITE_SIDEBAR_WIDTH_EXPANDED : SUITE_SIDEBAR_WIDTH_COLLAPSED,
                    minWidth: isPinned ? SUITE_SIDEBAR_WIDTH_EXPANDED : SUITE_SIDEBAR_WIDTH_COLLAPSED,
                    maxWidth: isPinned ? SUITE_SIDEBAR_WIDTH_EXPANDED : SUITE_SIDEBAR_WIDTH_COLLAPSED,
                    transition: 'width 300ms cubic-bezier(0.2, 0.8, 0.2, 1), min-width 300ms cubic-bezier(0.2, 0.8, 0.2, 1), max-width 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
            >
                {/* Mobile Sidebar Backdrop overlay */}
                {mobileOpen && (
                    <div
                        onClick={onMobileClose}
                        className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-in fade-in duration-200"
                    />
                )}
                <div
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    className={cn(
                        'crm-suite-sidebar pm-jira-font flex flex-col border-r border-[color:var(--suite-sidebar-border)] bg-[var(--suite-sidebar-bg)] text-[color:var(--suite-sidebar-fg)]',
                        jiraSidebarChrome.rail,
                        mobileOpen
                            ? 'fixed inset-y-0 left-0 z-50 shadow-2xl animate-in slide-in-from-left duration-200'
                            : 'absolute left-0 top-0 h-full z-40 border-r border-slate-200/50 dark:border-zinc-800/50 transition-shadow duration-200',
                        isHovered && !isPinned && 'shadow-xl'
                    )}
                    style={
                        mobileOpen
                            ? { width: SUITE_SIDEBAR_WIDTH_EXPANDED }
                            : {
                                width: isExpanded ? SUITE_SIDEBAR_WIDTH_EXPANDED : SUITE_SIDEBAR_WIDTH_COLLAPSED,
                                transition: 'width 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                            }
                    }
                >
            {/* Navigation Menu */}
            <nav
                data-tour="sidebar-nav"
                className={jiraSidebarChrome.nav}
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.2) transparent' }}
            >
                {!isCollapsed && (
                    <p className={jiraSidebarChrome.navProductLabel}>
                        {activeToolName}
                    </p>
                )}
                {suiteNavGroups.map((group, groupIdx) => {
                    const normalizedItems = group.items;
                    const filteredItems = normalizedItems.filter((item) => {
                        if ('adminOnly' in item && item.adminOnly && !isAdmin) return false;
                        return hasAccess(item.permission);
                    });
                    if (filteredItems.length === 0) return null;
                    return (
                        <div key={group.name} className={jiraSidebarChrome.navSection}>
                            {!isCollapsed && (
                                <p className={jiraSidebarChrome.navSectionLabel}>
                                    {group.name}
                                </p>
                            )}
                            <div className="space-y-0.5">
                                {filteredItems.map((item) => {
                                    const Icon = item.icon;
                                    const isActive =
                                        pathname === item.href || pathname.startsWith(item.href + '/');
                                    const locked = item.name === 'Employees' ? false : !hasAccess(item.permission);
                                    const showAgentPill =
                                        item.name === 'Sales agents' && agentPendingCount > 0;
                                    const showUnreadPill =
                                        !locked &&
                                        (
                                            item.name === 'Inbox' ||
                                            item.name === 'Notifications'
                                        ) &&
                                        unreadNavCount > 0;
                                    return (
                                        <div key={item.name} className="relative group">
                                            <Link
                                                href={locked ? '#' : item.href}
                                                prefetch={false}
                                                title={isCollapsed ? item.name : undefined}
                                                onClick={(e) => {
                                                    if (locked) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                    onMobileClose?.();
                                                }}
                                                className={cn(
                                                    'crm-hs-nav-item',
                                                    jiraSidebarChrome.navItem,
                                                    isActive && jiraSidebarChrome.navItemActive,
                                                    locked && jiraSidebarChrome.navItemLocked,
                                                    isCollapsed && jiraSidebarChrome.navItemCollapsed,
                                                    !isActive && !locked && 'text-[#42526e]',
                                                )}
                                            >
                                                <Icon
                                                    className={cn(
                                                        NAV_ICON_CLASS,
                                                        isActive ? 'text-[#0c66e4]' : 'text-[#5e6c84]',
                                                    )}
                                                    strokeWidth={isActive ? 2 : 1.75}
                                                />
                                                {!isCollapsed && <span className="truncate">{item.name}</span>}
                                                {showAgentPill && !isCollapsed ? (
                                                    <span className="ml-auto inline-flex min-w-[16px] items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-black text-white">
                                                        {agentPendingCount > 99 ? '99+' : agentPendingCount}
                                                    </span>
                                                ) : null}
                                                {showUnreadPill && !isCollapsed ? (
                                                    <span className="ml-auto inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--hs-link)] px-1 text-[9px] font-black text-white">
                                                        {unreadNavCount > 99 ? '99+' : unreadNavCount}
                                                    </span>
                                                ) : null}
                                                {locked && !isCollapsed && <LockIcon size={12} className="ml-auto text-[color:var(--suite-sidebar-muted)]" />}
                                            </Link>
                                            {locked && (
                                                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 w-48 bg-[#111827] text-white text-xs p-2 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none">
                                                    Access restricted. Contact your administrator.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className={jiraSidebarChrome.footer}>
                <div className="flex items-center gap-2 text-xs text-[#5e6c84]">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-[#36b37e]" />
                    {!isCollapsed && <span className="font-medium">System online</span>}
                </div>
            </div>
            </div>

        </div>
        </>
    );
}


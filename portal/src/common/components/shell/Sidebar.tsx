"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
import { crmSidebarChrome } from '@/lib/crm/shell';
import {
    leadReportNavRoutes,
    reportNavRoutes,
    workspaceNavRoutes,
} from '@/lib/crm/shared/dashboard-routes';
import {
    canAccessAnyReport,
    canAccessAnyWorkspace,
    canAccessCrmDashboardPage,
} from '@/lib/crm/shared/dashboard-access';
import { CrmNavIcon } from '@/lib/crm/shared/icons';

function suiteNavHasAccess(
    hasAccess: (permission: string) => boolean,
    permission: string,
): boolean {
    return (
        canAccessCrmDashboardPage(hasAccess, permission) ||
        hasAccess(permission)
    );
}
import { MathionixSuiteSidebarBrand } from '@/components/suite/shell/MathionixBrand';
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
    ListChecks,
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
    Package,
    Heart,
    Globe,
    MessageCircle,
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
    Headphones,
    Target,
    ClipboardCheck,
    ChevronDown,
    ListTodo,
    Activity,
    GitBranch,
} from 'lucide-react';
import { suiteSidebarChrome } from '@/components/suite/shell/sidebar-chrome';

const NAV_ICON_CLASS = 'h-3.5 w-3.5';

type NavIconComponent = ComponentType<{
    className?: string;
    size?: number;
    strokeWidth?: number;
}>;

/** Global nav glyph: light chip when idle, solid primary tile when active. */
function SuiteNavIcon({
    Icon,
    active,
    iconBox,
    iconBoxActive,
}: {
    Icon: NavIconComponent;
    active: boolean;
    iconBox: string;
    iconBoxActive: string;
}) {
    return (
        <span className={active ? iconBoxActive : iconBox} aria-hidden>
            <Icon
                className={cn(NAV_ICON_CLASS, active ? 'text-white' : undefined)}
                strokeWidth={active ? 2 : 1.75}
            />
        </span>
    );
}

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

export type SuiteToolId = 'crm' | 'client-portals' | 'executive' | 'hrms' | 'pm' | 'social' | 'vault';

export type SuiteTool = {
    id: SuiteToolId;
    name: string;
    tagline: string;
    href: string;
    icon: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
    logoClass: string;
    logoClassIdle: string;
};

/** CRM-only product switcher — HRMS / PM / Social / etc. removed from this repo. */
export const tools: SuiteTool[] = [
    {
        id: 'crm',
        name: 'CRM',
        tagline: 'Pipeline, clients & activities',
        href: '/crm/workspace/work',
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

/**
 * CRM sidebar IA — grouped by job-to-be-done (not by route family):
 * Work = daily ops dashboards · Engage = messaging/tasks · Reports = analytics ·
 * Sales AI = copilots/agents · Records = CRM objects · Outreach = campaigns/tools.
 */
const REPORT_NAV_ICONS: Record<string, typeof CrmNavIcon.BarChart> = {
    overview: CrmNavIcon.BarChart,
    leads: CrmNavIcon.Leads,
    'leads-funnel': CrmNavIcon.Leads,
    'leads-aging': CrmNavIcon.Activity,
    'leads-conversion': CrmNavIcon.TrendingUp,
    email: CrmNavIcon.Mail,
    forecast: CrmNavIcon.Deals,
    health: CrmNavIcon.Activity,
    revenue: CrmNavIcon.TrendingUp,
};

const LEAD_REPORT_SLUGS = new Set<string>(leadReportNavRoutes().map((r) => r.slug));

/** CRM Reports sidebar: nest lead report pages under a collapsible "Leads" group. */
const reportNavChildren = (() => {
    const leadChildren = leadReportNavRoutes().map((r) => ({
        name: r.label,
        href: r.href,
        icon: REPORT_NAV_ICONS[r.slug] ?? CrmNavIcon.Analytics,
        permission: r.permission,
    }));
    const items: Array<{
        name: string;
        href: string;
        icon: (typeof REPORT_NAV_ICONS)[string];
        permission: string;
        children?: typeof leadChildren;
    }> = [];
    let leadsInserted = false;
    for (const r of reportNavRoutes()) {
        if (LEAD_REPORT_SLUGS.has(r.slug)) {
            if (!leadsInserted) {
                items.push({
                    name: 'Leads',
                    href: leadChildren[0]?.href ?? '/crm/reports/leads',
                    icon: CrmNavIcon.Leads,
                    permission: 'reports-leads:read',
                    children: leadChildren,
                });
                leadsInserted = true;
            }
            continue;
        }
        items.push({
            name: r.label,
            href: r.href,
            icon: REPORT_NAV_ICONS[r.slug] ?? CrmNavIcon.Analytics,
            permission: r.permission,
        });
    }
    return items;
})();

const DASHBOARD_NAV_ICONS: Record<string, typeof CrmNavIcon.Dashboard> = {
    work: CrmNavIcon.Tasks,
    summary: CrmNavIcon.Dashboard,
    deals: CrmNavIcon.Deals,
    prospecting: CrmNavIcon.Leads,
    growth: CrmNavIcon.BarChart,
    calls: CrmNavIcon.Phone,
};

const dashboardNavChildren = workspaceNavRoutes().map((r) => ({
    name: r.label,
    href: r.href,
    icon: DASHBOARD_NAV_ICONS[r.slug] ?? CrmNavIcon.Dashboard,
    permission: r.permission,
}));

const crmGroups = [
    {
        name: 'Work',
        items: [
            {
                name: 'Dashboard',
                href: '/crm/workspace/work',
                icon: CrmNavIcon.Dashboard,
                permission: 'dashboard:read',
                children: dashboardNavChildren,
            },
            {
                name: 'Action queue',
                href: '/crm/workspace/work-queue',
                icon: CrmNavIcon.ListTodo,
                permission: 'workspace-work:read',
            },
            {
                name: 'Engage',
                href: '/crm/inbox',
                icon: CrmNavIcon.Applications,
                permission: 'dashboard:read',
                children: [
                    { name: 'Inbox', href: '/crm/inbox', icon: CrmNavIcon.Mail, permission: 'inbox:read' },
                    { name: 'Calendar', href: '/crm/workspace/calendar', icon: CrmNavIcon.Calendar, permission: 'workspace-calendar:read' },
                    { name: 'Call Workspace', href: '/crm/workspace/calls', icon: CrmNavIcon.Phone, permission: 'workspace-calls:read' },
                    { name: 'Notes', href: '/crm/notes', icon: CrmNavIcon.Notes, permission: 'activities:read' },
                    { name: 'Task board', href: '/crm/tasks', icon: CrmNavIcon.CheckCircle, permission: 'activities:read' },
                    { name: 'Call Logs', href: '/crm/calls', icon: CrmNavIcon.Phone, permission: 'activities:read' },
                    { name: 'Notifications', href: '/crm/notifications', icon: CrmNavIcon.Bell, permission: 'dashboard:read' },
                ],
            },
        ],
    },
    {
        name: 'Reports',
        items: [
            {
                name: 'Reports',
                href: '/crm/reports/overview',
                icon: CrmNavIcon.Analytics,
                permission: 'dashboard:read',
                children: reportNavChildren,
            },
        ],
    },
    {
        name: 'Sales AI',
        items: [
            {
                name: 'Sales AI',
                href: '/crm/copilot',
                icon: CrmNavIcon.Bot,
                permission: 'dashboard:read',
                children: [
                    { name: 'Sales Copilot', href: '/crm/copilot', icon: CrmNavIcon.Bot, permission: 'dashboard:read' },
                    { name: 'Data intelligence', href: '/crm/intelligence', icon: CrmNavIcon.Sparkles, permission: 'dashboard:read' },
                    { name: 'Sales agents', href: '/crm/agents/inbox', icon: CrmNavIcon.Bot, permission: 'dashboard:read' },
                    { name: 'Agent activity', href: '/crm/agents/activity', icon: CrmNavIcon.Bot, permission: 'dashboard:read' },
                ],
            },
        ],
    },
    {
        name: 'Records',
        items: [
            { name: 'Contacts', href: '/crm/contacts', icon: CrmNavIcon.Contacts, permission: 'contacts:read' },
            { name: 'Companies', href: '/crm/organizations', icon: CrmNavIcon.Companies, permission: 'organizations:read' },
            { name: 'Deals', href: '/crm/deals', icon: CrmNavIcon.Deals, permission: 'deals:read' },
            { name: 'Leads', href: '/crm/leads', icon: CrmNavIcon.Leads, permission: 'leads:read' },
            { name: 'Website leads', href: '/crm/website-leads', icon: CrmNavIcon.World, permission: 'leads:read' },
            { name: 'Clients', href: '/crm/clients', icon: CrmNavIcon.UserCheck, permission: 'clients:read', adminOnly: true },
            { name: 'Segments', href: '/crm/segments', icon: CrmNavIcon.Layers, permission: 'leads:read' },
        ],
    },
    {
        name: 'Outreach',
        items: [
            {
                name: 'Proposals',
                href: '/crm/proposals',
                icon: CrmNavIcon.Proposals,
                permission: 'proposals:read',
            },
            {
                name: 'Contracts',
                href: '/crm/contracts',
                icon: CrmNavIcon.FileText,
                permission: 'proposals:read',
            },
            { name: 'Outreach', href: '/crm/outreach', icon: CrmNavIcon.Activities, permission: 'outreach:read' },
            { name: 'Email campaigns', href: '/crm/campaigns', icon: CrmNavIcon.Mail, permission: 'outreach:read' },
        ],
    },
    {
        name: 'Settings',
        items: [
            { name: 'Settings', href: '/crm/settings', icon: CrmNavIcon.Settings, permission: 'settings:read' },
            { name: 'Users & access', href: '/crm/settings/users', icon: CrmNavIcon.Users, permission: 'settings:admin' },
            { name: 'Roles', href: '/crm/settings/roles', icon: CrmNavIcon.UsersGroup, permission: 'settings:admin' },
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
            { name: 'Employees', href: '/hrms/employees', icon: Users, permission: 'employees:read' as const },
            { name: 'Attendance', href: '/hrms/attendance', icon: UserCheck, permission: 'attendance:read' as const },
            { name: 'Leaves', href: '/hrms/leaves', icon: Mail, permission: 'leaves' as const },
            { name: 'Short Duration Leave', href: '/hrms/leaves/short-duration', icon: Clock, permission: 'leaves' as const },
            { name: 'Holidays', href: '/hrms/holidays', icon: Calendar, permission: 'holidays' as const },
            { name: 'Timesheets', href: '/hrms/timesheets', icon: Clock, permission: 'timesheets' as const },
        ],
    },
    {
        name: 'Payroll & Finance',
        items: [
            {
                name: 'Payroll',
                href: '/hrms/payroll',
                icon: CircleDollarSign,
                permission: 'payroll:read',
                children: [
                    { name: 'Payroll hub', href: '/hrms/payroll', icon: CircleDollarSign, permission: 'payroll:read' },
                    { name: 'Payslips', href: '/hrms/payroll/slips', icon: CircleDollarSign, permission: 'payroll-slips:read' },
                    { name: 'Structures', href: '/hrms/payroll/structures', icon: CircleDollarSign, permission: 'payroll-structures:read' },
                    { name: 'Components', href: '/hrms/payroll/components', icon: CircleDollarSign, permission: 'payroll-structures:read' },
                    { name: 'Advances', href: '/hrms/payroll/advances', icon: CircleDollarSign, permission: 'payroll-advances:read' },
                    { name: 'Full & final', href: '/hrms/payroll/fnf', icon: CircleDollarSign, permission: 'payroll-settlements:read' },
                    { name: 'Gratuity', href: '/hrms/payroll/gratuity', icon: CircleDollarSign, permission: 'payroll-settlements:read' },
                    { name: 'My payslips', href: '/hrms/payroll/slips', icon: CircleDollarSign, permission: 'payroll-self:read' },
                ],
            },
            { name: 'Expenses', href: '/hrms/expenses', icon: Receipt, permission: 'expenses' as const },
            { name: 'Benefits', href: '/hrms/benefits', icon: Heart, permission: 'benefits' as const },
        ],
    },
    {
        name: 'Talent',
        items: [
            { name: 'Recruitment', href: '/hrms/recruitment', icon: UserCircle, permission: 'recruitment' as const },
            { name: 'Onboarding', href: '/hrms/onboarding', icon: ClipboardCheck, permission: 'onboarding' as const },
            { name: 'Career portal', href: '/career-portal', icon: Globe, permission: 'recruitment' as const },
            { name: 'LMS', href: '/hrms/lms', icon: BookOpen, permission: 'lms' as const },
        ],
    },
    {
        name: 'Operations',
        items: [
            { name: 'Assets', href: '/hrms/assets', icon: Package, permission: 'assets' as const },
            { name: 'Helpdesk', href: '/hrms/helpdesk', icon: Headphones, permission: 'helpdesk' as const },
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
        name: 'Insights',
        items: [
            { name: 'Analytics', href: '/hrms/analytics', icon: LineChart, permission: 'analytics' as const },
            { name: 'Reports', href: '/hrms/reports', icon: ScrollText, permission: 'reports' as const },
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
const SUITE_SIDEBAR_WIDTH_EXPANDED_DEFAULT = '15rem';
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

function readCrmExpandedSidebarWidth(): string {
    if (typeof window === 'undefined') return SUITE_SIDEBAR_WIDTH_EXPANDED_DEFAULT;
    try {
        // Lazy import avoided — prefs live in localStorage under the same key as Theme Customizer.
        const raw = localStorage.getItem('crm-theme-prefs');
        if (!raw) return SUITE_SIDEBAR_WIDTH_EXPANDED_DEFAULT;
        const parsed = JSON.parse(raw) as { sidebarWidthRem?: number };
        const rem = typeof parsed.sidebarWidthRem === 'number' ? parsed.sidebarWidthRem : 15;
        const clamped = Math.min(22, Math.max(14, Math.round(rem)));
        return `${clamped}rem`;
    } catch {
        return SUITE_SIDEBAR_WIDTH_EXPANDED_DEFAULT;
    }
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
    const router = useRouter();
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
    /** Collapsible sidebar menus — closed by default; toggled by click. */
    const [openNavMenus, setOpenNavMenus] = useState<Record<string, boolean>>({});
    /** CRM Theme Customizer — expanded rail width (other tools keep default). */
    const [crmExpandedWidth, setCrmExpandedWidth] = useState(SUITE_SIDEBAR_WIDTH_EXPANDED_DEFAULT);

    const toggleNavMenu = (key: string) => {
        setOpenNavMenus((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    useEffect(() => {
        setCrmExpandedWidth(readCrmExpandedSidebarWidth());
        const onWidth = (e: Event) => {
            const rem = (e as CustomEvent<{ widthRem?: number }>).detail?.widthRem;
            if (typeof rem === 'number' && Number.isFinite(rem)) {
                const clamped = Math.min(22, Math.max(14, Math.round(rem)));
                setCrmExpandedWidth(`${clamped}rem`);
            } else {
                setCrmExpandedWidth(readCrmExpandedSidebarWidth());
            }
        };
        window.addEventListener('suite-sidebar:width', onWidth);
        return () => window.removeEventListener('suite-sidebar:width', onWidth);
    }, []);

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
        queueMicrotask(() => {
            window.dispatchEvent(
                new CustomEvent('suite-sidebar:state', {
                    detail: { collapsed: isCollapsed, pinned: isPinned },
                }),
            );
        });
    }, [isCollapsed, isPinned]);

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

    const activeToolId = useMemo((): SuiteToolId => {
        if (pathname.startsWith('/client-portals')) return 'client-portals';
        return 'crm';
    }, [pathname]);

    /** CRM Theme Customizer width; other suite tools keep the default rail. */
    const expandedWidth =
        activeToolId === 'crm' ? crmExpandedWidth : SUITE_SIDEBAR_WIDTH_EXPANDED_DEFAULT;

    useEffect(() => {
        if (typeof window === 'undefined') return;
        document.documentElement.style.setProperty(
            '--suite-sidebar-width',
            isExpanded ? expandedWidth : SUITE_SIDEBAR_WIDTH_COLLAPSED,
        );
    }, [isExpanded, expandedWidth]);

    /** CRM-only rail chrome. */
    const navChrome =
        activeToolId === 'crm' ? crmSidebarChrome : jiraSidebarChrome;
    const idleNavText = 'text-[var(--text-main,#1f2020)]';
    const idleIconCls = 'text-[var(--text-muted,#6b7280)]';
    const openParentBg = 'bg-[var(--suite-sidebar-hover,#f7f8f9)]';
    const subBorderCls = 'border-[var(--border-color,#e2e8f0)]';
    const iconBox = navChrome.navIconBox ?? suiteSidebarChrome.navIconBox;
    const iconBoxActive = navChrome.navIconBoxActive ?? suiteSidebarChrome.navIconBoxActive;
    const visibleTools = useMemo(() => {
        return tools.filter((t) => {
            if (isAdmin) return true;
            if (t.id === 'client-portals') {
                return hasAccess('clients:read');
            }
            const hasExplicitTool =
                Array.isArray(permittedTools) &&
                permittedTools.some((p) => p?.toUpperCase() === t.id.toUpperCase());
            return hasExplicitTool || t.id === 'crm';
        });
    }, [isAdmin, permittedTools, hasAccess]);

    const activeTool = visibleTools.find((t) => t.id === activeToolId) ?? visibleTools[0];
    const ActiveToolIcon = activeTool?.icon;


    const activeToolName = tools.find(t => t.id === activeToolId)?.name || 'Mathionix Technologies';
    const suiteNavGroups =
        activeToolId === 'crm' && visibleTools.some(t => t.id === 'crm')
            ? crmGroups
            : activeToolId === 'client-portals' && visibleTools.some(t => t.id === 'client-portals')
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
                    width: isPinned ? expandedWidth : SUITE_SIDEBAR_WIDTH_COLLAPSED,
                    minWidth: isPinned ? expandedWidth : SUITE_SIDEBAR_WIDTH_COLLAPSED,
                    maxWidth: isPinned ? expandedWidth : SUITE_SIDEBAR_WIDTH_COLLAPSED,
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
                        'crm-suite-sidebar flex flex-col border-r border-[color:var(--suite-sidebar-border)] bg-[var(--suite-sidebar-bg)] text-[color:var(--suite-sidebar-fg)]',
                        navChrome.rail,
                        mobileOpen
                            ? 'fixed inset-y-0 left-0 z-50 shadow-2xl animate-in slide-in-from-left duration-200'
                            : 'absolute left-0 top-0 h-full z-40 border-r border-slate-200/50 dark:border-zinc-800/50 transition-shadow duration-200',
                        isHovered && !isPinned && 'shadow-xl'
                    )}
                    style={
                        mobileOpen
                            ? { width: expandedWidth }
                            : {
                                width: isExpanded ? expandedWidth : SUITE_SIDEBAR_WIDTH_COLLAPSED,
                                transition: 'width 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                            }
                    }
                >
            {/* Navigation Menu */}
            <nav
                data-tour="sidebar-nav"
                className={navChrome.nav}
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.2) transparent' }}
            >
                {!isCollapsed && (
                    <p className={navChrome.navProductLabel}>
                        {activeToolName}
                    </p>
                )}
                {suiteNavGroups.map((group, groupIdx) => {
                    const normalizedItems = group.items.map((item) => item);
                    const filteredItems = normalizedItems.filter((item) => {
                        if ('adminOnly' in item && item.adminOnly && !isAdmin) return false;
                        const childList =
                            'children' in item && Array.isArray(item.children) ? item.children : [];
                        if (childList.length > 0) {
                            const childVisible = (child: {
                                permission: string;
                                children?: Array<{ permission: string }>;
                            }) => {
                                const grand =
                                    'children' in child && Array.isArray(child.children)
                                        ? child.children
                                        : [];
                                if (grand.length > 0) {
                                    return (
                                        grand.some((gc) => suiteNavHasAccess(hasAccess, gc.permission)) ||
                                        suiteNavHasAccess(hasAccess, child.permission)
                                    );
                                }
                                return suiteNavHasAccess(hasAccess, child.permission);
                            };
                            if (childList.some(childVisible)) return true;
                            if (item.name === 'Dashboard') {
                                return canAccessAnyWorkspace(hasAccess);
                            }
                            if (item.name === 'Reports') {
                                return canAccessAnyReport(hasAccess);
                            }
                            return hasAccess(item.permission);
                        }
                        return suiteNavHasAccess(hasAccess, item.permission);
                    });
                    if (filteredItems.length === 0) return null;
                    return (
                        <div key={group.name} className={navChrome.navSection}>
                            {!isCollapsed && (
                                <p className={navChrome.navSectionLabel}>
                                    {group.name}
                                </p>
                            )}
                            <div className="space-y-0.5">
                                {filteredItems.map((item) => {
                                    const Icon = item.icon;
                                    const children =
                                        'children' in item && Array.isArray(item.children)
                                            ? item.children.filter((child) => {
                                                  const grand =
                                                      'children' in child &&
                                                      Array.isArray(child.children)
                                                          ? child.children
                                                          : [];
                                                  if (grand.length > 0) {
                                                      return (
                                                          grand.some((gc: { permission: string }) =>
                                                              suiteNavHasAccess(
                                                                  hasAccess,
                                                                  gc.permission,
                                                              ),
                                                          ) ||
                                                          suiteNavHasAccess(
                                                              hasAccess,
                                                              child.permission,
                                                          )
                                                      );
                                                  }
                                                  return suiteNavHasAccess(
                                                      hasAccess,
                                                      child.permission,
                                                  );
                                              })
                                            : [];
                                    const hasChildren = children.length > 0;
                                    const menuKey = `${group.name}:${item.name}`;
                                    const isNavPathActive = (href: string) =>
                                        pathname === href || pathname.startsWith(`${href}/`);
                                    const childActive = children.some((child) => {
                                        if (
                                            'children' in child &&
                                            Array.isArray(child.children) &&
                                            child.children.length > 0
                                        ) {
                                            return child.children.some((gc: { href: string }) =>
                                                isNavPathActive(gc.href),
                                            );
                                        }
                                        return isNavPathActive(child.href);
                                    });
                                    const menuOpen = !!openNavMenus[menuKey];

                                    if (hasChildren) {
                                        const locked =
                                            !hasAccess(item.permission) &&
                                            !(
                                                item.name === 'Dashboard' &&
                                                canAccessAnyWorkspace(hasAccess)
                                            ) &&
                                            !(
                                                item.name === 'Reports' &&
                                                canAccessAnyReport(hasAccess)
                                            ) &&
                                            children.length === 0;
                                        const showAgentPill =
                                            !locked &&
                                            children.some((c) => c.name === 'Sales agents') &&
                                            agentPendingCount > 0;
                                        return (
                                            <div key={item.name} className="space-y-0.5">
                                                <button
                                                    type="button"
                                                    title={isCollapsed ? item.name : undefined}
                                                    disabled={locked}
                                                    onClick={() => {
                                                        if (locked) return;
                                                        if (isCollapsed) {
                                                            // Collapsed rail: jump to first leaf child
                                                            const first = children[0];
                                                            const nested =
                                                                first &&
                                                                'children' in first &&
                                                                Array.isArray(first.children) &&
                                                                first.children[0]
                                                                    ? first.children[0].href
                                                                    : null;
                                                            const dest = nested || first?.href || item.href;
                                                            if (dest) router.push(dest);
                                                            onMobileClose?.();
                                                            return;
                                                        }
                                                        toggleNavMenu(menuKey);
                                                    }}
                                                    className={cn(
                                                        'crm-hs-nav-item w-full',
                                                        navChrome.navItem,
                                                        (menuOpen || childActive) && !isCollapsed && openParentBg,
                                                        childActive && navChrome.navItemActive,
                                                        locked && navChrome.navItemLocked,
                                                        isCollapsed && navChrome.navItemCollapsed,
                                                        !childActive && !locked && idleNavText,
                                                    )}
                                                >
                                                    <SuiteNavIcon
                                                        Icon={Icon}
                                                        active={!!childActive}
                                                        iconBox={iconBox}
                                                        iconBoxActive={iconBoxActive}
                                                    />
                                                    {!isCollapsed && (
                                                        <>
                                                            <span className="truncate flex-1 text-left">{item.name}</span>
                                                            {showAgentPill ? (
                                                                <span className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-black text-white">
                                                                    {agentPendingCount > 99 ? '99+' : agentPendingCount}
                                                                </span>
                                                            ) : null}
                                                            <ChevronDown
                                                                className={cn(
                                                                    'h-3.5 w-3.5 shrink-0 transition-transform',
                                                                    idleIconCls,
                                                                    !menuOpen && '-rotate-90',
                                                                )}
                                                            />
                                                        </>
                                                    )}
                                                </button>
                                                {menuOpen && !isCollapsed && !locked ? (
                                                    <div className={cn('ml-3 space-y-0.5 border-l pl-2', subBorderCls)}>
                                                        {(() => {
                                                            const leafHrefs = children.flatMap((c) => {
                                                                if (
                                                                    'children' in c &&
                                                                    Array.isArray(c.children) &&
                                                                    c.children.length > 0
                                                                ) {
                                                                    return c.children.map(
                                                                        (gc: { href: string }) => gc.href,
                                                                    );
                                                                }
                                                                return [c.href];
                                                            });
                                                            const activeChildHref =
                                                                leafHrefs
                                                                    .filter(isNavPathActive)
                                                                    .sort((a, b) => b.length - a.length)[0] ?? null;
                                                            return children.map((child) => {
                                                            const nestedChildren =
                                                                'children' in child &&
                                                                Array.isArray(child.children)
                                                                    ? child.children.filter((gc: { permission: string }) =>
                                                                          suiteNavHasAccess(
                                                                              hasAccess,
                                                                              gc.permission,
                                                                          ),
                                                                      )
                                                                    : [];
                                                            const hasNested = nestedChildren.length > 0;

                                                            if (hasNested) {
                                                                const nestedKey = `${menuKey}:${child.name}`;
                                                                const nestedActive = nestedChildren.some(
                                                                    (gc: { href: string }) =>
                                                                        isNavPathActive(gc.href),
                                                                );
                                                                const nestedOpen = !!openNavMenus[nestedKey];
                                                                const NestedIcon = child.icon;
                                                                return (
                                                                    <div key={child.name} className="space-y-0.5">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleNavMenu(nestedKey)}
                                                                            className={cn(
                                                                                'crm-hs-nav-item w-full',
                                                                                navChrome.navItem,
                                                                                (nestedOpen || nestedActive) &&
                                                                                    openParentBg,
                                                                                nestedActive &&
                                                                                    navChrome.navItemActive,
                                                                                idleNavText,
                                                                            )}
                                                                        >
                                                                            <SuiteNavIcon
                                                                                Icon={NestedIcon}
                                                                                active={!!nestedActive}
                                                                                iconBox={iconBox}
                                                                                iconBoxActive={iconBoxActive}
                                                                            />
                                                                            <span className="truncate flex-1 text-left">
                                                                                {child.name}
                                                                            </span>
                                                                            <ChevronDown
                                                                                className={cn(
                                                                                    'h-3.5 w-3.5 shrink-0 transition-transform',
                                                                                    idleIconCls,
                                                                                    !nestedOpen && '-rotate-90',
                                                                                )}
                                                                            />
                                                                        </button>
                                                                        {nestedOpen ? (
                                                                            <div
                                                                                className={cn(
                                                                                    'ml-3 space-y-0.5 border-l pl-2',
                                                                                    subBorderCls,
                                                                                )}
                                                                            >
                                                                                {nestedChildren.map(
                                                                                    (gc: {
                                                                                        name: string;
                                                                                        href: string;
                                                                                        icon: typeof child.icon;
                                                                                        permission: string;
                                                                                    }) => {
                                                                                        const GcIcon = gc.icon;
                                                                                        const gcActive =
                                                                                            activeChildHref ===
                                                                                            gc.href;
                                                                                        const gcLocked =
                                                                                            !suiteNavHasAccess(
                                                                                                hasAccess,
                                                                                                gc.permission,
                                                                                            );
                                                                                        return (
                                                                                            <div
                                                                                                key={gc.name}
                                                                                                className="relative group"
                                                                                            >
                                                                                                <Link
                                                                                                    href={
                                                                                                        gcLocked
                                                                                                            ? '#'
                                                                                                            : gc.href
                                                                                                    }
                                                                                                    prefetch={false}
                                                                                                    onClick={(e) => {
                                                                                                        if (gcLocked) {
                                                                                                            e.preventDefault();
                                                                                                            return;
                                                                                                        }
                                                                                                        onMobileClose?.();
                                                                                                    }}
                                                                                                    className={cn(
                                                                                                        'crm-hs-nav-item',
                                                                                                        navChrome.navItem,
                                                                                                        gcActive &&
                                                                                                            navChrome.navItemActive,
                                                                                                        gcLocked &&
                                                                                                            navChrome.navItemLocked,
                                                                                                        !gcActive &&
                                                                                                            !gcLocked &&
                                                                                                            idleNavText,
                                                                                                    )}
                                                                                                >
                                                                                                    <SuiteNavIcon
                                                                                                        Icon={GcIcon}
                                                                                                        active={!!gcActive}
                                                                                                        iconBox={iconBox}
                                                                                                        iconBoxActive={iconBoxActive}
                                                                                                    />
                                                                                                    <span className="truncate">
                                                                                                        {gc.name}
                                                                                                    </span>
                                                                                                </Link>
                                                                                            </div>
                                                                                        );
                                                                                    },
                                                                                )}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                );
                                                            }

                                                            const ChildIcon = child.icon;
                                                            const childIsActive = activeChildHref === child.href;
                                                            const childLocked = !suiteNavHasAccess(
                                                                hasAccess,
                                                                child.permission,
                                                            );
                                                            const childAgentPill =
                                                                child.name === 'Sales agents' &&
                                                                agentPendingCount > 0;
                                                            return (
                                                                <div key={child.name} className="relative group">
                                                                    <Link
                                                                        href={childLocked ? '#' : child.href}
                                                                        prefetch={false}
                                                                        onClick={(e) => {
                                                                            if (childLocked) {
                                                                                e.preventDefault();
                                                                                return;
                                                                            }
                                                                            onMobileClose?.();
                                                                        }}
                                                                        className={cn(
                                                                            'crm-hs-nav-item',
                                                                            navChrome.navItem,
                                                                            childIsActive && navChrome.navItemActive,
                                                                            childLocked && navChrome.navItemLocked,
                                                                            !childIsActive && !childLocked && idleNavText,
                                                                        )}
                                                                    >
                                                                        <SuiteNavIcon
                                                                            Icon={ChildIcon}
                                                                            active={!!childIsActive}
                                                                            iconBox={iconBox}
                                                                            iconBoxActive={iconBoxActive}
                                                                        />
                                                                        <span className="truncate">{child.name}</span>
                                                                        {childAgentPill ? (
                                                                            <span className="ml-auto inline-flex min-w-[16px] items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-black text-white">
                                                                                {agentPendingCount > 99 ? '99+' : agentPendingCount}
                                                                            </span>
                                                                        ) : null}
                                                                    </Link>
                                                                </div>
                                                            );
                                                        });
                                                        })()}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    }

                                    const matchBoard = false;
                                    const isActive = matchBoard
                                        ? isPmNavItemActive(pathname, item.href, true)
                                        : pathname === item.href || pathname.startsWith(item.href + '/');
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
                                                    navChrome.navItem,
                                                    isActive && navChrome.navItemActive,
                                                    locked && navChrome.navItemLocked,
                                                    isCollapsed && navChrome.navItemCollapsed,
                                                    !isActive && !locked && idleNavText,
                                                )}
                                            >
                                                <SuiteNavIcon
                                                    Icon={Icon}
                                                    active={!!isActive}
                                                    iconBox={iconBox}
                                                    iconBoxActive={iconBoxActive}
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
            <div className={navChrome.footer}>
                <div className={cn("flex items-center gap-2 text-xs", idleIconCls)}>
                    <div className="h-2 w-2 animate-pulse rounded-full bg-[#36b37e]" />
                    {!isCollapsed && <span className="font-medium">System online</span>}
                </div>
            </div>
            </div>

        </div>
        </>
    );
}


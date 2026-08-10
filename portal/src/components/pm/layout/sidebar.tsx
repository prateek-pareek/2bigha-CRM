'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
    LayoutDashboard,
    Kanban,
    BookOpen,
    Users,
    Settings,
    ChevronRight,
    ChevronDown,
    Plus,
    Filter,
    Search,
    Shield,
    ChevronLeft,
    MoreHorizontal,
    Calendar,
    FileText,
    CheckCircle2,
    LayoutGrid,
    Building2,
    PanelLeftClose,
    PanelLeftOpen,
    Star,
    Clock,
    Zap,
    CheckSquare,
    LogOut,
    Bell,
    Handshake,
    Briefcase,
    Github,
    Bot,
} from 'lucide-react';
import { PM_API_URL, API_HOST_URL } from '@/lib/api/config';
import { cn } from '@/lib/pm/utils';
import { Button } from '@/components/pm/ui/button';
import { ScrollArea } from '@/components/pm/ui/scroll-area';
import { useAuthStore } from '@/store/pm/auth-store';
import Image from 'next/image';
import { MATHIONIX_MARK_PNG, MATHIONIX_WORDMARK_DARK_BG_PNG } from '@/lib/brand-assets';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/pm/ui/avatar';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/lib/pm/api';
import {
    navigateToNotification,
    type AppNotification,
} from '@/lib/notifications/notification-utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/pm/ui/dropdown-menu';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';

import { Input } from '@/components/pm/ui/input';

const modules = [
    { id: 'HRMS', name: 'HRMS', href: '/hrms/dashboard', icon: Building2, color: 'text-emerald-400' },
    { id: 'CRM', name: 'CRM', href: '/crm/workspace', icon: Handshake, color: 'text-indigo-400' },
    { id: 'PM', name: 'Projects', href: '/pm/boards', icon: Briefcase, color: 'text-[var(--hs-link)]' },
];

const navItems = [
    { name: 'Dashboard', permission: 'boards', icon: LayoutDashboard, href: '/pm/dashboard' },
    { name: 'Boards', permission: 'boards', icon: Kanban, href: '/pm/boards' },
    { name: 'Virtual Office', permission: 'boards', icon: Users, href: '/pm/virtual-office' },
    { name: 'For you', permission: 'boards', icon: Zap, href: '/pm/for-you' },
    { name: 'Recent', permission: 'boards', icon: Clock, href: '/pm/boards' },
    { name: 'My Tasks', permission: 'boards', icon: CheckSquare, href: '/pm/my-tasks' },
    { name: 'Copilot', permission: 'boards', icon: Bot, href: '/pm/copilot' },
    { name: 'Wiki', permission: 'wiki', icon: BookOpen, href: '/pm/wiki' },
    { name: 'GitHub', permission: 'boards', icon: Github, href: '/pm/settings/github' },
];

function RecentLink({ collapsed, isActive, icon: Icon }: { collapsed: boolean; isActive: boolean; icon: any }) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { data: recentIssues } = useQuery<any[]>({
        queryKey: ['recent-issues'],
        queryFn: async () => {
            const resp = await api.get('/issues?sortBy=updatedAt&limit=10');
            return resp.data;
        },
        enabled: open
    });

    const filteredIssues = recentIssues?.filter(i =>
        i.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.key.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <div
                    title={collapsed ? 'Recent' : undefined}
                    className={cn(
                        'flex items-center rounded-md transition-all h-10 font-medium text-sm cursor-pointer border-l-[3px]',
                        collapsed ? 'justify-center w-10 mx-auto border-l-0' : 'gap-3 pl-3 pr-3',
                        isActive
                            ? 'border-l-[var(--hs-link)] bg-[var(--surface-dim)] text-[var(--text-main)] font-semibold'
                            : 'border-l-transparent text-[var(--text-main)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary-dark)]'
                    )}
                >
                    <Icon className={cn('shrink-0', 'h-4 w-4', isActive ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]')} />
                    {!collapsed && <span className="text-[var(--text-main)]">Recent</span>}
                    {!collapsed && <ChevronDown className={cn("ml-auto h-3 w-3", isActive ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]')} />}
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-80 p-0 ml-2 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[0_8px_24px_rgba(0,0,0,0.08)] rounded-md overflow-hidden">
                <div className="p-2">
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
                        <Input
                            placeholder="SEARCH RECENT ITEMS"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-[var(--surface-dim)] border-[var(--border-color)] text-xs uppercase font-mono tracking-widest text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                        />
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest px-4 py-2 block border-b border-[var(--border-color)]">Recently Viewed Issues</label>
                            {filteredIssues.length > 0 ? filteredIssues.map(issue => (
                                <Link key={issue._id} href={issue.project?._id ? `/pm/projects/${issue.project._id}/board?selectedIssue=${issue.key}` : '#'}>
                                    <div className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] transition-colors group">
                                        <div className="h-8 w-8 rounded-md bg-[var(--hs-link)]/15 flex items-center justify-center border border-[var(--hs-link)]/25">
                                            <CheckSquare className="h-4 w-4 text-[var(--hs-link)]" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-semibold text-[var(--text-main)] truncate group-hover:text-[var(--hs-link)] transition-colors">{issue.summary}</span>
                                            <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-tight">{issue.project?.name || 'Project'} • {issue.key}</span>
                                        </div>
                                    </div>
                                </Link>
                            )) : (
                                <p className="px-2 py-4 text-[9px] font-mono text-[var(--text-muted)] uppercase text-center">No items found</p>
                            )}
                        </div>
                    </div>

                    <DropdownMenuSeparator className="bg-[var(--border-color)] m-0" />
                    <Link href="/pm/boards">
                        <div className="p-3 text-center text-xs font-semibold text-[var(--hs-link)] hover:bg-[var(--surface-dim)] uppercase tracking-wide cursor-pointer transition-colors block">
                            View all recent items
                        </div>
                    </Link>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const { user, logout } = useAuthStore();
    const router = useRouter();
    const [notifications, setNotifications] = useState<any[]>([]);

    const managementRoles = ['ADMIN', 'CEO', 'CTO', 'MANAGER', 'EXECUTIVE', 'SENIOR MEMBER', 'ADMINISTRATOR'];

    const userRole = user?.role?.toUpperCase() || '';

    const allowedNavItems = navItems.filter((item) => {
        if (managementRoles.includes(userRole)) return true;

        // These are always visible
        if (['For you', 'Recent', 'My Tasks', 'Virtual Office'].includes(item.name)) return true;

        const userPerms = user?.permissions || [];
        const pmProjects = user?.pmProjects || [];
        const pmSpaces = user?.pmSpaces || [];

        if (item.name === 'Boards') {
            return userPerms.includes('boards') || pmProjects.length > 0;
        }
        if (item.name === 'Wiki') {
            return userPerms.includes('wiki') || pmSpaces.length > 0;
        }

        return userPerms.includes(item.permission);
    });

    const [expandedMenus, setExpandedMenus] = useState<string[]>(['Boards']);

    const toggleMenu = (name: string, e: React.MouseEvent) => {
        e.preventDefault();
        setExpandedMenus(prev =>
            prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
        );
    };

    const token = useAuthStore((state) => state.token);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                if (!token) return;
                const response = await api.get('/notifications/me');
                setNotifications(response.data);
            } catch (error: any) {
                if (error.response?.status !== 401) {
                    console.error('Failed to fetch notifications:', error);
                }
            }
        };
        if (user && token) fetchNotifications();
    }, [user, token]);

    const clearNotifications = async () => {
        try {
            await api.delete('/notifications/me');
            setNotifications([]);
        } catch (error) {
            console.error('Failed to clear notifications:', error);
        }
    };

    return (
        <aside
            className={cn(
                'relative flex h-screen flex-col border-r border-[var(--border-color)] bg-[var(--sidebar-bg)] text-[var(--text-main)] transition-all duration-300 z-40',
                collapsed ? 'w-20' : 'w-64'
            )}
            style={{ fontFamily: "var(--font-app)" }}
        >
            {/* Logo */}
            <div className={cn(
                'flex items-center shrink-0 border-b border-[var(--border-color)] transition-all',
                collapsed ? 'justify-center h-20 px-0' : 'gap-3 h-20 px-6'
            )}>
                <Link href="/pm/boards" className={cn('group flex min-w-0 items-center', !collapsed && 'gap-3')}>
                    {collapsed ? (
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[var(--border-color)] shadow-sm">
                            <Image src={MATHIONIX_MARK_PNG} alt="Mathionix" fill priority={true} loading="eager" sizes="40px" className="object-contain" />
                        </div>
                    ) : (
                        <>
                            <div className="flex min-w-0 items-center gap-3 dark:hidden">
                                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[var(--border-color)] shadow-sm">
                                    <Image src={MATHIONIX_MARK_PNG} alt="Mathionix" fill priority={true} loading="eager" sizes="36px" className="object-contain" />
                                </div>
                                <div className="flex min-w-0 flex-col overflow-hidden">
                                    <span className="truncate text-sm font-semibold tracking-tight text-[var(--text-main)]">Mathionix Technologies</span>
                                    <span className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--hs-link)]">Projects</span>
                                </div>
                            </div>
                            <div className="hidden min-w-0 flex-1 flex-col gap-1 dark:flex">
                                <div className="relative h-8 w-full max-w-[210px]">
                                    <Image
                                        src={MATHIONIX_WORDMARK_DARK_BG_PNG}
                                        alt="Mathionix Technologies"
                                        fill
                                        priority={true}
                                        loading="eager"
                                        className="object-contain object-left"
                                        sizes="210px"
                                    />
                                </div>
                                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--hs-link)]">Projects</span>
                            </div>
                        </>
                    )}
                </Link>
            </div>

            {/* Module Switcher */}
            {!collapsed ? (
                <div className="px-3 py-4 border-b border-[var(--border-color)]">
                    <p className="px-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">Switch Tool</p>
                    <div className="flex w-full gap-2">
                        {modules.filter(m => {
                            const tools = (user?.permittedTools || []).map(t => t.toUpperCase());
                            const hasPmAccess = m.id === 'PM' && ((user?.pmProjects ?? []).length > 0 || tools.includes('PM'));
                            return tools.includes(m.id) || hasPmAccess || (managementRoles.includes(userRole) && tools.length === 0);
                        }).map((module) => {
                            const Icon = module.icon;
                            const isActive = module.id === 'PM';
                            return (
                                <Link
                                    key={module.id}
                                    href={module.href}
                                    className={cn(
                                        "flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-md transition-all duration-200 border",
                                        isActive
                                            ? "bg-[var(--accent)] border-[var(--primary-muted)] text-[var(--hs-link)]"
                                            : "border-transparent hover:bg-[var(--surface-hover)] hover:border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                    )}
                                >
                                    <Icon size={18} className={cn(isActive ? "text-[var(--hs-link)]" : "text-[var(--text-muted)]")} />
                                    <span className={cn("text-[9px] font-bold uppercase tracking-tight", isActive ? "text-[var(--hs-link)]" : "text-[var(--text-muted)]")}>{module.id}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="py-4 border-b border-[var(--border-color)] flex flex-col items-center gap-2 px-2">
                    {modules.filter(m => {
                        const tools = (user?.permittedTools || []).map(t => t.toUpperCase());
                        const hasPmAccess = m.id === 'PM' && ((user?.pmProjects ?? []).length > 0 || tools.includes('PM'));
                        return tools.includes(m.id) || hasPmAccess || (managementRoles.includes(userRole) && tools.length === 0);
                    }).map((module) => {
                        const Icon = module.icon;
                        const isActive = module.id === 'PM';
                        return (
                            <Link
                                key={module.id}
                                href={module.href}
                                title={module.name}
                                className={cn(
                                    "w-10 h-10 flex items-center justify-center rounded-md transition-all duration-200 border",
                                    isActive
                                        ? "bg-[var(--accent)] border-[var(--primary-muted)] text-[var(--hs-link)]"
                                        : "border-transparent hover:bg-[var(--surface-hover)] hover:border-[var(--border-color)] text-[var(--text-muted)]"
                                )}
                            >
                                <Icon size={18} className={isActive ? "text-[var(--hs-link)]" : "text-[var(--text-muted)]"} />
                            </Link>
                        );
                    })}
                </div>
            )}

            <ScrollArea className="flex-1 px-3 py-4 custom-scrollbar">
                {!collapsed && (
                    <p className="px-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Projects</p>
                )}
                <nav className={cn('flex flex-col gap-1', collapsed ? 'px-2' : 'px-3')}>
                    {allowedNavItems.map((item) => {
                        const isBoardPath = pathname.includes('/board');
                        const isActive = isBoardPath
                            ? item.name === 'Boards'
                            : pathname.startsWith(item.href);

                        if (item.name === 'Recent') {
                            return (
                                <RecentLink key={item.name} collapsed={collapsed} isActive={isActive} icon={item.icon} />
                            );
                        }

                        return (
                            <Link key={item.name} href={item.href}>
                                <span
                                    title={collapsed ? item.name : undefined}
                                    className={cn(
                                        'flex items-center rounded-md transition-all h-10 text-sm font-medium cursor-pointer border-l-[3px]',
                                        collapsed ? 'justify-center w-10 mx-auto border-l-0' : 'gap-3 pl-3 pr-3',
                                        isActive
                                            ? 'border-l-[var(--hs-link)] bg-[var(--surface-dim)] text-[var(--text-main)] font-semibold'
                                            : 'border-l-transparent text-[var(--text-main)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary-dark)]'
                                    )}
                                >
                                    <item.icon className={cn('shrink-0', collapsed ? 'h-4 w-4' : 'h-4 w-4', isActive ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]')} />
                                    {!collapsed && <span className="text-[var(--text-main)]">{item.name}</span>}
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                <div className={cn('mt-2 space-y-1', collapsed ? 'px-2' : 'px-3')}>
                    {(managementRoles.includes(userRole) || (user?.permissions || []).includes('workload')) && (
                        <Link href="/pm/admin/workload">
                            <span
                                title={collapsed ? 'Workload' : undefined}
                                className={cn(
                                    'flex items-center rounded-md transition-all h-10 text-sm font-medium cursor-pointer mt-1 border-l-[3px]',
                                    collapsed ? 'justify-center w-10 mx-auto border-l-0' : 'gap-3 pl-3 pr-3',
                                    pathname.startsWith('/pm/admin/workload')
                                        ? 'border-l-[var(--hs-link)] bg-[var(--surface-dim)] text-[var(--text-main)] font-semibold'
                                        : 'border-l-transparent text-[var(--text-main)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary-dark)]'
                                )}
                            >
                                <Users className={cn('shrink-0', collapsed ? 'h-4 w-4' : 'h-4 w-4', pathname.startsWith('/pm/admin/workload') ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]')} />
                                {!collapsed && <span className="text-[var(--text-main)]">Workload</span>}
                            </span>
                        </Link>
                    )}
                </div>
            </ScrollArea>

            {/* Bottom: Module Switcher + Notifications + Theme + User */}
            <div className={cn('py-3 flex flex-col gap-1 border-t border-[var(--border-color)]', collapsed ? 'px-2 items-center' : 'px-3')}>


                {/* Notifications */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            title={collapsed ? 'Notifications' : undefined}
                            className={cn(
                                'relative text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] rounded-md h-9 text-sm font-medium',
                                collapsed ? 'w-9 px-0 justify-center' : 'w-full justify-start gap-3 px-3'
                            )}
                        >
                            <Bell className="h-4 w-4 shrink-0" />
                            {notifications.length > 0 && (
                                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-[#f2545b] rounded-full border-2 border-white" />
                            )}
                            {!collapsed && <span>Notifications</span>}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="end" className="w-80 p-0 ml-2 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[0_8px_24px_rgba(0,0,0,0.08)] rounded-md overflow-hidden">
                        <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest p-4 text-slate-400 border-b border-slate-50">
                            Notifications
                        </DropdownMenuLabel>
                        <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                            {notifications.length > 0 ? notifications.map(notif => (
                                <div
                                    key={notif.id || notif._id}
                                    className={cn(
                                        "p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors group",
                                        notif.isRead && "opacity-50"
                                    )}
                                    onClick={() => {
                                        navigateToNotification(
                                            router,
                                            notif as AppNotification,
                                            'pm',
                                        );
                                        api.patch(`/notifications/${notif._id}/read`).catch(e => console.error('Failed to mark read:', e));
                                        setNotifications(prev => prev.map(n =>
                                            (n._id || n.id) === (notif._id || notif.id) ? { ...n, isRead: true } : n
                                        ));
                                    }}
                                >
                                    <p className={cn('text-xs font-semibold mb-1 truncate group-hover:text-[var(--hs-link)] transition-colors', notif.type === 'primary' ? 'text-[var(--hs-link)]' : 'text-[var(--text-main)]')}>
                                        {notif.title}
                                    </p>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest leading-relaxed">{notif.message}</p>
                                </div>
                            )) : (
                                <div className="p-8 text-center">
                                    <div className="text-xs font-mono text-slate-400 uppercase tracking-[0.4em]">No notifications</div>
                                </div>
                            )}
                        </div>
                        {notifications.length > 0 && (
                            <Button variant="ghost" onClick={clearNotifications} className="w-full h-11 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 rounded-none border-t border-slate-50 bg-slate-50/50">
                                Clear All Notifications
                            </Button>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>


                <div className={cn(
                    'flex items-center gap-2',
                    collapsed ? 'flex-col' : 'w-full'
                )}>
                    <div className={cn(
                        'flex items-center gap-2 border border-[var(--border-color)] rounded-md py-2 bg-[#f7f5f2]',
                        collapsed ? 'w-9 px-0 justify-center' : 'flex-1 px-3 min-w-0'
                    )}>
                        <Avatar className="h-6 w-6 shrink-0 order-first">
                            <AvatarFallback className="bg-[var(--hs-link)] text-white text-xs font-bold">
                                {user?.fullName?.charAt(0) || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        {!collapsed && (
                            <span className="text-xs font-medium text-[var(--text-main)] truncate">
                                {user?.fullName || 'Member'}
                            </span>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={logout}
                        title="Logout"
                        className="h-10 w-10 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-dim)] rounded-md border border-[var(--border-color)] shrink-0"
                    >
                        <LogOut className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Collapse Toggle Button */}
            <button
                onClick={onToggle}
                className="absolute -right-3 top-20 h-6 w-6 rounded-full bg-[var(--hs-link)] border border-[var(--hs-link)] flex items-center justify-center text-white hover:bg-[var(--hs-link-hover)] transition-all z-50 shadow-md"
            >
                {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
            </button>
        </aside>
    );
}


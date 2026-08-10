'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    Kanban,
    BookOpen,
    Users,
    Search,
    Bell,
    HelpCircle,
    LogOut,
    User,
    Settings,
    Hexagon,
    Shield
} from 'lucide-react';
import { PM_API_URL, API_HOST_URL } from '@/lib/api/config';
import { Input } from '@/components/pm/ui/input';
import Image from 'next/image';
import { MATHIONIX_MARK_PNG, MATHIONIX_WORDMARK_DARK_BG_PNG } from '@/lib/brand-assets';
import { useAuthStore } from '@/store/pm/auth-store';
import { useState, useEffect } from 'react';
import { ThemeToggle } from '@/components/pm/theme-toggle';
import { useRouter } from 'next/navigation';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/pm/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/pm/ui/avatar';
import { Button } from '@/components/pm/ui/button';
import { cn } from '@/lib/utils';
import { isPmAdminUser } from '@/lib/pm/utils';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import api from '@/lib/pm/api';
import { getJwtSubjectFromBrowser } from '@/lib/jwt-subject';
import {
    navigateToNotification,
    type AppNotification,
} from '@/lib/notifications/notification-utils';

const navItems = [
    { name: 'Boards', icon: Kanban, href: '/pm/boards' },
    { name: 'Wiki', icon: BookOpen, href: '/pm/wiki' },
    { name: 'People', icon: Users, href: '/pm/people' },
];

export function Navbar() {
    const { user, logout } = useAuthStore();
    const pathname = usePathname();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [notifications, setNotifications] = useState<any[]>([]);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const response = await api.get('/notifications/me');
                const newNotifs = response.data;

                // Show toast for brand new notifications that weren't in the list before
                if (notifications.length > 0) {
                    const existingIds = new Set(notifications.map(n => n.id || n._id));
                    newNotifs.forEach((n: any) => {
                        if (!existingIds.has(n.id || n._id)) {
                            toast.info(n.title, { description: n.message });
                        }
                    });
                }

                setNotifications(newNotifs);
            } catch (error) {
                console.error('Failed to fetch notifications:', error);
            }
        };

        if (user) {
            fetchNotifications();
            // Fallback Polling (Vercel Compatibility)
            const interval = setInterval(fetchNotifications, 15000);
            return () => clearInterval(interval);
        }
    }, [user, notifications.length]);

    useEffect(() => {
        const rooms = Array.from(
            new Set(
                [getJwtSubjectFromBrowser(), user?.id ? String(user.id) : null].filter(
                    Boolean,
                ) as string[],
            ),
        );
        if (!rooms.length) return;

        const socket = io(process.env.NEXT_PUBLIC_PM_API_URL || API_HOST_URL);

        socket.on('connect', () => {
            for (const roomId of rooms) {
                socket.emit('join-room', roomId);
            }
        });

        socket.on('notification', (notif: any) => {
            setNotifications(prev => {
                if (prev.some(n => (n.id || n._id) === (notif.id || notif._id))) return prev;
                return [notif, ...prev];
            });
            toast.info(notif.title, { description: notif.message });
        });

        return () => {
            socket.disconnect();
        };
    }, [user?.id]);

    const clearNotifications = async () => {
        try {
            await api.delete('/notifications/me');
            setNotifications([]);
        } catch (error) {
            console.error('Failed to clear notifications:', error);
        }
    };

    const handleSearch = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    const allowedNavItems = navItems.filter((item) => {
        if (item.href === '/pm/people') return isPmAdminUser(user);
        return user?.role === 'ADMIN' || (user?.permissions || []).includes(item.name.toLowerCase());
    });

    // Add Admin item if user is ADMIN
    if (user?.role === 'ADMIN') {
        allowedNavItems.push({ name: 'Admin', icon: Shield, href: '/pm/admin/staff' });
    }

    return (
        <header className="h-24 glass border-b border-[var(--border-color)] px-8 flex flex-col z-40 bg-[var(--crm-header-bg)]/90 backdrop-blur-xl dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.06)]">
            {/* Top Row: Logo, Search, Actions */}
            <div className="flex items-center justify-between h-20 border-b border-[var(--border-color)]">
                {/* Logo */}
                <Link href="/pm/boards" className="flex items-center gap-2 group min-w-0">
                    <div className="flex items-center gap-2 dark:hidden">
                        <div className="relative h-10 w-10 bg-[var(--card-bg)] rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-[0_0_20px_rgba(0,242,255,0.2)] transition-all overflow-hidden border border-[var(--border-color)]">
                            <Image src={MATHIONIX_MARK_PNG} alt="Mathionix Technologies" fill priority={true} loading="eager" className="object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black tracking-tighter text-2xl text-[var(--text-main)] uppercase leading-none">Mathionix</span>
                            <span className="text-[8px] text-primary/70 tracking-[0.4em] font-subheading uppercase">Technologies</span>
                        </div>
                    </div>
                    <div className="relative hidden dark:block h-10 w-[min(240px,40vw)] shrink-0">
                        <Image
                            src={MATHIONIX_WORDMARK_DARK_BG_PNG}
                            alt="Mathionix Technologies"
                            fill
                            priority={true}
                            loading="eager"
                            className="object-contain object-left"
                            sizes="240px"
                        />
                    </div>
                </Link>

                {/* Search */}
                <div className="relative w-64 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] group-focus-within:text-[var(--hs-link)] transition-colors" />
                    <Input
                        placeholder="SEARCH..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearch}
                        className="pl-9 bg-[var(--surface-dim)] border-[var(--border-color)] text-[var(--text-main)] focus:border-[var(--hs-link)]/50 transition-all font-mono-custom text-[9px] uppercase tracking-widest h-9 rounded-xl placeholder:text-[var(--text-muted)]"
                    />
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-4">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 text-foreground/50 hover:text-foreground hover:bg-foreground/5 rounded-xl relative border border-border/10">
                                <Bell className="h-4 w-4" />
                                {notifications.length > 0 && (
                                    <span className="absolute top-3 right-3 h-1.5 w-1.5 bg-accent rounded-full shadow-[0_0_10px_rgba(255,0,122,0.5)]"></span>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="glass border-border/10 w-80 p-0">
                            <DropdownMenuLabel className="font-subheading text-xs uppercase tracking-widest p-4 text-foreground/50 border-b border-border/10">
                                Notifications
                            </DropdownMenuLabel>
                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                {notifications.length > 0 ? notifications.map(notif => (
                                    <div
                                        key={notif.id || notif._id}
                                        className={cn(
                                            "p-4 border-b border-[var(--border-color)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors",
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
                                        <p className={cn(
                                            "text-xs font-bold font-mono-custom mb-1 uppercase tracking-widest truncate",
                                            notif.type === 'primary' ? "text-primary" : "text-accent"
                                        )}>{notif.title}</p>
                                        <p className="text-[9px] text-foreground/40 uppercase tracking-widest leading-relaxed">{notif.message}</p>
                                    </div>
                                )) : (
                                    <div className="p-8 text-center">
                                        <p className="text-xs font-mono text-foreground/20 uppercase tracking-widest">No notifications</p>
                                    </div>
                                )}
                            </div>
                            {notifications.length > 0 && (
                                <Button
                                    variant="ghost"
                                    onClick={clearNotifications}
                                    className="w-full h-12 text-[9px] font-subheading uppercase tracking-widest text-foreground/30 hover:text-foreground rounded-none border-t border-border/10"
                                >
                                    Clear All
                                </Button>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <ThemeToggle />

                    <div className="flex items-center gap-2 px-3 h-10 bg-foreground/5 rounded-xl border border-border/10">
                        <Avatar className="h-6 w-6">
                            <AvatarFallback className="bg-primary text-background text-xs font-bold">
                                {user?.fullName?.charAt(0) || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-mono text-foreground/90 truncate max-w-[80px]">{user?.fullName || 'Member'}</span>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={logout}
                        className="h-10 w-10 text-accent/50 hover:text-accent hover:bg-accent/10 rounded-xl border border-border/10"
                    >
                        <LogOut className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Bottom Row: Navigation Tabs */}
            <nav className="flex items-center gap-1 h-10">
                {allowedNavItems.map((item) => {
                    const isBoardPath = pathname.includes('/board');
                    const isActive = isBoardPath
                        ? item.name === 'Boards'
                        : pathname.startsWith(item.href);

                    return (
                        <Link key={item.name} href={item.href}>
                            <Button
                                variant="ghost"
                                className={cn(
                                    "h-full px-8 rounded-none border-b-2 transition-all font-mono text-xs tracking-widest uppercase relative group",
                                    isActive
                                        ? "border-primary text-primary bg-primary/5"
                                        : "border-transparent text-foreground/30 hover:text-foreground hover:bg-foreground/5"
                                )}
                            >
                                <item.icon className={cn("mr-2 h-4 w-4", isActive && "neon-text")} />
                                {item.name}
                                {isActive && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_15px_rgba(0,242,255,0.6)]" />
                                )}
                            </Button>
                        </Link>
                    );
                })}
            </nav>
        </header >
    );
}

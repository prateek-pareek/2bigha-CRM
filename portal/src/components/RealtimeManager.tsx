"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore as usePmAuth } from '@/store/pm/auth-store';
import { API_HOST_URL } from '@/lib/api/config';
import { getJwtSubjectFromBrowser } from '@/lib/jwt-subject';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

import { useQueryClient } from '@tanstack/react-query';
import { playNotificationSound } from '@/lib/playNotificationSound';
import { usePathname } from 'next/navigation';

export default function RealtimeManager() {
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const { user: pmUser } = usePmAuth();
    const { user: hrmsUser, refresh } = usePermissions();
    const socketRef = useRef<Socket | null>(null);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const updateVisibility = () => {
            setIsVisible(document.visibilityState === 'visible');
        };
        updateVisibility();
        document.addEventListener('visibilitychange', updateVisibility);
        return () => document.removeEventListener('visibilitychange', updateVisibility);
    }, []);

    const supportsRealtime = useMemo(
        () =>
            ['/crm', '/pm', '/hrms', '/social', '/vault', '/client-portals'].some((prefix) =>
                pathname.startsWith(prefix),
            ),
        [pathname],
    );

    const user = hrmsUser || pmUser;
    /** Prefer JWT `sub` so the room matches API notification `recipient` (HRMS user id). */
    const profileId = user?._id || user?.id;
    const socketRoomIds = Array.from(
        new Set(
            ['ALL', getJwtSubjectFromBrowser(), profileId ? String(profileId) : null].filter(
                Boolean,
            ) as string[],
        ),
    );

    useEffect(() => {
        if (!socketRoomIds.length || !supportsRealtime || !isVisible) return;

        const socket = io(process.env.NEXT_PUBLIC_HRMS_API_URL || API_HOST_URL, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000
        });
        
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to socket', socket.id);
            for (const roomId of socketRoomIds) {
                socket.emit('join-room', roomId);
            }
        });

        socket.on('notification', (notif: any) => {
            console.log('Received notification:', notif);

            if (notif?.type === 'FORCE_LOGOUT') {
                return;
            }
            
            // Check if it's an access change notification
            if (notif.title.includes('Access') || notif.title.includes('Permission')) {
                // React Query Native way to sync: invalidate and refetch
                queryClient.invalidateQueries({ queryKey: ['auth/me'] });
            }

            // Refresh notifications cache
            queryClient.invalidateQueries({ queryKey: ['notifications'] });

            playNotificationSound();

            toast(notif.title, {
                description: notif.message,
                icon: <RefreshCw size={16} className="text-primary animate-spin" />,
                duration: 10000,
            });

            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('crm:realtime-event', {
                        detail: { event: 'notification', payload: notif },
                    }),
                );
            }
        });

        socket.on('crm:inbox:refresh', (payload: any) => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('crm:realtime-event', {
                        detail: { event: 'crm:inbox:refresh', payload },
                    }),
                );
            }
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [socketRoomIds.join('|'), refresh, supportsRealtime, isVisible]);

    return null;
}

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { PM_API_URL, API_HOST_URL } from '@/lib/api/config';
import { useAuthStore } from '@/store/pm/auth-store';

export function useRealtime(roomId?: string) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const token = useAuthStore((state) => state.token);
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

    useEffect(() => {
        if (!token || !isVisible) return;

        const socketInstance = io(process.env.NEXT_PUBLIC_PM_API_URL || API_HOST_URL, {
            auth: { token },
        });

        // Use a timeout or next tick to avoid the "setState in effect" warning
        // which triggers when setting state synchronously in an effect body.
        const timeoutId = setTimeout(() => {
            setSocket(socketInstance);
            if (roomId) {
                socketInstance.emit('join-room', roomId);
            }
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            if (roomId) {
                socketInstance.emit('leave-room', roomId);
            }
            socketInstance.disconnect();
            setSocket(null);
        };
    }, [token, roomId, isVisible]);

    return socket;
}

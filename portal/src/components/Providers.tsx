'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/pm/ui/sonner';
import { useState } from 'react';
import SuiteAppearanceProvider from '@/components/SuiteAppearanceProvider';
import CrmImportProgressTracker from '@/components/crm/CrmImportProgressTracker';

if (typeof window !== 'undefined') {
    const originalError = console.error;
    console.error = (...args: any[]) => {
        if (
            typeof args[0] === 'string' &&
            args[0].includes('flushSync was called from inside a lifecycle method')
        ) {
            return;
        }
        originalError.apply(console, args);
    };
}

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
                refetchOnWindowFocus: false,
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider
                attribute="class"
                defaultTheme="light"
                enableSystem={false}
                storageKey="mathionix-ui-theme"
                disableTransitionOnChange
            >
                <SuiteAppearanceProvider>
                    {children}
                </SuiteAppearanceProvider>
                <Toaster position="top-right" />
                <CrmImportProgressTracker />
            </ThemeProvider>
        </QueryClientProvider>
    );
}

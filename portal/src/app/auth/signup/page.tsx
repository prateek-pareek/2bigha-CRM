"use client";

import Link from 'next/link';
import { jiraAuthChrome } from '@/lib/pm/jira-ui';
import { cn } from '@/lib/pm/utils';
import { MathionixLoginBrandHero } from '@/components/MathionixBrand';

export default function SignupPage() {
    return (
        <div className={cn(jiraAuthChrome.page, 'flex items-center justify-center')}>
            <div className={cn(jiraAuthChrome.card, 'text-center')}>
                <MathionixLoginBrandHero />
                <h1 className={cn(jiraAuthChrome.title, 'mt-4')}>Invitation only</h1>
                <p className={cn(jiraAuthChrome.lead, 'mt-2')}>
                    Public registration is disabled. Contact your administrator to request an account.
                </p>
                <Link href="/auth/login" className="mt-6 inline-block text-sm font-medium text-[#0052cc] hover:underline">
                    Back to log in
                </Link>
            </div>
        </div>
    );
}

"use client";

import Link from 'next/link';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { useState } from 'react';
import { jiraAuthChrome } from '@/lib/pm/jira-ui';
import { cn } from '@/lib/pm/utils';

export default function ForgotPasswordPage() {
    const [submitted, setSubmitted] = useState(false);

    return (
        <div className={cn(jiraAuthChrome.page, 'flex items-center justify-center')}>
            <div className="w-full max-w-[400px]">
                <Link href="/auth/login" className="mb-6 inline-flex items-center gap-2 text-sm text-[#5e6c84] hover:text-[#0052cc]">
                    <ArrowLeft size={16} />
                    Back to log in
                </Link>

                <div className={jiraAuthChrome.card}>
                    {!submitted ? (
                        <>
                            <div className="mb-6">
                                <h1 className={jiraAuthChrome.title}>Reset your password</h1>
                                <p className={jiraAuthChrome.lead}>
                                    Enter your email and we&apos;ll send you a reset link.
                                </p>
                            </div>

                            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                                <div className="space-y-1.5">
                                    <label htmlFor="forgot-email" className={jiraAuthChrome.label}>Email</label>
                                    <div className="relative">
                                        <Mail className={jiraAuthChrome.iconInInput} size={16} />
                                        <input
                                            id="forgot-email"
                                            type="email"
                                            required
                                            placeholder="you@company.com"
                                            className={cn(jiraAuthChrome.input, jiraAuthChrome.inputWithIcon)}
                                        />
                                    </div>
                                </div>

                                <button type="submit" className={cn(jiraAuthChrome.btnPrimary, 'gap-2')}>
                                    Send reset link
                                    <Send size={16} />
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="py-2 text-center">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#e3fcef] text-[#216e4e]">
                                <Mail size={28} strokeWidth={2} />
                            </div>
                            <h2 className={jiraAuthChrome.title}>Check your email</h2>
                            <p className={cn(jiraAuthChrome.lead, 'mt-2')}>
                                We sent a password reset link to your email. It may take a few minutes to arrive.
                            </p>
                            <button
                                type="button"
                                onClick={() => setSubmitted(false)}
                                className="mt-6 text-sm font-medium text-[#0052cc] hover:underline"
                            >
                                Didn&apos;t receive it? Try again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

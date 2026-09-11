import * as React from "react";
import { cn } from "./utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./alert-dialog";
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: React.ReactNode;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'destructive' | 'default';
    /** Optional icon override; defaults to a warning triangle. */
    icon?: React.ReactNode;
    /** Shows a spinner + disables the confirm button while an async action runs. */
    loading?: boolean;
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    onConfirm,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'destructive',
    icon,
    loading = false,
}: ConfirmDialogProps) {
    const isDestructive = variant === 'destructive';
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="theme-hrms max-w-md gap-0 overflow-hidden rounded-2xl border-border p-0 shadow-xl">
                <AlertDialogHeader className="space-y-0 p-6 pb-5">
                    <div className="flex items-center gap-3.5">
                        <div
                            className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-8',
                                isDestructive
                                    ? 'bg-destructive/10 text-destructive ring-destructive/5'
                                    : 'bg-primary/10 text-primary ring-primary/5',
                            )}
                        >
                            {icon ?? <AlertTriangle className="h-[22px] w-[22px]" />}
                        </div>
                        <AlertDialogTitle className="text-left text-lg font-semibold leading-tight tracking-tight text-card-foreground">
                            {title}
                        </AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="pt-4 text-left text-sm leading-relaxed text-muted-foreground">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 border-t border-border bg-muted/30 px-6 py-4 sm:gap-2">
                    <AlertDialogCancel
                        disabled={loading}
                        className="mt-0 h-9 border-border bg-background text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        {cancelText}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={loading}
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirm();
                            if (!loading) onOpenChange(false);
                        }}
                        className={cn(
                            'h-9 gap-2 text-sm font-semibold shadow-sm',
                            isDestructive
                                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90',
                        )}
                    >
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

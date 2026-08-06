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
import { AlertCircle } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'destructive' | 'default';
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    onConfirm,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'destructive'
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="theme-hrms max-w-md border-border">
                <AlertDialogHeader>
                    <div className="flex items-start gap-3 sm:pr-2">
                        <div
                            className={cn(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                variant === 'destructive'
                                    ? 'bg-destructive/10 text-destructive'
                                    : 'bg-primary/10 text-primary',
                            )}
                        >
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <AlertDialogTitle className="text-left font-semibold uppercase tracking-tight text-card-foreground">
                            {title}
                        </AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="pt-1 text-left text-sm font-medium leading-relaxed text-muted-foreground">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-2 gap-2 sm:gap-0">
                    <AlertDialogCancel className="border-border bg-transparent text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                        {cancelText}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirm();
                            onOpenChange(false);
                        }}
                        className={cn(
                            'text-xs',
                            variant === 'destructive'
                                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90',
                        )}
                    >
                        {confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

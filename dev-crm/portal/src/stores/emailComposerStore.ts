import { create } from 'zustand';
import type { BulkEmailRecipient } from '@/lib/crm/bulk-email';

export interface EmailComposerProps {
  recipientEmail?: string;
  recipientName?: string;
  module?: string;
  entityId?: string;
  onSuccess?: () => void;
  accounts?: any[];
  defaultAccountId?: string;
  initialData?: any;
  crmInboxMode?: boolean;
  replyToInboxEmailId?: string;
  lockRecipient?: boolean;
  onClose?: () => void;
  replyPreset?: {
    subject: string;
    body: string;
    recipientEmail: string;
    recipientName: string;
    /** Original message HTML (tracking stripped). Shown below the editor and appended when sending. */
    quotedHtml?: string;
    quotedMeta?: {
      fromLabel: string;
      dateLabel: string;
    };
  };
  suggestedCcEmails?: string[];
  /** Inbox reply: mailbox that received the message — correct From for threading (API requires match). */
  replyThreadMailbox?: { accountId: string; email: string };
  /** If true, trigger AI draft immediately when composer opens. */
  autoRunAiDraftOnOpen?: boolean;
  bulkRecipients?: BulkEmailRecipient[];
}

interface EmailComposerState {
  isOpen: boolean;
  props: EmailComposerProps;
  openComposer: (props: EmailComposerProps) => void;
  closeComposer: () => void;
}

export const useEmailComposerStore = create<EmailComposerState>((set) => ({
  isOpen: false,
  props: {},
  openComposer: (props) => set({ isOpen: true, props }),
  closeComposer: () => set({ isOpen: false, props: {} }),
}));

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, Mail, Inbox, Send, FileText, Trash2, AlertOctagon,
  MoreHorizontal, MoreVertical, ChevronRight, ChevronLeft, ChevronDown, Loader2, Plus, ArrowLeft, Image as ImageIcon,
  RefreshCw, Star, CheckCircle2, XCircle, Clock, Settings, Link2, Pencil, Filter,
  MessageCircle, Phone, ExternalLink, RotateCcw, Reply, ReplyAll, Forward, X, CalendarRange,
  Building2, Briefcase, Users, Archive, Sparkles, FolderOpen, Square, AlertTriangle,
} from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import Pagination from '@/components/suite/shell/Pagination';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import ConnectEmailAccountModal from '@/components/crm/inbox/ConnectEmailAccountModal';
import EditEmailAccountModal from '@/components/crm/inbox/EditEmailAccountModal';
import {
  CrmEmailActivityAttachments,
  CrmEmailActivityBody,
} from '@/components/crm/inbox/CrmEmailActivityMedia';
import WhatsAppTemplatePicker from '@/components/crm/inbox/WhatsAppTemplatePicker';
import { CrmBreadcrumb, CrmButton } from "@/components/crm/ui";
import { toast } from 'sonner';
import "@/app/crm/crm-hubspot.css";
import { cn } from "@/lib/utils";
import { isAdmin as isHrmsAdmin } from '@/lib/suite/auth';

function inboxHasPerm(user: any, perm: string): boolean {
  if (!user) return false;
  if (isHrmsAdmin(user)) return true;
  const perms = [
    ...(user.permissions || []),
    ...(user.crmPermissions || []),
  ];
  return perms.includes(perm);
}
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import { playNotificationSound } from '@/lib/playNotificationSound';
import {
  emailSnippet,
  buildReplyPresetFromInboxItem,
  buildForwardPresetFromInboxItem,
  emailBodyPlainText,
} from '@/lib/crm/inbox-reply';
import {
  inboxOutreachBadgeLabel,
  type InboxAccountOutreachType,
} from '@/lib/crm/inbox-outreach';

interface InboxEmailItem {
  _id: string;
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  folder: string;
  date: string;
  accountId: { _id: string; email: string; displayName?: string; provider: string };
  isRead?: boolean;
  relationshipLabel?: 'freelancer' | 'agency' | 'both';
  meta?: {
    attachments?: Array<{
      id: string;
      filename: string;
      size: number;
      contentType: string;
      cid?: string;
      isInline?: boolean;
    }>;
    [key: string]: any;
  };
}

interface EmailAccount {
  _id: string;
  email: string;
  displayName?: string;
  provider: string;
  isDefault: boolean;
  lastSyncedAt?: string;
  syncState?: {
    lastError?: string;
    lastErrorAt?: string;
    lastSyncSuccessAt?: string;
    lastSyncAttemptAt?: string;
    consecutiveFailures?: number;
    lastSyncResultCount?: number;
  };
  pushState?: { lastPushError?: string; lastPushErrorAt?: string };
  authType?: 'password' | 'oauth';
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  userId: string;
  sharedWithUserIds: string[];
  accountLabel?: string;
  outreachType?: InboxAccountOutreachType;
  /** Owner or admin — may edit/remove mailbox settings */
  canManage?: boolean;
}

type Category = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'all' | 'business' | 'promotional' | 'social' | 'other';
type Source = 'my-inbox' | 'whatsapp';
type RelationshipLabel = 'freelancer' | 'agency' | 'both';

interface WhatsAppMessage {
  _id: string;
  waId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  createdAt: string;
}

interface WhatsAppContact {
  waId: string;
  lastMessageAt: string;
}

const WA_CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;
const WA_WINDOW_WARN_MS = 60 * 60 * 1000; // warn under 1 hour

function formatWaWindowCountdown(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function getWhatsAppCareWindow(messages: WhatsAppMessage[], nowMs: number) {
  const lastInbound = messages
    .filter((m) => m.direction === 'inbound' && m.createdAt)
    .reduce<Date | null>((latest, m) => {
      const d = new Date(m.createdAt);
      if (Number.isNaN(d.getTime())) return latest;
      if (!latest || d > latest) return d;
      return latest;
    }, null);

  if (!lastInbound) {
    return {
      status: 'no_inbound' as const,
      lastInboundAt: null as Date | null,
      expiresAt: null as Date | null,
      remainingMs: 0,
    };
  }

  const expiresAt = new Date(lastInbound.getTime() + WA_CUSTOMER_CARE_WINDOW_MS);
  const remainingMs = expiresAt.getTime() - nowMs;
  if (remainingMs <= 0) {
    return {
      status: 'expired' as const,
      lastInboundAt: lastInbound,
      expiresAt,
      remainingMs: 0,
    };
  }
  return {
    status: remainingMs <= WA_WINDOW_WARN_MS ? ('expiring_soon' as const) : ('open' as const),
    lastInboundAt: lastInbound,
    expiresAt,
    remainingMs,
  };
}

const INBOX_ICON_FILTER_TIP =
  'pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1.5 w-max max-w-[min(260px,calc(100vw-32px))] -translate-x-1/2 rounded-lg bg-text-main px-2.5 py-1.5 text-left text-[10px] font-semibold leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100';

const OUTREACH_MAILBOX_FILTERS = [
  {
    id: 'all' as const,
    tip: 'All mailboxes — agency, freelancer, and dual-stream accounts.',
    icon: Mail,
  },
  {
    id: 'agency' as const,
    tip: 'Agency outreach mailboxes only.',
    icon: Building2,
  },
  {
    id: 'freelancer' as const,
    tip: 'Freelancer outreach mailboxes only.',
    icon: Briefcase,
  },
  {
    id: 'both' as const,
    tip: 'Mailboxes used for both agency and freelancer outreach.',
    icon: Users,
  },
] as const;

const MAIL_FOLDER_CATEGORIES = [
  'inbox',
  'sent',
  'drafts',
  'trash',
  'spam',
] as const;
type MailFolderCategory = (typeof MAIL_FOLDER_CATEGORIES)[number];

function isMailFolderCategory(c: Category): c is MailFolderCategory {
  return (MAIL_FOLDER_CATEGORIES as readonly string[]).includes(c);
}

const MAX_RENDERED_CONVERSATION_ITEMS = 40;
const MAX_RENDERED_WA_MESSAGES = 120;
const RENDER_WINDOW_INCREMENT = 40;

function senderInitials(name: string | undefined, fallback: string) {
  const n = (name || fallback || '?').trim();
  const parts = n.split(/[\s@<]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase().slice(0, 2);
  return n.slice(0, 2).toUpperCase();
}

const LABEL_COLOR_PALETTE = [
  { id: 'emerald', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700' },
  { id: 'amber', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
  { id: 'rose', dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700' },
  { id: 'sky', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700' },
  { id: 'slate', dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-700' },
] as const;

interface CustomLabel {
  id: string;
  name: string;
  dot: string;
  pill: string;
  primary: boolean;
}

const DEFAULT_CUSTOM_LABELS: CustomLabel[] = [
  { id: 'team-events', name: 'Team Events', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', primary: true },
  { id: 'work', name: 'Work', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700', primary: true },
  { id: 'external', name: 'External', dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700', primary: true },
  { id: 'projects', name: 'Projects', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700', primary: true },
  { id: 'applications', name: 'Applications', dot: 'bg-[var(--primary)]', pill: 'bg-[var(--primary-light)] text-[var(--primary)]', primary: true },
  { id: 'design', name: 'Design', dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700', primary: false },
];

const AVATAR_PALETTE = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500',
];

function senderAvatarColor(name: string | undefined, fallback: string) {
  const n = (name || fallback || '?').trim();
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function isDraftItem(item: InboxEmailItem) {
  const f = (item.folder || '').toLowerCase();
  return f === 'drafts' || f === 'draft' || f.includes('/drafts') || (item as any).meta?.isLocalDraft;
}


type EmailModalState =
  | { mode: "compose" }
  | { mode: "reply"; item: InboxEmailItem; autoAiDraft?: boolean }
  | { mode: "forward"; item: InboxEmailItem }
  | { mode: "edit_draft"; item: InboxEmailItem };


export default function CRMInboxPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sourceParam = searchParams.get('source') as Source | null;
  const [source, setSource] = useState<Source>(
    sourceParam && ['my-inbox', 'whatsapp'].includes(sourceParam) ? sourceParam : 'my-inbox',
  );
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [inboxEmails, setInboxEmails] = useState<InboxEmailItem[]>([]);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('inbox');
  const [selectedEmail, setSelectedEmail] = useState<InboxEmailItem | null>(null);
  const [conversationEmails, setConversationEmails] = useState<InboxEmailItem[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [lastSelectedAccountId, setLastSelectedAccountId] = useState<string>('');
  const [emailModal, setEmailModal] = useState<EmailModalState | null>(null);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMoreFolders, setShowMoreFolders] = useState(false);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [showMessageDetails, setShowMessageDetails] = useState(false);
  const [detailActionsOpen, setDetailActionsOpen] = useState(false);
  const toggleStarred = (id: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Frontend-only mock labels (not persisted to the backend). */
  const [customLabels, setCustomLabels] = useState<CustomLabel[]>(DEFAULT_CUSTOM_LABELS);
  const [emailLabels, setEmailLabels] = useState<Record<string, string>>({});
  const [activeCustomLabelFilter, setActiveCustomLabelFilter] = useState<string | null>(null);
  const [showMoreLabels, setShowMoreLabels] = useState(false);
  const [showAddLabelForm, setShowAddLabelForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState<(typeof LABEL_COLOR_PALETTE)[number]['id']>('sky');

  const addCustomLabel = () => {
    const name = newLabelName.trim();
    if (!name) return;
    const color = LABEL_COLOR_PALETTE.find((c) => c.id === newLabelColor) || LABEL_COLOR_PALETTE[0];
    setCustomLabels((prev) => [
      ...prev,
      { id: `${color.id}-${Date.now()}`, name, dot: color.dot, pill: color.pill, primary: false },
    ]);
    setNewLabelName('');
    setShowAddLabelForm(false);
    setShowMoreLabels(true);
  };

  const setEmailLabel = (emailId: string, labelId: string | null) => {
    setEmailLabels((prev) => {
      const next = { ...prev };
      if (labelId) next[emailId] = labelId;
      else delete next[emailId];
      return next;
    });
  };

  const isAdmin = useMemo(() => isHrmsAdmin(currentUser), [currentUser]);

  const canConnectInbox = useMemo(
    () => inboxHasPerm(currentUser, 'inbox:connect'),
    [currentUser],
  );

  const canDeleteInbox = useMemo(
    () =>
      inboxHasPerm(currentUser, 'inbox:delete') ||
      inboxHasPerm(currentUser, 'inbox:connect'),
    [currentUser],
  );

  const canDeleteInboxMessage = canDeleteInbox;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const hasAutoSyncedFolder = useRef<Set<string>>(new Set());
  const seenIncomingEmailIdsRef = useRef<Set<string>>(new Set());
  const inboxNotificationBootstrappedRef = useRef(false);
  /** Avoids listing before inbox accounts are loaded (prevents an unscoped / duplicate fetch). */
  const [accountsHydrated, setAccountsHydrated] = useState(false);

  // WhatsApp state
  const [waContacts, setWaContacts] = useState<WhatsAppContact[]>([]);
  const [waMessages, setWaMessages] = useState<WhatsAppMessage[]>([]);
  const [selectedWaId, setSelectedWaId] = useState<string | null>(null);
  const [waNewMessage, setWaNewMessage] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waConfig, setWaConfig] = useState<{
    isActive?: boolean;
    apiKey?: string;
    phoneNumberId?: string;
    businessAccountId?: string;
  } | null>(null);
  const [waTemplatePickerOpen, setWaTemplatePickerOpen] = useState(false);
  const [waNewChatOpen, setWaNewChatOpen] = useState(false);
  const [waNewChatPhone, setWaNewChatPhone] = useState('');
  const [waNowMs, setWaNowMs] = useState(() => Date.now());

  const waConfigured = Boolean(
    waConfig?.isActive && waConfig?.apiKey && waConfig?.phoneNumberId,
  );

  const setInboxSource = useCallback(
    (next: Source) => {
      setSource(next);
      setSelectedEmail(null);
      setSelectedWaId(null);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'whatsapp') params.set('source', 'whatsapp');
      else params.delete('source');
      const qs = params.toString();
      router.replace(qs ? `/crm/inbox?${qs}` : '/crm/inbox', { scroll: false });
    },
    [router, searchParams],
  );
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  /** `YYYY-MM-DD` from native date inputs; filtered on server by message `date` */
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  /** `${emailId}:${attachmentId}` while a download is in progress */
  const [movingCategoryId, setMovingCategoryId] = useState<string | null>(null);
  const [labelingEmailId, setLabelingEmailId] = useState<string | null>(null);
  const [relationshipFilter, setRelationshipFilter] = useState<'all' | RelationshipLabel>('all');
  const [outreachAccountFilter, setOutreachAccountFilter] = useState<
    'all' | InboxAccountOutreachType
  >('all');
  const [visibleConversationCount, setVisibleConversationCount] = useState(
    MAX_RENDERED_CONVERSATION_ITEMS,
  );
  const [visibleWaMessageCount, setVisibleWaMessageCount] = useState(
    MAX_RENDERED_WA_MESSAGES,
  );

  const markEmailAsRead = async (emailId: string) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/emails/${emailId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        console.error('Failed to mark email as read', res.status);
        return;
      }
      setInboxEmails(prev => prev.map(e => e._id === emailId ? { ...e, isRead: true } : e));
    } catch (err) {
      console.error('Failed to mark email as read', err);
    }
  };

  const handleDeleteEmail = async (emailId: string) => {
    if (!canDeleteInboxMessage) {
      toast.error('You do not have permission to delete messages');
      return;
    }
    if (!confirm('Are you sure you want to delete this email? This action cannot be undone.')) return;

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/emails/${emailId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        toast.success('Email deleted');
        setSelectedEmail(null);
        void fetchInboxEmails();
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = Array.isArray(err?.message)
          ? err.message.join(', ')
          : err?.message;
        toast.error(typeof msg === 'string' ? msg : 'Failed to delete email');
        void fetchInboxEmails();
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete email');
    }
  };

  const sanitizeDownloadFilename = (name: string) =>
    name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'attachment';

  const handleDownloadAttachment = async (emailId: string, attachment: { id: string; filename: string }) => {
    const token = localStorage.getItem('token');
    const safeName = sanitizeDownloadFilename(attachment.filename);
    const url = `${CRM_API_URL}/crm/inbox-accounts/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachment.id)}`;
    try {
      const saveBlobDownload = async (blob: Blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        a.remove();
      };

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');

      // Stream bytes straight to disk when supported — save starts as data arrives (no full-buffer wait).
      const w = window as Window &
        typeof globalThis & {
          showSaveFilePicker?: (opts: {
            suggestedName?: string;
          }) => Promise<FileSystemFileHandle>;
        };
      if (res.body && typeof w.showSaveFilePicker === 'function') {
        try {
          const handle = await w.showSaveFilePicker({ suggestedName: safeName });
          const writable = await handle.createWritable();
          await res.body.pipeTo(writable);
          toast.success('Download saved');
          return;
        } catch (pickerErr: unknown) {
          const name =
            pickerErr && typeof pickerErr === 'object' && 'name' in pickerErr
              ? String((pickerErr as { name?: string }).name)
              : '';
          if (name === 'AbortError') return;
          const res2 = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res2.ok) throw new Error('Download failed');
          await saveBlobDownload(await res2.blob());
          toast.success('Download saved');
          return;
        }
      }

      await saveBlobDownload(await res.blob());
      toast.success('Download saved');
    } catch (err) {
      toast.error('Failed to download attachment');
    }
  };

  const handleMoveToCategory = async (emailId: string, category: Category, scope: 'email' | 'sender' | 'domain' = 'sender') => {
    setMovingCategoryId(emailId);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/emails/${emailId}/classify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ category, scope })
      });
      if (res.ok) {
        toast.success(`Moved to ${category}`);
        void fetchInboxEmails();
        setSelectedEmail(null);
      } else {
        toast.error('Failed to move email');
      }
    } catch (err) {
      toast.error('Failed to move email');
    } finally {
      setMovingCategoryId(null);
    }
  };

  const handleSetRelationshipLabel = async (emailId: string, label: RelationshipLabel | null) => {
    setLabelingEmailId(emailId);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/emails/${emailId}/label`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        toast.error('Failed to update label');
        return;
      }

      setInboxEmails((prev) =>
        prev.map((email) =>
          email._id === emailId
            ? { ...email, relationshipLabel: label ?? undefined }
            : email,
        ),
      );
      setConversationEmails((prev) =>
        prev.map((email) =>
          email._id === emailId
            ? { ...email, relationshipLabel: label ?? undefined }
            : email,
        ),
      );
      setSelectedEmail((prev) =>
        prev && prev._id === emailId
          ? { ...prev, relationshipLabel: label ?? undefined }
          : prev,
      );
      toast.success('Label updated');
    } catch {
      toast.error('Failed to update label');
    } finally {
      setLabelingEmailId(null);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${CRM_API_URL}/crm-users/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data);
        }
      } catch (err) { }
    };
    fetchProfile();
  }, []);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Keep track of the last specific account selected for "memory"
  useEffect(() => {
    if (selectedAccountId !== '') {
      setLastSelectedAccountId(selectedAccountId);
    }
  }, [selectedAccountId]);

  // Reset to page 1 when list query scope changes
  useEffect(() => {
    setPage(1);
  }, [
    filters,
    activeCategory,
    dateFrom,
    dateTo,
    relationshipFilter,
    outreachAccountFilter,
    debouncedSearch,
    selectedAccountId,
  ]);

  // If totals shrink (search/account/filter), keep the current page in range
  useEffect(() => {
    if (source !== 'my-inbox' || inboxTotal <= 0) return;
    const maxPage = Math.max(1, Math.ceil(inboxTotal / pageSize));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [source, inboxTotal, page, pageSize]);

  const sidebarAccounts = useMemo(() => {
    if (outreachAccountFilter === 'all') return accounts;
    return accounts.filter((a) => a.outreachType === outreachAccountFilter || a.outreachType === 'both');
  }, [accounts, outreachAccountFilter]);

  useEffect(() => {
    if (outreachAccountFilter === 'all') return;
    if (selectedAccountId === '') return;
    const selected = accounts.find((a) => a._id === selectedAccountId);
    if (selected && selected.outreachType !== outreachAccountFilter && selected.outreachType !== 'both') {
      setSelectedAccountId(sidebarAccounts[0]?._id || '');
    }
  }, [outreachAccountFilter, selectedAccountId, accounts, sidebarAccounts]);

  const fetchAccounts = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(Array.isArray(data) ? data : []);
        setAccountsHydrated((prev) => {
          if (!prev) {
            const defaultAcc = (Array.isArray(data) ? data : []).find((a: EmailAccount) => a.isDefault);
            const initialAcc = defaultAcc?._id || (data?.[0]?._id) || '';
            setSelectedAccountId(initialAcc);
            setLastSelectedAccountId(initialAcc);
          }
          return true;
        });
      }
    } catch (err) {
      console.error('Failed to fetch accounts', err);
      setAccountsHydrated(true);
    }
  }, []);

  useEffect(() => {
    const oauth = searchParams.get('inbox_oauth');
    if (!oauth) return;
    const reason = searchParams.get('reason');
    if (oauth === 'success') {
      toast.success('Email account connected');
      void fetchAccounts();
    } else if (oauth === 'error') {
      const msg = reason ? decodeURIComponent(reason) : 'Could not connect email';
      toast.error(msg);
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete('inbox_oauth');
    next.delete('reason');
    const q = next.toString();
    router.replace(q ? `/crm/inbox?${q}` : '/crm/inbox');
  }, [searchParams, router, fetchAccounts]);

  const fetchInboxEmails = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    // If selectedAccountId is empty, it means "All Accounts"
    if (selectedAccountId) {
      params.set('accountId', selectedAccountId);
    }
    if (activeCategory && activeCategory !== 'all') params.set('folderType', activeCategory);
    if (relationshipFilter !== 'all') params.set('relationshipLabel', relationshipFilter);
    if (outreachAccountFilter !== 'all') {
      params.set('accountOutreachType', outreachAccountFilter);
    }
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (debouncedSearch) params.set('search', debouncedSearch);
    const ymd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
    let df = dateFrom.trim();
    let dt = dateTo.trim();
    if (df && dt && df > dt) {
      const t = df;
      df = dt;
      dt = t;
    }
    let fromIso: string | null = null;
    let toIso: string | null = null;
    if (df && ymd(df)) {
      const [y, m, d] = df.split('-').map(Number);
      fromIso = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
    }
    if (dt && ymd(dt)) {
      const [y, m, d] = dt.split('-').map(Number);
      toIso = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
    }
    if (fromIso) params.set('dateFrom', fromIso);
    if (toIso) params.set('dateTo', toIso);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/emails?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const nextEmails: InboxEmailItem[] = Array.isArray(data.emails) ? data.emails : [];
        const nextTotal = typeof data.total === 'number' ? data.total : Number(data.total) || 0;
        setInboxEmails(nextEmails);
        setInboxTotal(nextTotal);
        const maxPage = Math.max(1, Math.ceil(nextTotal / pageSize));
        if (nextTotal > 0 && nextEmails.length === 0 && page > maxPage) {
          setPage(maxPage);
        }
        const accountEmail = (accounts.find((a) => a._id === selectedAccountId)?.email || "")
          .trim()
          .toLowerCase();
        const isInbound = (email: InboxEmailItem) => {
          const folder = String(email.folder || "").toLowerCase();
          if (!(folder === "inbox" || folder.includes("/inbox"))) return false;
          const from = String(email.from || "").toLowerCase();
          if (!from.includes("@")) return false;
          if (accountEmail && from.includes(accountEmail)) return false;
          return true;
        };
        const incoming = nextEmails.filter(isInbound);
        if (!inboxNotificationBootstrappedRef.current) {
          inboxNotificationBootstrappedRef.current = true;
          for (const e of incoming) seenIncomingEmailIdsRef.current.add(e._id);
        } else {
          const fresh = incoming.filter((e: InboxEmailItem) => !seenIncomingEmailIdsRef.current.has(e._id));
          for (const e of incoming) seenIncomingEmailIdsRef.current.add(e._id);
          if (seenIncomingEmailIdsRef.current.size > 1200) {
            const keep = Array.from(seenIncomingEmailIdsRef.current).slice(-600);
            seenIncomingEmailIdsRef.current = new Set(keep);
          }
          if (fresh.length > 0) {
            // Already handled by global notification system from backend
          }
        }
      } else {
        setInboxEmails([]);
        setInboxTotal(0);
      }
    } catch (err) {
      console.error('Failed to fetch inbox', err);
      setInboxEmails([]);
      setInboxTotal(0);
      toast.error('Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, activeCategory, relationshipFilter, outreachAccountFilter, page, pageSize, debouncedSearch, dateFrom, dateTo, accounts]);

  useEffect(() => {
    seenIncomingEmailIdsRef.current = new Set();
    inboxNotificationBootstrappedRef.current = false;
  }, [selectedAccountId]);

  const fetchConversation = useCallback(
    async (item: InboxEmailItem | null) => {
      if (!item || source !== "my-inbox") {
        setConversationEmails([]);
        return;
      }
      const accEmail = item.accountId.email?.toLowerCase() || "";


      const from = String(item.from || "").toLowerCase();
      const to = String(item.to || "").toLowerCase();
      const participant =
        accEmail && from.includes(accEmail) ? (to.split(",")[0] || "").trim() : from;
      if (!participant || !participant.includes("@")) {
        setConversationEmails([item]);
        return;
      }
      setConversationLoading(true);
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(
          `${CRM_API_URL}/crm/inbox-accounts/${item.accountId._id}/conversation?participant=${encodeURIComponent(participant)}&limit=80`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setConversationEmails(Array.isArray(data) ? data : []);
        } else {
          setConversationEmails([item]);
        }
      } catch {
        setConversationEmails([item]);
      } finally {
        setConversationLoading(false);
      }
    },
    [source],
  );

  const handleRealtimeInboxRefresh = useCallback(() => {
    if (source !== 'my-inbox') return;
    void (async () => {
      await fetchInboxEmails();
      if (selectedEmail) {
        await fetchConversation(selectedEmail);
      }
    })();
  }, [source, fetchInboxEmails, fetchConversation, selectedEmail]);

  /** List API returns body previews; load full HTML/text for the reading pane + reply. */
  const hydrateEmailDetail = useCallback(async (item: InboxEmailItem) => {
    if ((item as { meta?: { isLocalDraft?: boolean } }).meta?.isLocalDraft) {
      return;
    }
    const token = localStorage.getItem("token");
    const id = item._id;
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/inbox-accounts/emails/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const full = (await res.json()) as InboxEmailItem;
      setSelectedEmail((prev) => (prev && prev._id === id ? full : prev));
      setConversationEmails((prev) =>
        prev.map((row) => (row._id === id ? { ...row, ...full } : row)),
      );
      setInboxEmails((prev) =>
        prev.map((row) =>
          row._id === id
            ? {
                ...row,
                body: full.body ?? row.body,
                bodyHtml: full.bodyHtml ?? row.bodyHtml,
                meta: full.meta ?? row.meta,
              }
            : row,
        ),
      );
    } catch {
      /* keep list preview */
    }
  }, []);

  /** Deep-link from Sales Workspace: open a meeting invite / inbox item by id. */
  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (!highlight || source !== "my-inbox" || !accountsHydrated) return;
    let cancelled = false;
    const openHighlight = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(
          `${CRM_API_URL}/crm/inbox-accounts/emails/${encodeURIComponent(highlight)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok || cancelled) return;
        const full = (await res.json()) as InboxEmailItem;
        if (cancelled) return;
        setSelectedEmail(full);
        await fetchConversation(full);
        const next = new URLSearchParams(searchParams.toString());
        next.delete("highlight");
        const q = next.toString();
        router.replace(q ? `/crm/inbox?${q}` : "/crm/inbox");
      } catch {
        /* ignore */
      }
    };
    void openHighlight();
    return () => {
      cancelled = true;
    };
  }, [searchParams, source, accountsHydrated, router, fetchConversation]);

  const openEditAccount = (acc: EmailAccount) => {
    setEditingAccount(acc);
    setIsEditOpen(true);
    setAccountDropdownOpen(false);
  };

  const handleDeleteAccount = async (acc: EmailAccount) => {
    if (acc.canManage === false) {
      toast.error('Only the mailbox owner or an admin can remove this account');
      return;
    }
    if (!canDeleteInbox) {
      toast.error('You do not have permission to remove mailboxes');
      return;
    }
    if (!confirm(`Remove ${acc.displayName || acc.email}? This cannot be undone.`)) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/${acc._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Account removed');
        setAccountDropdownOpen(false);
        void fetchAccounts();
        void fetchInboxEmails();
        if (selectedAccountId === acc._id) setSelectedAccountId('');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(
          typeof err?.message === 'string'
            ? err.message
            : 'Failed to remove account',
        );
      }
    } catch {
      toast.error('Failed to remove account');
    }
  };

  const handleSync = async (
    accountId: string,
    options?: { syncAll?: boolean; folderType?: Category; isBackground?: boolean },
  ) => {
    if (!options?.isBackground) setSyncing(accountId);
    const token = localStorage.getItem('token');
    const syncAll = options?.syncAll ?? false;
    const body: Record<string, unknown> = { limit: 500 };
    if (syncAll) {
      body.all = true;
    } else if (options?.folderType && isMailFolderCategory(options.folderType)) {
      body.folderType = options.folderType;
    } else {
      body.folder = 'INBOX';
    }
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/${accountId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      void fetchAccounts();
      if (res.ok) {
        if (data?.lockSkipped || data?.errors?._lock) {
          if (!options?.isBackground) {
            toast.info('Sync already in progress — try again in a moment');
          }
          return;
        }
        const count = typeof data?.total === 'number' ? data.total : Number(data) || 0;
        const folderLabel =
          typeof data?.folder === 'string' ? data.folder : options?.folderType || 'INBOX';
        const errMap = data?.errors as Record<string, string> | undefined;
        const realErrors =
          errMap &&
          Object.fromEntries(
            Object.entries(errMap).filter(([key]) => key !== '_lock'),
          );
        if (realErrors && Object.keys(realErrors).length > 0) {
          console.warn('[CRM Inbox] partial sync errors', realErrors);
          if (!options?.isBackground) {
            toast.warning(
              `Synced ${count} messages; some folders failed. See Deliverability Health for details.`,
            );
          }
        } else if (syncAll) {
          if (!options?.isBackground) {
            toast.success(
              count > 0
                ? `Synced ${count} new messages from all folders`
                : 'Inbox is up to date — no new messages',
            );
          }
        } else {
          if (!options?.isBackground) {
            toast.success(
              count > 0
                ? `Synced ${count} new messages from ${folderLabel}`
                : `${folderLabel} is up to date — no new messages`,
            );
          }
        }
        void fetchInboxEmails();
      } else {
        if (!options?.isBackground) {
          const msg = Array.isArray(data?.message)
            ? data.message.join(', ')
            : data?.message;
          toast.error(
            typeof msg === 'string' && msg.trim()
              ? msg
              : 'Sync failed. Open Deliverability Health for error logs.',
          );
        }
      }
    } catch (err) {
      console.error(err);
      if (!options?.isBackground) toast.error('Sync failed');
    } finally {
      if (!options?.isBackground) setSyncing(null);
    }
  };

  const handleSyncProfile = async (acc: EmailAccount) => {
    if (acc.authType !== 'oauth') {
      toast.error('Only OAuth accounts can be synced automatically. For others, please edit the name manually.');
      return;
    }
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/${acc._id}/sync-profile`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Display name updated to: ${data.displayName}`);
        fetchAccounts();
      } else {
        const err = await res.json();
        toast.error(err.message || 'Failed to sync profile name');
      }
    } catch (err) {
      toast.error('Failed to sync profile name');
    }
  };

  const fetchWaConfig = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/whatsapp`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setWaConfig(data);
      }
    } catch (_) { }
  }, []);

  const fetchWaContacts = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/contacts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWaContacts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      toast.error('Failed to load WhatsApp contacts');
    }
  }, []);

  const fetchWaMessages = useCallback(async (waId: string) => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/conversations?waId=${waId}&pageSize=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWaMessages(data.messages || []);
      }
    } catch (err) {
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWaSend = async () => {
    if (!selectedWaId || !waNewMessage.trim()) return;
    const careWindow = getWhatsAppCareWindow(waMessages, Date.now());
    if (careWindow.status === 'expired' || careWindow.status === 'no_inbound') {
      toast.error(
        careWindow.status === 'no_inbound'
          ? 'No customer message yet — send an approved template to start the conversation.'
          : '24-hour messaging window expired — send an approved template instead.',
      );
      setWaTemplatePickerOpen(true);
      return;
    }
    setWaSending(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ to: selectedWaId, body: waNewMessage.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setWaNewMessage('');
        fetchWaMessages(selectedWaId);
        fetchWaContacts();
        toast.success('Message sent');
      } else {
        toast.error(data.error || 'Failed to send');
      }
    } catch (err) {
      toast.error('Failed to send');
    } finally {
      setWaSending(false);
    }
  };

  const formatPhone = (waId: string) => (waId.length >= 10 ? `+${waId}` : waId);

  useEffect(() => {
    void fetchAccounts();
    void fetchWaConfig();
  }, [fetchAccounts, fetchWaConfig]);

  useEffect(() => {
    const next =
      sourceParam && ['my-inbox', 'whatsapp'].includes(sourceParam)
        ? sourceParam
        : 'my-inbox';
    if (next !== source) {
      setSource(next);
      setSelectedEmail(null);
      setSelectedWaId(null);
    }
  }, [sourceParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (source === 'whatsapp') {
      void fetchWaContacts();
      return;
    }
    if (!accountsHydrated) return;
    if (accounts.length === 0) {
      setInboxEmails([]);
      setInboxTotal(0);
      setLoading(false);
      return;
    }
    // if source is my-inbox, we can fetch even if selectedAccountId is empty (means all accounts)
    void fetchInboxEmails();
  }, [
    source,
    selectedAccountId,
    activeCategory,
    page,
    pageSize,
    debouncedSearch,
    dateFrom,
    dateTo,
    fetchInboxEmails,
    fetchWaContacts,
    accountsHydrated,
    accounts.length,
  ]);

  useEffect(() => {
    void fetchConversation(selectedEmail);
  }, [selectedEmail?._id, fetchConversation]);



  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        await fetchInboxEmails();
        if (selectedEmail) {
          await fetchConversation(selectedEmail);
        }
      })();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [fetchInboxEmails, fetchConversation, selectedEmail]);

  useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<{
        event?: string;
        payload?: { type?: string };
      }>;
      const kind = custom.detail?.event;
      const notifType = custom.detail?.payload?.type;
      if (
        kind === 'crm:inbox:refresh' ||
        notifType === 'CRM_EMAIL_OPENED' ||
        notifType === 'CRM_EMAIL_CLICKED'
      ) {
        handleRealtimeInboxRefresh();
      }
    };
    window.addEventListener('crm:realtime-event', listener as EventListener);
    return () =>
      window.removeEventListener('crm:realtime-event', listener as EventListener);
  }, [handleRealtimeInboxRefresh]);

  useEffect(() => {
    if (source === 'whatsapp' && selectedWaId) fetchWaMessages(selectedWaId);
  }, [source, selectedWaId, fetchWaMessages]);

  // Auto-sync folder when user switches to a mail folder and sees nothing synced yet
  useEffect(() => {
    if (
      source === 'my-inbox' &&
      selectedAccountId &&
      ['inbox', 'sent', 'drafts', 'trash', 'spam'].includes(activeCategory) &&
      inboxEmails.length === 0 &&
      inboxTotal === 0 &&
      !syncing &&
      !hasAutoSyncedFolder.current.has(`${selectedAccountId}-${activeCategory}`)
    ) {
      hasAutoSyncedFolder.current.add(`${selectedAccountId}-${activeCategory}`);
      void handleSync(selectedAccountId, {
        syncAll: !isMailFolderCategory(activeCategory),
        folderType: isMailFolderCategory(activeCategory) ? activeCategory : undefined,
      });
    }
  }, [source, selectedAccountId, activeCategory, inboxEmails.length, inboxTotal, syncing]);

  const inboxFiltered = applyFilters(inboxEmails, filters, filterProperties);
  const fullConversationEmails = useMemo(
    () => (conversationEmails.length ? conversationEmails : selectedEmail ? [selectedEmail] : []),
    [conversationEmails, selectedEmail],
  );
  const renderedConversationEmails = useMemo(
    () =>
      fullConversationEmails.slice(-visibleConversationCount),
    [fullConversationEmails, visibleConversationCount],
  );
  const renderedWaMessages = useMemo(
    () => waMessages.slice(-visibleWaMessageCount).reverse(),
    [waMessages, visibleWaMessageCount],
  );

  const waCareWindow = useMemo(
    () => getWhatsAppCareWindow(waMessages, waNowMs),
    [waMessages, waNowMs],
  );
  const waFreeformAllowed =
    waCareWindow.status === 'open' || waCareWindow.status === 'expiring_soon';

  useEffect(() => {
    if (source !== 'whatsapp' || !selectedWaId) return;
    setWaNowMs(Date.now());
    const id = window.setInterval(() => setWaNowMs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [source, selectedWaId, waMessages.length]);

  const labelFilteredEmails = activeCustomLabelFilter
    ? inboxFiltered.filter((e) => emailLabels[e._id] === activeCustomLabelFilter)
    : inboxFiltered;
  const displayEmails = source === 'my-inbox' ? labelFilteredEmails : [];
  const displayTotal =
    source === 'my-inbox'
      ? labelFilteredEmails.length === inboxEmails.length
        ? inboxTotal
        : labelFilteredEmails.length
      : source === 'whatsapp'
        ? waContacts.length
        : 0;
  const listShowsEmpty = !loading && source === 'my-inbox' && displayEmails.length === 0;
  const paginationTotal = listShowsEmpty ? 0 : displayTotal;

  useEffect(() => {
    setVisibleConversationCount(MAX_RENDERED_CONVERSATION_ITEMS);
    setShowMessageDetails(false);
    setDetailActionsOpen(false);
  }, [selectedEmail?._id]);

  useEffect(() => {
    setVisibleWaMessageCount(MAX_RENDERED_WA_MESSAGES);
  }, [selectedWaId]);

  const selectedMailbox = useMemo(
    () => accounts.find((a) => a._id === selectedAccountId),
    [accounts, selectedAccountId],
  );

  useEffect(() => {
    if (!accountDropdownOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const el = accountDropdownRef.current;
      if (el && !el.contains(event.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [accountDropdownOpen]);

  const syncOptionsForCategory = useMemo(
    () => ({
      syncAll: activeCategory === 'all',
      folderType: isMailFolderCategory(activeCategory)
        ? activeCategory
        : activeCategory === 'all'
          ? undefined
          : ('inbox' as const),
    }),
    [activeCategory],
  );

  const autoSyncStateRef = useRef({
    accounts,
    selectedAccountId,
    syncOptionsForCategory,
    handleSync,
    selectedEmail,
    fetchConversation,
  });
  useEffect(() => {
    autoSyncStateRef.current = { accounts, selectedAccountId, syncOptionsForCategory, handleSync, selectedEmail, fetchConversation };
  }, [accounts, selectedAccountId, syncOptionsForCategory, handleSync, selectedEmail, fetchConversation]);

  useEffect(() => {
    if (source !== 'my-inbox') return;
    let timeoutId: NodeJS.Timeout;
    let isCancelled = false;

    const loop = async () => {
      if (isCancelled) return;

      try {
        await fetchInboxEmails();
        const state = autoSyncStateRef.current;
        if (!isCancelled && state.selectedEmail) {
          await state.fetchConversation(state.selectedEmail).catch(() => {});
        }
      } catch (err) {
        console.error('[CRM Inbox] Background refresh error:', err);
      } finally {
        if (!isCancelled) {
          timeoutId = setTimeout(loop, 60000);
        }
      }
    };

    timeoutId = setTimeout(loop, 60000);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [source, fetchInboxEmails]);

  const handleHeaderSync = () => {
    if (accounts.length === 0) {
      toast.error('Connect a mailbox first');
      return;
    }
    const targetId =
      selectedAccountId || (accounts.length === 1 ? accounts[0]._id : '');
    if (!targetId) {
      toast.info('Select a mailbox in the sidebar, or use ↻ on each account to sync.');
      return;
    }
    void handleSync(targetId, syncOptionsForCategory);
  };

  const selectedSyncError = useMemo(() => {
    const err = String(selectedMailbox?.syncState?.lastError || '').trim();
    if (err) return err;
    return String(selectedMailbox?.pushState?.lastPushError || '').trim();
  }, [selectedMailbox]);

  const categories = [
    { id: 'inbox', name: 'Inbox', tip: 'Received mail only (not Sent).', icon: Inbox, primary: true },
    { id: 'sent', name: 'Sent', tip: 'Outbound mail you sent from this mailbox.', icon: Send, primary: true },
    { id: 'drafts', name: 'Drafts', tip: 'Draft messages.', icon: FileText, primary: true },
    { id: 'trash', name: 'Deleted', tip: 'Deleted messages.', icon: Trash2, primary: true },
    { id: 'spam', name: 'Spam', tip: 'Spam folder.', icon: AlertOctagon, primary: true },
    { id: 'business', name: 'Business', tip: 'Business-classified messages.', icon: CheckCircle2, primary: false },
    { id: 'promotional', name: 'Promotional', tip: 'Promotional and marketing mail.', icon: Star, primary: false },
    { id: 'social', name: 'Social', tip: 'Social and notification-style mail.', icon: MessageCircle, primary: false },
    { id: 'all', name: 'All', tip: 'All folders across connected accounts.', icon: Mail, primary: false },
  ];

  return (
    <div className="theme-crm-hubspot absolute inset-0 flex flex-col overflow-hidden overscroll-contain bg-white">
      {/* Breadcrumb (slim) */}
      <div className="shrink-0 border-b border-border bg-[var(--surface-dim)]/10 px-8 py-2">
        <CrmBreadcrumb
          items={[
            { label: 'Home', href: '/crm/workspace/summary' },
            { label: 'Inbox' },
          ]}
        />
      </div>

      {/* Main Content Area (3-Pane Flush Layout) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col border-r border-border bg-[var(--surface-dim)]/20 transition-all duration-300 ease-in-out relative shrink-0",
            isSidebarCollapsed ? "w-20" : "w-72"
          )}
        >
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute -right-3 top-8 w-6 h-6 bg-white border border-border rounded-full flex items-center justify-center text-text-muted hover:text-primary shadow-sm z-50 transition-transform active:scale-95"
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          <div className="flex h-full flex-col overflow-hidden">
            {source === "my-inbox" && (() => {
              const isAllAccounts = selectedAccountId === '';
              const profileName = isAllAccounts
                ? (sidebarAccounts.length ? 'All Accounts' : (currentUser?.fullName || 'My Inbox'))
                : (selectedMailbox?.displayName || selectedMailbox?.email || currentUser?.fullName || 'My Inbox');
              const profileEmail = isAllAccounts
                ? (sidebarAccounts.length
                  ? `${sidebarAccounts.length} mailbox${sidebarAccounts.length !== 1 ? 'es' : ''}`
                  : (currentUser?.email || 'No mailboxes connected'))
                : (selectedMailbox?.email || currentUser?.email || '');
              return (
                <div
                  ref={accountDropdownRef}
                  className={cn("relative px-4 pt-4", isSidebarCollapsed && "px-2")}
                >
                  <button
                    type="button"
                    onClick={() => setAccountDropdownOpen((v) => !v)}
                    aria-expanded={accountDropdownOpen}
                    aria-haspopup="listbox"
                    title="Select email account"
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border border-[var(--border-color)] bg-white p-2 text-left transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--surface-dim)]/40",
                      accountDropdownOpen && "border-[var(--primary)]/40 shadow-sm",
                      isSidebarCollapsed && "justify-center p-1.5",
                    )}
                  >
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                      isAllAccounts ? "bg-slate-500" : senderAvatarColor(profileName, profileEmail || profileName),
                    )}>
                      {isAllAccounts ? <Mail size={16} /> : senderInitials(profileName, profileEmail || profileName)}
                    </div>
                    {!isSidebarCollapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {profileName}
                          </p>
                          {profileEmail && profileEmail !== profileName && (
                            <p className="truncate text-xs font-normal text-text-muted">
                              {profileEmail}
                            </p>
                          )}
                        </div>
                        <ChevronDown
                          size={16}
                          className={cn(
                            "shrink-0 text-text-muted transition-transform",
                            accountDropdownOpen && "rotate-180",
                          )}
                        />
                      </>
                    )}
                  </button>

                  {accountDropdownOpen && (
                    <div
                      role="listbox"
                      className={cn(
                        "absolute z-[300] mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-white py-1 shadow-[var(--crm-shadow-card)] custom-scrollbar",
                        isSidebarCollapsed ? "left-2 right-2 w-[240px]" : "left-4 right-4",
                      )}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={isAllAccounts}
                        onClick={() => {
                          setSelectedAccountId('');
                          setActiveCategory('all');
                          setPage(1);
                          setAccountDropdownOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors",
                          isAllAccounts
                            ? "bg-[var(--primary-light)] text-[var(--primary)]"
                            : "text-[var(--text-main)] hover:bg-[var(--surface-dim)]",
                        )}
                      >
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          isAllAccounts ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-text-muted",
                        )}>
                          <Mail size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">All Accounts</p>
                          <p className="truncate text-[10px] font-medium text-text-muted">
                            {accounts.length} connected
                          </p>
                        </div>
                        {isAllAccounts && <CheckCircle2 size={14} className="shrink-0 text-[var(--primary)]" />}
                      </button>

                      {sidebarAccounts.length > 0 && (
                        <div className="my-1 border-t border-[var(--border-color)]" />
                      )}

                      {sidebarAccounts.map((acc) => {
                        const isActive = selectedAccountId === acc._id;
                        const showManage =
                          acc.canManage !== false && (canConnectInbox || isAdmin);
                        const label = acc.displayName || acc.email;
                        return (
                          <div
                            key={acc._id}
                            className={cn(
                              "group relative flex w-full items-center",
                              isActive
                                ? "bg-[var(--primary-light)] text-[var(--primary)]"
                                : "text-[var(--text-main)] hover:bg-[var(--surface-dim)]",
                            )}
                          >
                            <button
                              type="button"
                              role="option"
                              aria-selected={isActive}
                              onClick={() => {
                                setSelectedAccountId(acc._id);
                                if (activeCategory === 'all') setActiveCategory('inbox');
                                setPage(1);
                                setAccountDropdownOpen(false);
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors"
                              title={acc.email}
                            >
                              <div className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                                senderAvatarColor(acc.displayName, acc.email),
                              )}>
                                {senderInitials(acc.displayName, acc.email)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <p className="truncate font-semibold">{label}</p>
                                  {inboxOutreachBadgeLabel(acc.outreachType) && (
                                    <span className="shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold bg-primary/10 text-primary">
                                      {inboxOutreachBadgeLabel(acc.outreachType)}
                                    </span>
                                  )}
                                </div>
                                {acc.displayName && acc.displayName !== acc.email && (
                                  <p className="truncate text-[10px] font-medium text-text-muted" title={acc.email}>
                                    {acc.email}
                                  </p>
                                )}
                              </div>
                              {isActive && (
                                <CheckCircle2 size={14} className="shrink-0 text-[var(--primary)]" />
                              )}
                            </button>
                            {showManage && (
                              <div
                                className={cn(
                                  "absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md px-0.5 py-0.5 opacity-0 pointer-events-none shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                                  isActive ? "bg-[var(--primary-light)]" : "bg-white",
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleSync(acc._id, syncOptionsForCategory);
                                  }}
                                  disabled={syncing === acc._id}
                                  className="rounded p-1 text-text-muted hover:text-primary disabled:opacity-40"
                                  title="Sync mail"
                                >
                                  <RefreshCw size={12} className={syncing === acc._id ? 'animate-spin' : ''} />
                                </button>
                                {canConnectInbox && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditAccount(acc);
                                    }}
                                    className="rounded p-1 text-text-muted hover:text-primary"
                                    title="Edit mailbox"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                )}
                                {canDeleteInbox && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleDeleteAccount(acc);
                                    }}
                                    className="rounded p-1 text-text-muted hover:text-error"
                                    title="Remove mailbox"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {(isAdmin || canConnectInbox) && (
                        <>
                          <div className="my-1 border-t border-[var(--border-color)]" />
                          <button
                            type="button"
                            onClick={() => {
                              setAccountDropdownOpen(false);
                              setIsConnectOpen(true);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-primary hover:bg-primary/5"
                          >
                            <Plus size={14} />
                            Add Account
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="p-4">
              <CrmButton
                onClick={() => setEmailModal({ mode: "compose" })}
                className={cn(
                  "h-10 w-full gap-2 rounded-[var(--radius-md)] bg-primary text-xs font-semibold hover:scale-[1.02] active:scale-95 transition-all",
                  isSidebarCollapsed && "p-0 h-10 w-10 rounded-full"
                )}
              >
                <Plus size={16} strokeWidth={3} />
                {!isSidebarCollapsed && "Compose"}
              </CrmButton>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6 custom-scrollbar">
              <div className="mb-6">
                <h4 className={cn(
                  "px-4 mb-2 text-sm font-bold text-slate-800",
                  isSidebarCollapsed && "text-center px-0 font-bold"
                )}>
                  {isSidebarCollapsed ? "Src" : "Source"}
                </h4>
                <nav className="space-y-0.5">
                  {[
                    { id: "my-inbox", label: "Email", icon: Mail },
                    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setInboxSource(s.id as Source);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold transition-all group",
                        source === s.id
                          ? "bg-primary text-white shadow-lg shadow-primary/20"
                          : "text-text-muted hover:bg-slate-100/50 hover:text-text-main"
                      )}
                      title={s.label}
                    >
                      <s.icon size={15} className={cn("shrink-0", source === s.id ? "text-white" : "text-text-muted group-hover:text-text-main")} />
                      {!isSidebarCollapsed && <span>{s.label}</span>}
                    </button>
                  ))}
                </nav>
              </div>

              {source === "my-inbox" && (
                <div className="mb-6">
                  <h4 className={cn(
                    "px-4 mb-2 text-sm font-bold text-slate-800",
                    isSidebarCollapsed && "text-center px-0 font-bold"
                  )}>
                    {isSidebarCollapsed ? "Fld" : "Emails"}
                  </h4>
                  <nav className="space-y-0.5">
                    {categories.filter((cat) => cat.primary || showMoreFolders).map((cat) => {
                      const isActive = activeCategory === cat.id;
                      const count =
                        isActive && isMailFolderCategory(cat.id as Category)
                          ? inboxTotal
                          : null;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setActiveCategory(cat.id as Category);
                            setPage(1);
                            if (cat.id === 'all') {
                              setSelectedAccountId('');
                            } else if (selectedAccountId === '') {
                              setSelectedAccountId(
                                lastSelectedAccountId || accounts[0]?._id || '',
                              );
                            }
                          }}
                          title={cat.tip}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2 rounded-[var(--radius-md)] text-xs font-semibold transition-all",
                            isSidebarCollapsed && "justify-center px-0",
                            isActive
                              ? "bg-white text-text-main shadow-sm"
                              : "text-text-muted hover:bg-white/70 hover:text-text-main"
                          )}
                        >
                          <cat.icon size={15} className={cn("shrink-0", isActive ? "text-primary" : "text-text-muted")} />
                          {!isSidebarCollapsed && (
                            <>
                              <span className="flex-1 text-left truncate">{cat.name}</span>
                              {count !== null && (
                                <span className={cn(
                                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums",
                                  isActive ? "bg-primary text-white" : "bg-slate-200 text-text-muted"
                                )}>
                                  {count}
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                    {!isSidebarCollapsed && (
                      <button
                        type="button"
                        onClick={() => setShowMoreFolders((v) => !v)}
                        className="w-full px-4 py-1.5 text-left text-[11px] font-bold text-primary hover:underline"
                      >
                        {showMoreFolders ? 'Show Less' : 'Show More'}
                      </button>
                    )}
                  </nav>
                </div>
              )}

              {source === "my-inbox" && (
                <div className="mb-4">
                  <h4 className={cn(
                    "px-4 mb-2 text-sm font-bold text-slate-800",
                    isSidebarCollapsed && "text-center px-0 font-bold"
                  )}>
                    {isSidebarCollapsed ? "Rel" : "Relationship"}
                  </h4>
                  <nav className="space-y-0.5">
                    {[
                      { id: 'freelancer' as const, name: 'Freelancer', dot: 'bg-emerald-500' },
                      { id: 'agency' as const, name: 'Agency', dot: 'bg-amber-500' },
                      { id: 'both' as const, name: 'Both', dot: 'bg-rose-500' },
                    ].map((label) => (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => {
                          setRelationshipFilter((prev) => (prev === label.id ? 'all' : label.id));
                          setPage(1);
                        }}
                        title={label.name}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 rounded-[var(--radius-md)] text-xs font-semibold transition-all",
                          isSidebarCollapsed && "justify-center px-0",
                          relationshipFilter === label.id
                            ? "bg-white text-text-main shadow-sm"
                            : "text-text-muted hover:bg-white/70 hover:text-text-main"
                        )}
                      >
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", label.dot)} />
                        {!isSidebarCollapsed && <span className="flex-1 text-left truncate">{label.name}</span>}
                      </button>
                    ))}
                  </nav>
                </div>
              )}

              {source === "my-inbox" && (
                <div className="mb-4">
                  <div className={cn(
                    "flex items-center justify-between px-4 mb-2",
                    isSidebarCollapsed && "justify-center px-0"
                  )}>
                    <h4 className="text-sm font-bold text-slate-800">
                      {isSidebarCollapsed ? "Lbl" : "Labels"}
                    </h4>
                    {!isSidebarCollapsed && (
                      <button
                        type="button"
                        onClick={() => setShowAddLabelForm((v) => !v)}
                        title="Add label"
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                      >
                        <Plus size={11} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                  {showAddLabelForm && !isSidebarCollapsed && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        addCustomLabel();
                      }}
                      className="mb-2 px-4 flex items-center gap-1.5"
                    >
                      <input
                        autoFocus
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        placeholder="Label name"
                        className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-white px-2 text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="flex shrink-0 items-center gap-1">
                        {LABEL_COLOR_PALETTE.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setNewLabelColor(c.id)}
                            title={c.id}
                            className={cn(
                              "h-4 w-4 shrink-0 rounded-full transition-all",
                              c.dot,
                              newLabelColor === c.id ? "ring-2 ring-offset-1 ring-slate-400" : ""
                            )}
                          />
                        ))}
                      </div>
                      <button
                        type="submit"
                        disabled={!newLabelName.trim()}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-white disabled:opacity-40"
                        title="Add"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    </form>
                  )}
                  <nav className="space-y-0.5">
                    {customLabels.filter((l) => l.primary || showMoreLabels).map((label) => (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => setActiveCustomLabelFilter((prev) => (prev === label.id ? null : label.id))}
                        title={label.name}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 rounded-[var(--radius-md)] text-xs font-semibold transition-all",
                          isSidebarCollapsed && "justify-center px-0",
                          activeCustomLabelFilter === label.id
                            ? "bg-white text-text-main shadow-sm"
                            : "text-text-muted hover:bg-white/70 hover:text-text-main"
                        )}
                      >
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", label.dot)} />
                        {!isSidebarCollapsed && <span className="flex-1 text-left truncate">{label.name}</span>}
                      </button>
                    ))}
                    {!isSidebarCollapsed && customLabels.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowMoreLabels((v) => !v)}
                        className="w-full px-4 py-1.5 text-left text-[11px] font-bold text-primary hover:underline"
                      >
                        {showMoreLabels ? 'Show Less' : 'Show More'}
                      </button>
                    )}
                  </nav>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* List Section */}
        <div className={cn(
          "flex flex-col border-r border-border transition-all duration-300 overflow-hidden bg-white shrink-0",
          (selectedEmail || selectedWaId) ? "w-[400px]" : "flex-1"
        )}>
          {/* List Toolbar */}
          <div className="border-b border-border bg-[var(--surface-dim)]/5">
            {source === 'my-inbox' && selectedSyncError && (
              <div className="mx-6 mt-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-amber-800">
                    Sync issue — {selectedMailbox?.email || 'mailbox'}
                  </p>
                  <p className="mt-1 text-xs text-amber-900 font-mono leading-snug break-words">
                    {selectedSyncError}
                  </p>
                  {selectedMailbox?.syncState?.lastErrorAt && (
                    <p className="mt-1 text-[10px] text-amber-800/80">
                      {new Date(selectedMailbox.syncState.lastErrorAt).toLocaleString()}
                      {selectedMailbox.syncState.consecutiveFailures
                        ? ` · ${selectedMailbox.syncState.consecutiveFailures} failed attempt(s)`
                        : ''}
                    </p>
                  )}
                </div>
                <Link
                  href="/crm/settings/email-deliverability/health"
                  className="shrink-0 text-xs font-bold uppercase tracking-wider text-primary hover:underline"
                >
                  View health logs
                </Link>
              </div>
            )}
          <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap border-b border-[var(--border-color)]">
            <div className="min-w-0">
              <h2 className="mb-1 text-lg font-bold tracking-tight text-[var(--text-main)] capitalize">
                {source === 'whatsapp' ? 'WhatsApp' : activeCategory === 'all' ? 'All Mail' : activeCategory}
              </h2>
              <div className="flex items-center text-xs font-medium text-[var(--text-muted)]">
                {source === 'whatsapp' ? (
                  <span>{waContacts.length} conversation{waContacts.length !== 1 ? 's' : ''}</span>
                ) : (
                  <>
                    <span>{inboxTotal} Email{inboxTotal !== 1 ? 's' : ''}</span>
                    <span className="mx-1 inline-flex text-[var(--primary)]" aria-hidden>•</span>
                    <span>
                      {inboxEmails.filter((e) => !e.isRead).length} Unread
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {source === 'whatsapp' && waConfigured && (
                <>
                  <button
                    type="button"
                    onClick={() => setWaNewChatOpen(true)}
                    className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-semibold text-text-main hover:bg-slate-50"
                    title="New chat"
                  >
                    <Plus size={14} /> New chat
                  </button>
                  <Link
                    href="/crm/settings/whatsapp-templates"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                    title="WhatsApp templates"
                  >
                    <FileText size={15} />
                  </Link>
                  <Link
                    href="/crm/settings/integrations/whatsapp"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                    title="WhatsApp settings"
                  >
                    <Settings size={15} />
                  </Link>
                </>
              )}
              <div className="relative flex h-9 w-full max-w-[220px] items-stretch overflow-hidden rounded-md border border-[var(--border-color)] bg-white">
                <span className="flex items-center border-r border-[var(--border-color)] px-2.5 text-[var(--text-muted)]">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-xs font-medium text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </div>
              {source === 'my-inbox' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowFilters((v) => !v)}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                      showFilters ? "bg-[var(--primary-light)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                    )}
                    title="Filters"
                    aria-pressed={showFilters}
                  >
                    <Filter size={15} />
                  </button>
                  <Link
                    href="/crm/settings/email-deliverability/health"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                    title="Mailbox settings"
                  >
                    <Settings size={15} />
                  </Link>
                  <button
                    type="button"
                    onClick={handleHeaderSync}
                    disabled={!!syncing}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] disabled:opacity-50"
                    title="Sync mail"
                  >
                    {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  </button>
                </>
              )}
            </div>
          </div>
          {showFilters && (
          <div className="min-h-[48px] py-2 flex items-center px-6 gap-3 flex-wrap">
            {source === 'my-inbox' && (
              <div className="flex items-center gap-2 shrink-0">
                <CalendarRange size={14} className="text-text-muted hidden sm:block" aria-hidden />
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
                  <span className="sr-only">From date</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 rounded-lg border border-border/60 bg-white px-2 text-xs font-semibold text-text-main tabular-nums"
                  />
                </label>
                <span className="text-text-muted text-xs font-bold">–</span>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
                  <span className="sr-only">To date</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 rounded-lg border border-border/60 bg-white px-2 text-xs font-semibold text-text-main tabular-nums"
                  />
                </label>
                {(dateFrom || dateTo) && (
                  <div className="group relative inline-flex shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-white text-primary transition-colors hover:bg-primary/5"
                      aria-label="Clear date range"
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                    <span className={INBOX_ICON_FILTER_TIP} role="tooltip">
                      Clear date range filter
                    </span>
                  </div>
                )}
              </div>
            )}
            {source === 'my-inbox' && (
              <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
                <div
                  className="flex items-center gap-0.5 rounded-lg border border-emerald-200/60 bg-emerald-50/40 p-0.5"
                  role="group"
                  aria-label="Mailbox outreach type"
                >
                  {OUTREACH_MAILBOX_FILTERS.map(({ id, tip, icon: Icon }) => (
                    <div key={id} className="group relative inline-flex shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setOutreachAccountFilter(id);
                          setPage(1);
                        }}
                        className={cn(
                          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-text-muted transition-colors',
                          outreachAccountFilter === id
                            ? 'border-emerald-600/30 bg-emerald-600 text-white shadow-sm'
                            : 'hover:bg-white/80 hover:text-emerald-700',
                        )}
                        aria-pressed={outreachAccountFilter === id}
                        aria-label={tip}
                      >
                        <Icon size={15} strokeWidth={2.25} />
                      </button>
                      <span className={INBOX_ICON_FILTER_TIP} role="tooltip">
                        {tip}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
            {loading ? (
              <div className="p-8 space-y-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="animate-pulse space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-slate-100" />
                      <div className="h-4 w-1/2 rounded bg-slate-100" />
                    </div>
                    <div className="h-3 w-full rounded bg-[var(--surface-dim)]" />
                  </div>
                ))}
              </div>
            ) : source === 'whatsapp' ? (
              <div className="divide-y divide-border/20">
                {!waConfigured ? (
                  <div className="p-16 text-center">
                    <div className="w-20 h-20 bg-[var(--surface-dim)] rounded-full flex items-center justify-center mx-auto mb-6">
                      <MessageCircle size={32} className="text-text-muted opacity-20" />
                    </div>
                    <h3 className="text-xs font-semibold text-text-main">WhatsApp not connected</h3>
                    <p className="text-xs text-text-muted mt-2 leading-relaxed max-w-[260px] mx-auto">
                      Connect your Meta WhatsApp Business account to chat with customers here.
                    </p>
                    <Link
                      href="/crm/settings/integrations/whatsapp"
                      className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Settings size={14} /> Configure WhatsApp
                    </Link>
                  </div>
                ) : waContacts.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="w-20 h-20 bg-[var(--surface-dim)] rounded-full flex items-center justify-center mx-auto mb-6">
                      <MessageCircle size={32} className="text-text-muted opacity-20" />
                    </div>
                    <h3 className="text-xs font-semibold text-text-main">No conversations</h3>
                    <p className="text-xs text-text-muted mt-2 leading-relaxed">
                      Incoming messages appear here, or start a chat with a phone number.
                    </p>
                    <button
                      type="button"
                      onClick={() => setWaNewChatOpen(true)}
                      className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-white px-4 py-2.5 text-xs font-semibold text-text-main hover:bg-slate-50"
                    >
                      <Plus size={14} /> New chat
                    </button>
                  </div>
                ) : (
                  waContacts.map((c) => {
                    const isSelected = selectedWaId === c.waId;
                    return (
                      <button
                        key={c.waId}
                        onClick={() => setSelectedWaId(c.waId)}
                        className={cn(
                          "group relative flex w-full items-center gap-4 px-6 py-5 text-left transition-all",
                          isSelected ? "bg-emerald-50/40 border-l-[4px] border-emerald-500 pl-5 text-emerald-900" : "hover:bg-[var(--surface-dim)]/80 border-l-[4px] border-transparent"
                        )}
                      >
                        <div className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-all shadow-sm",
                          isSelected ? "bg-emerald-500 text-white" : "bg-emerald-50 text-emerald-600"
                        )}>
                          <Phone size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={cn(
                              "text-sm font-bold truncate flex-1 min-w-0",
                              isSelected ? "text-emerald-900" : "text-text-main"
                            )}>
                              {formatPhone(c.waId)}
                            </span>
                            <span className="text-xs font-bold text-text-muted tabular-nums opacity-60">
                              {new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs font-bold text-text-muted opacity-40">
                            Active WhatsApp
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : displayEmails.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-12 text-center">
                <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-[var(--surface-dim)] text-slate-200">
                  <Mail size={48} strokeWidth={1} />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  {source === 'my-inbox' && accounts.length === 0 ? "Connect your inbox" : "No messages found"}
                </h3>
                <p className="mt-2 text-xs font-medium text-text-muted leading-relaxed max-w-[240px]">
                  {source === 'my-inbox' && accounts.length === 0
                    ? "Link your Gmail or Outlook account to start managing your communications here."
                    : "Try a different search, adjust the date range, or switch categories."}
                </p>
                {source === 'my-inbox' && accounts.length === 0 && (() => {
                  if (!isAdmin && !canConnectInbox) return null;
                  return (
                    <CrmButton
                      onClick={() => setIsConnectOpen(true)}
                      className="mt-8 h-12 px-8 rounded-[var(--radius-md)] bg-primary text-xs font-semibold active:scale-95 transition-all"
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Link Account
                    </CrmButton>
                  );
                })()}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {displayEmails.map((email) => {
                  const fromLabel = email.fromName || email.from;
                  const isToday = new Date(email.date).toDateString() === new Date().toDateString();
                  const isSelected = selectedEmail?._id === email._id;
                  const isStarred = starredIds.has(email._id);
                  const assignedLabel = emailLabels[email._id]
                    ? customLabels.find((l) => l.id === emailLabels[email._id])
                    : undefined;

                  const attachments = email.meta?.attachments || [];
                  const isImageAtt = (a: { filename?: string; contentType?: string; isInline?: boolean }) => {
                    const ct = String(a.contentType || '').toLowerCase();
                    if (ct.startsWith('image/')) return true;
                    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(a.filename || ''))) return true;
                    // Inline parts with a generic type are almost always embedded pictures.
                    return !!a.isInline && (!ct || ct === 'application/octet-stream');
                  };
                  const imageAttachments = attachments.filter(isImageAtt);
                  const fileAttachments = attachments.filter((a) => !isImageAtt(a));

                  return (
                    <div
                      key={email._id}
                      onClick={() => {
                        setSelectedEmail(email);
                        void hydrateEmailDetail(email);
                        if (!email.isRead) {
                          markEmailAsRead(email._id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedEmail(email);
                          void hydrateEmailDetail(email);
                          if (!email.isRead) markEmailAsRead(email._id);
                        }
                      }}
                      className={cn(
                        "group relative w-full cursor-pointer px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "bg-[var(--primary-light)]/70"
                          : !email.isRead
                            ? "bg-[var(--surface-dim)]/30 hover:bg-[var(--surface-dim)]/55"
                            : "bg-white hover:bg-[var(--surface-dim)]/40",
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <div
                          className="flex shrink-0 items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]/20"
                            aria-label={`Select ${fromLabel}`}
                            onChange={() => {}}
                          />
                        </div>

                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                          <div className={cn(
                            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
                            senderAvatarColor(email.fromName, email.from)
                          )}>
                            {senderInitials(email.fromName, email.from)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h6 className={cn(
                                  "mb-0.5 truncate text-[15px] leading-snug text-[var(--text-main)]",
                                  !email.isRead ? "font-bold" : "font-semibold",
                                )}>
                                  {fromLabel}
                                </h6>
                                <span className={cn(
                                  "block truncate text-sm text-[var(--text-main)]",
                                  !email.isRead ? "font-semibold" : "font-medium",
                                )}>
                                  {email.subject || "No Subject"}
                                </span>
                              </div>

                              <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenRowMenuId((prev) => (prev === email._id ? null : email._id));
                                    }}
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                                    title="More actions"
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>
                                  {openRowMenuId === email._id && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 top-8 z-20 w-44 rounded-md border border-[var(--border-color)] bg-white py-1 shadow-[var(--crm-shadow-card)]"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenRowMenuId(null);
                                          setSelectedEmail(email);
                                          void hydrateEmailDetail(email);
                                        }}
                                        className="flex w-full items-center px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                                      >
                                        Open Email
                                      </button>
                                      {!isDraftItem(email) && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenRowMenuId(null);
                                              setEmailModal({ mode: "reply", item: email });
                                            }}
                                            className="flex w-full items-center px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                                          >
                                            Reply
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenRowMenuId(null);
                                              setEmailModal({ mode: "forward", item: email });
                                            }}
                                            className="flex w-full items-center px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                                          >
                                            Forward
                                          </button>
                                        </>
                                      )}
                                      {!email.isRead ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenRowMenuId(null);
                                            void markEmailAsRead(email._id);
                                          }}
                                          className="flex w-full items-center px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                                        >
                                          Mark as read
                                        </button>
                                      ) : null}
                                      <div className="my-1 border-t border-[var(--border-color)]" />
                                      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                                        Label
                                      </p>
                                      {customLabels.map((label) => (
                                        <button
                                          key={label.id}
                                          type="button"
                                          onClick={() => {
                                            setOpenRowMenuId(null);
                                            setEmailLabel(
                                              email._id,
                                              emailLabels[email._id] === label.id ? null : label.id,
                                            );
                                          }}
                                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                                        >
                                          <span className={cn("h-2 w-2 shrink-0 rounded-full", label.dot)} />
                                          <span className="flex-1 truncate">{label.name}</span>
                                          {emailLabels[email._id] === label.id && (
                                            <CheckCircle2 size={12} className="shrink-0 text-[var(--primary)]" />
                                          )}
                                        </button>
                                      ))}
                                      {canDeleteInboxMessage && (
                                        <>
                                          <div className="my-1 border-t border-[var(--border-color)]" />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenRowMenuId(null);
                                              void handleDeleteEmail(email._id);
                                            }}
                                            className="flex w-full items-center px-3 py-1.5 text-left text-xs font-semibold text-[var(--error)] hover:bg-[var(--error-light)]"
                                          >
                                            Delete
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-[var(--text-muted)]">
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      !email.isRead ? "bg-emerald-500" : "bg-[var(--primary)]",
                                    )}
                                    aria-hidden
                                  />
                                  {isToday
                                    ? new Date(email.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : new Date(email.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            </div>

                            <p className="mt-1 line-clamp-1 text-sm leading-snug text-[var(--text-muted)]">
                              {emailSnippet(email.bodyHtml || email.body) || '—'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          {fileAttachments.length > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-dim)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                              <FolderOpen size={12} />
                              {fileAttachments.length}
                            </span>
                          )}
                          {imageAttachments.length > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-dim)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                              <ImageIcon size={12} />
                              +{imageAttachments.length}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStarred(email._id);
                            }}
                            className={cn(
                              "transition-colors",
                              isStarred
                                ? "text-amber-400"
                                : "text-[var(--text-muted)]/35 hover:text-amber-400",
                            )}
                            title={isStarred ? 'Unstar' : 'Star'}
                          >
                            <Star
                              size={14}
                              className={isStarred ? "fill-amber-400" : ""}
                            />
                          </button>
                          {email.relationshipLabel && (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize text-[var(--primary)] bg-[var(--primary-light)]">
                              <Square size={10} className="fill-current opacity-70" />
                              {email.relationshipLabel}
                            </span>
                          )}
                          {assignedLabel && (
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                              assignedLabel.pill,
                            )}>
                              <Square size={10} className="fill-current opacity-70" />
                              {assignedLabel.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* List Pagination */}
          <div className="shrink-0 border-t border-border bg-[var(--surface-dim)]/10 px-3">
            <Pagination
              total={paginationTotal}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              className="border-t-0 bg-transparent px-0 py-1.5"
            />
          </div>
        </div>

        {/* Detailed Pane - Gmail-style reader */}
        {(selectedEmail || (source === 'whatsapp' && selectedWaId)) && (
          <div className="flex flex-1 flex-col overflow-hidden bg-white animate-in fade-in duration-200">
            {selectedEmail ? (
              <div className="flex h-full flex-col overflow-hidden">
                {/* Gmail-style toolbar */}
                <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border-color)] px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedEmail(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                    title="Back to list"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="mx-1 h-5 w-px bg-[var(--border-color)]" />
                  {canDeleteInboxMessage && (
                    <button
                      type="button"
                      onClick={() => handleDeleteEmail(selectedEmail._id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--error)]"
                      title="Delete"
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                  {(activeCategory === 'promotional' || activeCategory === 'inbox' || activeCategory === 'business') && (
                    <button
                      type="button"
                      onClick={() =>
                        handleMoveToCategory(
                          selectedEmail._id,
                          activeCategory === 'promotional' ? 'business' : 'promotional',
                          'sender',
                        )
                      }
                      disabled={movingCategoryId === selectedEmail._id}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] disabled:opacity-50"
                      title={activeCategory === 'promotional' ? 'Move to Business' : 'Mark as Promotional'}
                    >
                      {movingCategoryId === selectedEmail._id ? (
                        <Loader2 size={17} className="animate-spin" />
                      ) : activeCategory === 'promotional' ? (
                        <Archive size={17} />
                      ) : (
                        <Star size={17} />
                      )}
                    </button>
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDetailActionsOpen((v) => !v)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                      title="More actions"
                    >
                      <MoreVertical size={17} />
                    </button>
                    {detailActionsOpen && (
                      <div className="absolute left-0 top-10 z-30 w-52 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white py-1 shadow-[var(--crm-shadow-card)]">
                        <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          Relationship
                        </p>
                        {(['freelancer', 'agency', 'both'] as RelationshipLabel[]).map((label) => (
                          <button
                            key={label}
                            type="button"
                            disabled={labelingEmailId === selectedEmail._id}
                            onClick={() => {
                              void handleSetRelationshipLabel(selectedEmail._id, label);
                              setDetailActionsOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center px-3 py-1.5 text-left text-xs font-semibold capitalize hover:bg-[var(--surface-dim)]",
                              selectedEmail.relationshipLabel === label
                                ? "text-[var(--primary)]"
                                : "text-[var(--text-main)]",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                        {selectedEmail.relationshipLabel && (
                          <button
                            type="button"
                            disabled={labelingEmailId === selectedEmail._id}
                            onClick={() => {
                              void handleSetRelationshipLabel(selectedEmail._id, null);
                              setDetailActionsOpen(false);
                            }}
                            className="flex w-full items-center px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
                          >
                            Clear label
                          </button>
                        )}
                        <div className="my-1 border-t border-[var(--border-color)]" />
                        {activeCategory === 'promotional' && (
                          <button
                            type="button"
                            disabled={movingCategoryId === selectedEmail._id}
                            onClick={() => {
                              void handleMoveToCategory(selectedEmail._id, 'business', 'sender');
                              setDetailActionsOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                          >
                            <CheckCircle2 size={13} /> Move to Business
                          </button>
                        )}
                        {(activeCategory === 'business' || activeCategory === 'inbox') && (
                          <button
                            type="button"
                            disabled={movingCategoryId === selectedEmail._id}
                            onClick={() => {
                              void handleMoveToCategory(selectedEmail._id, 'promotional', 'sender');
                              setDetailActionsOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                          >
                            <Star size={13} /> Mark promotional
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-0.5">
                    {conversationLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--text-muted)]" />
                    )}
                    {!isDraftItem(selectedEmail) && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setEmailModal({ mode: "reply", item: selectedEmail })
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                          title="Reply"
                        >
                          <Reply size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEmailModal({ mode: "reply", item: selectedEmail })
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                          title="Reply all"
                        >
                          <ReplyAll size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEmailModal({ mode: "forward", item: selectedEmail })
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                          title="Forward"
                        >
                          <Forward size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEmailModal({
                              mode: "reply",
                              item: selectedEmail,
                              autoAiDraft: true,
                            })
                          }
                          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-light)]"
                          title="Reply with AI"
                        >
                          <Sparkles size={14} />
                          AI
                        </button>
                      </>
                    )}
                    {isDraftItem(selectedEmail) && (
                      <button
                        type="button"
                        onClick={() =>
                          setEmailModal({ mode: "edit_draft", item: selectedEmail })
                        }
                        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-light)]"
                      >
                        <Pencil size={14} /> Edit draft
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                  <div className="px-6 pb-2 pt-5 sm:px-8">
                    <h1 className="text-[22px] font-normal leading-snug tracking-tight text-[var(--text-main)]">
                      {selectedEmail.subject || "(No Subject)"}
                    </h1>
                  </div>

                  <div className="px-3 pb-8 sm:px-5">
                    {renderedConversationEmails.length < fullConversationEmails.length && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleConversationCount((prev) => prev + RENDER_WINDOW_INCREMENT)
                        }
                        className="mb-2 w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-light)]"
                      >
                        Show older messages
                      </button>
                    )}

                    <div className="space-y-2">
                      {renderedConversationEmails.map((m) => {
                        const displayMsg =
                          selectedEmail && m._id === selectedEmail._id ? selectedEmail : m;
                        const isExpanded = m._id === selectedEmail._id;
                        const accEmail = String(m.accountId?.email || "")
                          .trim()
                          .toLowerCase();
                        const isSelf =
                          !!accEmail &&
                          String(m.from || "")
                            .toLowerCase()
                            .includes(accEmail);
                        const displayName = isSelf
                          ? "me"
                          : m.fromName || m.from.split("<")[0]?.trim() || m.from;
                        const fromEmail = m.from.includes("@")
                          ? (m.from.match(/<([^>]+)>/)?.[1] || m.from)
                          : m.from;

                        if (!isExpanded) {
                          return (
                            <button
                              key={m._id}
                              type="button"
                              onClick={() => {
                                setSelectedEmail(m);
                                void hydrateEmailDetail(m);
                              }}
                              className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-color)] bg-white px-3 py-2.5 text-left transition hover:shadow-sm"
                            >
                              <div className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                                senderAvatarColor(m.fromName, m.from),
                              )}>
                                {senderInitials(m.fromName, m.from)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="truncate text-sm font-semibold text-[var(--text-main)]">
                                    {displayName}
                                  </span>
                                  <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
                                    {m.date
                                      ? new Date(m.date).toLocaleString([], {
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : ""}
                                  </span>
                                </div>
                                <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-muted)]">
                                  {emailSnippet(displayMsg.bodyHtml || displayMsg.body)}
                                </p>
                              </div>
                            </button>
                          );
                        }

                        return (
                          <div
                            key={m._id}
                            className="rounded-2xl border border-[var(--border-color)] bg-white shadow-sm"
                          >
                            <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
                              <div className={cn(
                                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
                                senderAvatarColor(m.fromName, m.from),
                              )}>
                                {senderInitials(m.fromName, m.from)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                      <span className="text-sm font-semibold text-[var(--text-main)]">
                                        {displayName}
                                      </span>
                                      <span className="truncate text-xs text-[var(--text-muted)]">
                                        &lt;{fromEmail}&gt;
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setShowMessageDetails((v) => !v)}
                                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                    >
                                      to {isSelf ? "me" : (m.toName || m.to || "me")}
                                      <ChevronDown
                                        size={12}
                                        className={cn(
                                          "transition-transform",
                                          showMessageDetails && "rotate-180",
                                        )}
                                      />
                                    </button>
                                    {showMessageDetails && (
                                      <div className="mt-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)]/40 px-3 py-2 text-xs text-[var(--text-muted)]">
                                        <div className="grid gap-1">
                                          <p>
                                            <span className="inline-block w-10 font-semibold text-[var(--text-main)]">from</span>
                                            {m.fromName ? `${m.fromName} ` : ""}&lt;{fromEmail}&gt;
                                          </p>
                                          <p>
                                            <span className="inline-block w-10 font-semibold text-[var(--text-main)]">to</span>
                                            {m.toName ? `${m.toName} ` : ""}{m.to}
                                          </p>
                                          <p>
                                            <span className="inline-block w-10 font-semibold text-[var(--text-main)]">date</span>
                                            {m.date ? new Date(m.date).toLocaleString() : "—"}
                                          </p>
                                          <p>
                                            <span className="inline-block w-10 font-semibold text-[var(--text-main)]">subject</span>
                                            {m.subject || "(No Subject)"}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <span className="mr-1 text-xs tabular-nums text-[var(--text-muted)]">
                                      {m.date
                                        ? new Date(m.date).toLocaleString([], {
                                            weekday: "short",
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : ""}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => toggleStarred(m._id)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
                                      title={starredIds.has(m._id) ? "Unstar" : "Star"}
                                    >
                                      <Star
                                        size={15}
                                        className={starredIds.has(m._id) ? "fill-amber-400 text-amber-400" : ""}
                                      />
                                    </button>
                                    {!isDraftItem(m) && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => setEmailModal({ mode: "reply", item: m })}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
                                          title="Reply"
                                        >
                                          <Reply size={15} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEmailModal({ mode: "forward", item: m })}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
                                          title="Forward"
                                        >
                                          <Forward size={15} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="border-t border-[var(--border-color)]/60 px-4 py-5 sm:px-6 sm:pl-[4.25rem]">
                              {displayMsg.bodyHtml ? (
                                <CrmEmailActivityBody
                                  bodyHtml={displayMsg.bodyHtml}
                                  emailId={m._id}
                                  attachments={displayMsg.meta?.attachments}
                                  className="w-full min-h-[420px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white"
                                />
                              ) : (
                                <div className="crm-email-body-content max-w-none whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]">
                                  {emailBodyPlainText(displayMsg.bodyHtml, displayMsg.body)}
                                </div>
                              )}

                              {displayMsg.meta?.attachments && displayMsg.meta.attachments.length > 0 && (
                                <div className="mt-6 border-t border-[var(--border-color)] pt-4">
                                  <h4 className="mb-3 text-xs font-semibold text-[var(--text-muted)]">
                                    {displayMsg.meta.attachments.length} Attachment
                                    {displayMsg.meta.attachments.length !== 1 ? "s" : ""}
                                  </h4>
                                  <CrmEmailActivityAttachments
                                    emailId={m._id}
                                    attachments={displayMsg.meta.attachments}
                                    onDownload={(emailId, att) =>
                                      handleDownloadAttachment(emailId, att)
                                    }
                                  />
                                </div>
                              )}
                            </div>

                            {!isDraftItem(m) && (
                              <div className="flex flex-wrap gap-2 border-t border-[var(--border-color)]/60 px-4 py-3 sm:pl-[4.25rem]">
                                <button
                                  type="button"
                                  onClick={() => setEmailModal({ mode: "reply", item: m })}
                                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border-color)] bg-white px-4 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                                >
                                  <Reply size={15} /> Reply
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEmailModal({ mode: "reply", item: m })}
                                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border-color)] bg-white px-4 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                                >
                                  <ReplyAll size={15} /> Reply all
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEmailModal({ mode: "forward", item: m })}
                                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border-color)] bg-white px-4 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                                >
                                  <Forward size={15} /> Forward
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEmailModal({
                                      mode: "reply",
                                      item: m,
                                      autoAiDraft: true,
                                    })
                                  }
                                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--primary)]/25 bg-[var(--primary-light)] px-4 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/15"
                                >
                                  <Sparkles size={14} /> AI Reply
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : source === 'whatsapp' && selectedWaId ? (
              <div className="flex h-full flex-col overflow-hidden bg-white">
                <>
                  <div className="flex h-20 shrink-0 items-center justify-between border-b border-border/40 px-8 bg-emerald-50/5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 font-bold">
                        {formatPhone(selectedWaId).slice(-2)}
                      </div>
                      <div>
                        <h3 className="text-base font-black text-text-main tracking-tight">{formatPhone(selectedWaId)}</h3>
                        <p className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em]">WhatsApp Active</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWaTemplatePickerOpen(true)}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <FileText size={14} /> Use template
                    </button>
                  </div>

                  {waCareWindow.status === 'open' && (
                    <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/80 px-6 py-2.5 text-xs font-semibold text-emerald-800">
                      <Clock size={14} className="shrink-0" />
                      Free-form replies open — window expires in {formatWaWindowCountdown(waCareWindow.remainingMs)}
                      {waCareWindow.expiresAt
                        ? ` (${waCareWindow.expiresAt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`
                        : ''}
                    </div>
                  )}
                  {waCareWindow.status === 'expiring_soon' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs font-semibold text-amber-900">
                      <span className="inline-flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" />
                        Messaging window expires in {formatWaWindowCountdown(waCareWindow.remainingMs)}. Reply soon, or prepare a template.
                      </span>
                      <button
                        type="button"
                        onClick={() => setWaTemplatePickerOpen(true)}
                        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                      >
                        Use template
                      </button>
                    </div>
                  )}
                  {waCareWindow.status === 'expired' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-6 py-2.5 text-xs font-semibold text-rose-900">
                      <span className="inline-flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" />
                        24-hour messaging window expired. Free-form text is blocked — send an approved template.
                      </span>
                      <button
                        type="button"
                        onClick={() => setWaTemplatePickerOpen(true)}
                        className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-900 hover:bg-rose-100"
                      >
                        Send template
                      </button>
                    </div>
                  )}
                  {waCareWindow.status === 'no_inbound' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs font-semibold text-slate-700">
                      <span className="inline-flex items-center gap-2">
                        <Clock size={14} className="shrink-0" />
                        No customer message yet. Outside the care window, start with an approved template.
                      </span>
                      <button
                        type="button"
                        onClick={() => setWaTemplatePickerOpen(true)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                      >
                        Send template
                      </button>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto overscroll-contain p-8 space-y-6 bg-[var(--surface-dim)]/10 custom-scrollbar pattern-dots">
                    {renderedWaMessages.length < waMessages.length && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleWaMessageCount((prev) => prev + RENDER_WINDOW_INCREMENT)
                        }
                        className="mx-auto block rounded-[var(--radius-md)] border border-border bg-white px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5"
                      >
                        Show older messages
                      </button>
                    )}
                    {renderedWaMessages.map((msg) => (
                      <div key={msg._id} className={cn("flex flex-col", msg.direction === 'outbound' ? 'items-end' : 'items-start')}>
                        <div className={cn(
                          "max-w-[75%] rounded-[var(--radius-md)] px-6 py-4 text-sm font-medium shadow-sm transition-all relative leading-relaxed",
                          msg.direction === 'outbound'
                            ? 'bg-primary text-white rounded-br-none shadow-xl shadow-primary/10'
                            : 'bg-white text-text-main rounded-bl-none border border-border/50'
                        )}>
                          <p className="whitespace-pre-wrap">{msg.body}</p>
                          <span className={cn(
                            "block mt-2 text-[9px] font-semibold",
                            msg.direction === 'outbound' ? 'text-white/50' : 'text-text-muted/60'
                          )}>
                            {new Date(msg.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="shrink-0 border-t border-border p-6 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.02)]">
                    {!waFreeformAllowed && (
                      <p className="mb-3 text-center text-[11px] font-semibold text-text-muted">
                        Free-form reply disabled until a customer messages you (or while the 24h window is closed). Use a template to continue.
                      </p>
                    )}
                    <div className="flex gap-3 max-w-4xl mx-auto">
                      <button
                        type="button"
                        onClick={() => setWaTemplatePickerOpen(true)}
                        className={cn(
                          "flex h-14 shrink-0 items-center gap-2 rounded-[var(--radius-md)] border px-4 text-xs font-semibold",
                          !waFreeformAllowed
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-border bg-white text-text-main hover:bg-slate-50",
                        )}
                        title="Send template"
                      >
                        <FileText size={16} /> Template
                      </button>
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          placeholder={
                            waFreeformAllowed
                              ? "Type your reply here..."
                              : "Window closed — use a template"
                          }
                          value={waNewMessage}
                          disabled={!waFreeformAllowed || waSending}
                          onChange={(e) => setWaNewMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleWaSend()}
                          className="h-14 w-full rounded-[var(--radius-md)] bg-slate-100/50 border-none px-6 text-sm font-medium text-text-main outline-none focus:ring-4 focus:ring-emerald-500/5 transition-all shadow-inner disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                      <CrmButton
                        variant="primary"
                        disabled={waSending || !waFreeformAllowed || !waNewMessage.trim()}
                        onClick={handleWaSend}
                        className="h-14 w-14 rounded-[var(--radius-md)] p-0 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                      >
                        {waSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} strokeWidth={2.5} />}
                      </CrmButton>
                    </div>
                  </div>
                </>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Modals */}
      <SendEmailModal
        isOpen={emailModal !== null}
        crmInboxMode={source === "my-inbox"}
        replyToInboxEmailId={
          emailModal?.mode === "reply" ? emailModal.item._id : undefined
        }
        lockRecipient={emailModal?.mode === "reply"}
        replyThreadMailbox={
          emailModal?.mode === "reply" && emailModal.item.accountId
            ? {
              accountId: String(emailModal.item.accountId._id),
              email: emailModal.item.accountId.email || "",
            }
            : undefined
        }
        replyPreset={
          emailModal?.mode === "reply"
            ? buildReplyPresetFromInboxItem(
              emailModal.item,
              emailModal.item.accountId?.email ?? ""
            )
            : emailModal?.mode === "forward"
              ? buildForwardPresetFromInboxItem(emailModal.item)
              : undefined
        }
        initialData={
          emailModal?.mode === "edit_draft"
            ? {
              _id: (emailModal.item as any).meta?.isLocalDraft ? emailModal.item._id : undefined,
              subject: emailModal.item.subject,
              body: emailModal.item.bodyHtml || emailModal.item.body || "",
              recipient: (emailModal.item as any).meta?.recipient || emailModal.item.to || "",
              module: (emailModal.item as any).meta?.module,
              entityId: (emailModal.item as any).meta?.entityId,
            }
            : undefined
        }
        autoRunAiDraftOnOpen={
          emailModal?.mode === "reply" && emailModal.autoAiDraft === true
        }
        onClose={() => setEmailModal(null)}
        onSuccess={() => {
          setEmailModal(null);
          fetchInboxEmails();
        }}
        accounts={accounts}
        defaultAccountId={
          (emailModal?.mode === "reply" || emailModal?.mode === "forward") &&
          emailModal.item.accountId?._id
            ? String(emailModal.item.accountId._id)
            : selectedAccountId
        }
      />


      <ConnectEmailAccountModal
        isOpen={isConnectOpen}
        onClose={() => setIsConnectOpen(false)}
        onSuccess={(newAccountId) => {
          void fetchAccounts();
          if (newAccountId) {
            setSelectedAccountId(newAccountId);
            void handleSync(newAccountId, { syncAll: true });
          } else {
            void fetchInboxEmails();
          }
        }}
      />

      <EditEmailAccountModal
        isOpen={isEditOpen && !!editingAccount}
        onClose={() => { setIsEditOpen(false); setEditingAccount(null); }}
        account={editingAccount}
        isAdmin={isAdmin}
        onSyncNow={(accountId) => handleSync(accountId, { syncAll: true })}
        onSuccess={() => {
          void fetchAccounts();
          void fetchInboxEmails();
        }}
      />

      <WhatsAppTemplatePicker
        open={waTemplatePickerOpen && !!selectedWaId}
        to={selectedWaId || ''}
        onClose={() => setWaTemplatePickerOpen(false)}
        onSent={() => {
          if (selectedWaId) {
            void fetchWaMessages(selectedWaId);
            void fetchWaContacts();
          }
        }}
      />

      {waNewChatOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-md)] border border-border bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-text-main">Start WhatsApp chat</h3>
            <p className="mt-1 text-xs text-text-muted">
              Enter the full phone number with country code. Outside the 24-hour window, use a template to message first.
            </p>
            <input
              value={waNewChatPhone}
              onChange={(e) => setWaNewChatPhone(e.target.value)}
              placeholder="e.g. 919876543210"
              className="mt-4 h-11 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWaNewChatOpen(false);
                  setWaNewChatPhone('');
                }}
                className="rounded-[var(--radius-md)] px-4 py-2 text-xs font-semibold text-text-muted hover:bg-slate-50"
              >
                Cancel
              </button>
              <CrmButton
                variant="primary"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  const phone = waNewChatPhone.replace(/\D/g, '');
                  if (phone.length < 10) {
                    toast.error('Enter a valid phone number with country code');
                    return;
                  }
                  setSelectedWaId(phone);
                  setWaMessages([]);
                  setWaNewChatOpen(false);
                  setWaNewChatPhone('');
                  setWaTemplatePickerOpen(true);
                }}
              >
                Continue
              </CrmButton>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

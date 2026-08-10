'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, Loader2, MessageSquare, Send } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { CRM_API_URL, API_HOST_URL } from '@/lib/api/config';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';

type PortalChatBoxProps = {
  portalToken: string;
  dealId: string;
  authHeaders: Record<string, string>;
};

export function PortalChatBox({ portalToken, dealId, authHeaders }: PortalChatBoxProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${CRM_API_URL}/portal/${portalToken}/messages`, {
        headers: { ...authHeaders },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load portal messages:', e);
    } finally {
      setLoading(false);
    }
  }, [portalToken, authHeaders]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  // Establish socket connection for real-time messages
  useEffect(() => {
    if (!dealId) return;

    const socketInstance = io(process.env.NEXT_PUBLIC_PM_API_URL || API_HOST_URL);

    const timeoutId = setTimeout(() => {
      setSocket(socketInstance);
      socketInstance.emit('join-room', `deal-chat:${dealId}`);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      socketInstance.emit('leave-room', `deal-chat:${dealId}`);
      socketInstance.disconnect();
      setSocket(null);
    };
  }, [dealId]);

  // Listen to new messages from socket
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: any) => {
      setMessages((prev) => {
        if (prev.some((m) => String(m._id || m.id) === String(msg._id || msg.id))) {
          return prev;
        }
        return [...prev, msg];
      });
    };

    socket.on('deal-chat:message', handleNewMessage);
    return () => {
      socket.off('deal-chat:message', handleNewMessage);
    };
  }, [socket]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = inputText.trim();
    if (!txt) return;

    setSending(true);
    try {
      const res = await fetch(`${CRM_API_URL}/portal/${portalToken}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ text: txt }),
      });

      if (res.ok) {
        const saved = await res.json();
        setMessages((prev) => {
          if (prev.some((m) => String(m._id || m.id) === String(saved._id || saved.id))) {
            return prev;
          }
          return [...prev, saved];
        });
        setInputText('');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn(HS_PANEL, 'flex flex-col h-[450px] overflow-hidden')}>
      <style>{`
        .chat-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .chat-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 9999px;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.2);
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--hs-link)]/10 text-[var(--hs-link)]">
            <MessageSquare size={15} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">Project Chat</h3>
            <p className="text-[10px] text-[var(--text-muted)] font-medium">Real-time support</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchMessages();
          }}
          className="text-[10px] font-bold uppercase tracking-wider text-[var(--hs-link)] hover:underline"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Message Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#fafbfc] chat-scrollbar"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)] font-medium">
            <Loader2 size={16} className="animate-spin mr-2 text-[var(--hs-link)]" />
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-4 text-xs text-[var(--text-muted)] gap-1">
            <span className="font-semibold text-[var(--text-main)]">No messages yet</span>
            <span>Send a message to start a conversation with the team.</span>
          </div>
        ) : (
          messages.map((m) => {
            const isClientMsg = m.senderType === 'client';
            return (
              <div
                key={m._id || m.id}
                className={cn(
                  'flex gap-2.5 max-w-[85%] animate-in fade-in duration-300',
                  isClientMsg ? 'ml-auto flex-row-reverse' : 'mr-auto'
                )}
              >
                <div
                  className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 border shadow-sm',
                    isClientMsg
                      ? 'bg-[var(--hs-link)]/10 border-[var(--hs-link)]/15 text-[var(--hs-link)]'
                      : 'bg-emerald-500/10 border-emerald-500/15 text-emerald-600'
                  )}
                >
                  {isClientMsg ? 'C' : 'A'}
                </div>
                <div className="space-y-0.5">
                  <div
                    className={cn(
                      'rounded-xl p-2.5 text-xs shadow-sm border leading-relaxed',
                      isClientMsg
                        ? 'bg-[var(--hs-link)] text-white border-[var(--hs-link)]/20 rounded-tr-none'
                        : 'bg-white text-[var(--text-main)] border-[var(--border-color)] rounded-tl-none'
                    )}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-1 text-[9px] text-[var(--text-muted)] font-bold tracking-wide uppercase px-1',
                      isClientMsg ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <span>{isClientMsg ? 'You' : (m.senderName || 'Team')}</span>
                    <span>·</span>
                    <span>
                      {m.createdAt
                        ? new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Just now'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSend}
        className="p-3 bg-white border-t border-[var(--border-color)] flex gap-2 items-center"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type your message..."
          disabled={sending}
          className="flex-1 h-9 px-3 border border-[var(--border-color)] bg-white rounded-lg text-xs font-semibold text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)]/40 focus:border-[var(--hs-link)] focus:shadow-[0_0_0_3px_rgba(0,145,174,0.15)] min-w-0"
        />
        <button
          type="submit"
          disabled={sending || !inputText.trim()}
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-[var(--hs-link)] hover:bg-[var(--hs-link-hover)] text-white shadow-[0_2px_8px_rgba(0,145,174,0.25)] transition-all disabled:opacity-50"
        >
          {sending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </form>
    </div>
  );
}

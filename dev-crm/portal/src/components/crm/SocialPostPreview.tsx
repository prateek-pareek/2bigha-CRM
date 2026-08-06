"use client";

import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { CRM_API_URL } from '@/lib/api/config';

export interface SocialMetadata {
  url: string;
  type?: 'linkedin' | 'threads' | 'facebook' | 'generic';
  title?: string;
  description?: string;
  image?: string;
  authorName?: string;
  authorHandle?: string;
  authorPhoto?: string;
  error?: string;
}

/** Normalize API / form JSON into preview metadata (requires a non-empty url). */
export function coerceSocialMetadata(value: unknown): SocialMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.url !== 'string' || !v.url.trim()) return null;
  return v as unknown as SocialMetadata;
}

// Platform configs
const PLATFORMS = {
  linkedin: {
    label: 'LinkedIn',
    color: '#0077b5',
    bg: '#e8f4fb',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#0077b5]">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
    placeholder: 'LI',
    subtext: 'Shared via LinkedIn',
  },
  threads: {
    label: 'Threads',
    color: '#000000',
    bg: '#f0f0f0',
    icon: (
      <svg viewBox="0 0 192 192" className="w-4 h-4 fill-black">
        <path d="M141.537 88.988a66.667 66.667 0 00-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.195 47.292 9.642 32.788 28.08 19.882 44.485 13.224 67.315 13.001 95.932L13 96v.068c.224 28.617 6.882 51.447 19.788 67.848 14.504 18.438 36.094 27.885 64.197 28.08h.113c24.923-.169 42.444-6.708 56.9-21.153 18.9-18.882 18.131-42.502 11.961-57.008-4.422-10.307-12.977-18.695-24.422-23.847z" />
      </svg>
    ),
    placeholder: 'TH',
    subtext: 'Shared via Threads',
  },
  facebook: {
    label: 'Facebook',
    color: '#1877f2',
    bg: '#e7f0fd',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#1877f2]">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
    placeholder: 'FB',
    subtext: 'Shared via Facebook',
  },
  generic: {
    label: 'Link',
    color: 'var(--text-muted)',
    bg: 'var(--background)',
    icon: <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />,
    placeholder: '🔗',
    subtext: 'External link',
  },
};

const RESTRICTED_CDN_HOSTS = ['fbcdn.net', 'scontent', 'lookaside.fbsbx', 'cdninstagram.com'];

function needsProxy(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return RESTRICTED_CDN_HOSTS.some((h) => host.includes(h));
  } catch { return false; }
}

/** Fetches a restricted CDN image through the backend proxy with auth header, renders via blob URL */
function ProxiedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    let objectUrl: string;
    void fetch(`${CRM_API_URL}/crm/proxy-image?url=${encodeURIComponent(src)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);

  if (!blobUrl) return null;
  return <img src={blobUrl} alt={alt} className={className} />;
}

/** Extract the embed src URL from a raw <iframe ...> HTML string if pasted */
export function extractEmbedUrl(raw: string): string {
  if (!raw) return raw;
  const m = raw.match(/src=["']([^"']+)["']/);
  return m ? m[1] : raw;
}

export default function SocialPostPreview({ metadata }: { metadata: SocialMetadata }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!metadata?.url) return null;

  // Resolve the actual URL (handle case where full iframe HTML was stored)
  const resolvedUrl = extractEmbedUrl(metadata.url);
  const isLinkedInEmbed = resolvedUrl.includes('linkedin.com/embed/');

  const platform = PLATFORMS[metadata.type || 'generic'];
  const displayText = metadata.description || metadata.title || '';
  const shouldTruncate = displayText.length > 200;
  const shownText = shouldTruncate && !isExpanded
    ? displayText.slice(0, 200)
    : displayText;

  const initials = metadata.authorName
    ? metadata.authorName.replace('@', '').split(/[\s.]/).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : platform.placeholder;

  // LinkedIn embed iframe — render the actual widget, no scraping needed
  if (isLinkedInEmbed) {
    return (
      <div className="mt-3 border border-[#e6ecf2] rounded-[8px] overflow-hidden bg-white shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="px-3 py-2 flex items-center justify-between border-b border-[#f0f4f8] bg-[#e8f4fb60]">
          <div className="flex items-center gap-2">
            {PLATFORMS.linkedin.icon}
            <span className="text-xs font-bold text-[#0077b5]">LinkedIn Post</span>
          </div>
          <a href={resolvedUrl.replace('/embed/', '/')} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[var(--primary-muted)] hover:text-[#0077b5] transition-colors flex items-center gap-1">
            <ExternalLink size={10} />
            Open
          </a>
        </div>
        <div className="flex justify-center bg-[var(--background)] p-2">
          <iframe
            src={resolvedUrl}
            height="570"
            width="504"
            frameBorder={0}
            allowFullScreen
            title="LinkedIn post"
            className="max-w-full"
            style={{ maxWidth: '100%' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[#e6ecf2] rounded-[8px] overflow-hidden bg-white shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[#f0f4f8]" style={{ background: platform.bg + '60' }}>
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 border border-white/50"
            style={{ background: platform.color }}>
            {metadata.authorPhoto
              ? <img src={metadata.authorPhoto} alt="" className="w-full h-full object-cover rounded-full" />
              : initials}
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-main)] leading-tight">
              {metadata.authorName || platform.label}
            </p>
            {metadata.authorHandle && metadata.authorHandle !== metadata.authorName && (
              <p className="text-xs text-[var(--primary-muted)] leading-tight">{metadata.authorHandle}</p>
            )}
            {!metadata.authorHandle && (
              <p className="text-xs text-[var(--primary-muted)] leading-tight">{platform.subtext}</p>
            )}
          </div>
        </div>
        {/* Platform icon badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#e6ecf2] bg-white">
          {platform.icon}
          <span className="text-xs font-bold" style={{ color: platform.color }}>{platform.label}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {metadata.error ? (
          <div className="text-xs text-[var(--primary-muted)] italic">
            Could not load preview.{' '}
            <a href={metadata.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: platform.color }}>
              Open post ↗
            </a>
          </div>
        ) : (
          <>
            {displayText && (
              <p className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                {shownText}
                {shouldTruncate && !isExpanded && (
                  <>
                    {'... '}
                    <button type="button" onClick={() => setIsExpanded(true)}
                      className="font-bold hover:underline text-sm" style={{ color: platform.color }}>
                      see more
                    </button>
                  </>
                )}
              </p>
            )}
            {metadata.image && (
              <div className="rounded-lg overflow-hidden border border-[#e6ecf2] bg-[var(--background)] aspect-video group cursor-pointer"
                onClick={() => window.open(metadata.url, '_blank')}>
                {needsProxy(metadata.image) ? (
                  <ProxiedImage src={metadata.image} alt="Post media"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <img src={metadata.image} alt="Post media"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <a href={metadata.url} target="_blank" rel="noopener noreferrer"
        className="px-4 py-2.5 border-t border-[#f0f4f8] flex items-center justify-between hover:bg-[var(--background)] transition-colors group">
        <span className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: platform.color }}>
          View original post
        </span>
        <ExternalLink size={11} className="opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: platform.color }} />
      </a>
    </div>
  );
}

"use client";

import { useState } from 'react';
import { Linkedin, MoreHorizontal, ExternalLink } from 'lucide-react';

interface LinkedInMetadata {
  title?: string;
  description?: string;
  image?: string;
  authorName?: string;
  authorPhoto?: string;
  url: string;
}

export default function LinkedInPostPreview({ metadata }: { metadata: LinkedInMetadata }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!metadata || !metadata.url) return null;

  const displayDescription = metadata.description || metadata.title || '';
  const shouldTruncate = displayDescription.length > 180;
  const truncatedText = shouldTruncate && !isExpanded 
    ? displayDescription.slice(0, 180) + '...' 
    : displayDescription;

  return (
    <div className="mt-3 border border-[var(--border-color)] rounded-[var(--radius-md)] overflow-hidden bg-white shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between border-b border-slate-50/50 bg-surface-dim/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-[var(--border-color)]">
            {metadata.authorPhoto ? (
              <img src={metadata.authorPhoto} alt={metadata.authorName} className="w-full h-full object-cover" />
            ) : (
              <div className="text-primary font-black text-xs">
                {metadata.authorName ? metadata.authorName.split(' ').map(n => n[0]).join('').toUpperCase() : 'LI'}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-text-main leading-tight">
                {metadata.authorName || 'LinkedIn Member'}
              </span>
              <span className="text-xs font-bold text-text-muted">• 2nd</span>
            </div>
            <p className="text-xs font-medium text-text-muted leading-tight line-clamp-1">
              Shared via LinkedIn Post
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Linkedin size={18} className="text-[#0077b5]" />
          <button type="button" className="text-text-muted hover:text-text-main transition-colors">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="text-sm font-medium text-text-main leading-relaxed whitespace-pre-wrap">
          {truncatedText}
          {shouldTruncate && !isExpanded && (
            <button 
              type="button" 
              onClick={() => setIsExpanded(true)}
              className="ml-1 font-bold text-primary hover:underline"
            >
              ...see more
            </button>
          )}
        </div>

        {metadata.image && (
          <div className="relative rounded-[var(--radius-md)] overflow-hidden border border-[var(--border-color)] aspect-video bg-[var(--surface-dim)] group">
            <img src={metadata.image} alt="Post content" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors cursor-pointer" onClick={() => window.open(metadata.url, '_blank')} />
          </div>
        )}
      </div>

      {/* Footer / Link Action */}
      <a 
        href={metadata.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="px-4 py-3 bg-surface-dim/30 hover:bg-surface-dim/50 border-t border-slate-50 flex items-center justify-between transition-colors group"
      >
        <span className="text-xs font-black text-primary uppercase tracking-[0.15em]">View original post</span>
        <ExternalLink size={12} className="text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
      </a>
    </div>
  );
}

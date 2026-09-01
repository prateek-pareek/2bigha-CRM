"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Play,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CrmKanbanAvatar,
  CrmListMutedText,
  crmKanbanAvatarTone,
} from "@/components/crm/ui";
import {
  formatVisitRelative,
  formatVisitWhen,
  mapsUrl,
  personInitials,
  personName,
} from "@/lib/crm/visits/visit-ui";

export function VisitConfigBanner({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-amber-200/80 bg-amber-50 text-amber-950",
        compact ? "px-2.5 py-2 text-[11px] leading-snug" : "px-3.5 py-2.5 text-sm",
      )}
    >
      2bigha isn&apos;t configured on this backend — visit history stays empty until credentials are set.
    </div>
  );
}

export function SectionTabs<T extends string>({
  value,
  onChange,
  items,
  trailing,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] px-1">
      <nav className="flex min-w-0 flex-1 flex-wrap" aria-label="Section">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={cn(
                "relative shrink-0 px-3 py-2.5 text-[13px] font-semibold transition-colors sm:px-4",
                active
                  ? "text-[var(--primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
              )}
            >
              {item.label}
              {item.count != null ? (
                <span
                  className={cn(
                    "ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    active
                      ? "bg-[var(--primary-light)] text-[var(--primary)]"
                      : "bg-[var(--surface-dim)] text-[var(--text-muted)]",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
              {active ? (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--primary)] sm:inset-x-4" />
              ) : null}
            </button>
          );
        })}
      </nav>
      {trailing ? (
        <div className="flex min-w-0 max-w-full items-center px-2 py-1.5 sm:max-w-[15.5rem] sm:py-0 sm:pr-3">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

export function VisitMetaRow({
  label,
  value,
  icon,
  emoji,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  emoji?: string;
}) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] py-2.5 text-[13px] last:border-b-0">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[var(--text-muted)]">
        {emoji ? <span className="text-[14px] leading-none" aria-hidden>{emoji}</span> : icon}
        {label}
      </span>
      <span className="max-w-[72%] text-right font-medium leading-snug text-[var(--text-main)]">{value}</span>
    </div>
  );
}

const ROLE_EMOJI: Record<string, string> = {
  Owner: "🏠",
  "Field agent": "🧭",
  Agent: "🧭",
  Manager: "👔",
  "Requested by": "🙋",
  "Assigned agent": "🧭",
};

export function VisitPersonChip({
  person,
  label,
  compact,
}: {
  person?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
  label?: string;
  compact?: boolean;
}) {
  const name = personName(person);
  if (name === "—") {
    return compact ? null : <CrmListMutedText>—</CrmListMutedText>;
  }
  const initials = personInitials(person);
  return (
    <div className={cn("flex min-w-0 items-center gap-2", compact && "max-w-full")}>
      <CrmKanbanAvatar size="sm" tone={crmKanbanAvatarTone(initials)}>
        {initials}
      </CrmKanbanAvatar>
      <div className="min-w-0">
        {label ? (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <span className="mr-1" aria-hidden>
              {ROLE_EMOJI[label] || "👤"}
            </span>
            {label}
          </p>
        ) : null}
        <p className="truncate text-[13px] font-medium leading-tight text-[var(--text-main)]">{name}</p>
        {person?.phone || person?.email ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-muted)]">
            {person.phone ? (
              <a href={`tel:${person.phone}`} className="inline-flex items-center gap-0.5 hover:text-[var(--primary)]" onClick={(e) => e.stopPropagation()}>
                <Phone size={10} /> {person.phone}
              </a>
            ) : null}
            {person.email ? (
              <a href={`mailto:${person.email}`} className="inline-flex items-center gap-0.5 hover:text-[var(--primary)]" onClick={(e) => e.stopPropagation()}>
                <Mail size={10} /> {person.email}
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function VisitMapsLink({ lat, lng, label = "Open map" }: { lat?: string | null; lng?: string | null; label?: string }) {
  const href = mapsUrl(lat, lng);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)] hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <MapPin size={12} />
      {label}
      <ExternalLink size={11} />
    </a>
  );
}

export function VisitStatPills({
  items,
  activeKey,
  onSelect,
}: {
  items: { key: string; label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" | "info" }[];
  activeKey?: string;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
      {items.map((item) => {
        const active = (activeKey || "all") === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect?.(item.key)}
            className={cn(
              "min-w-[88px] shrink-0 rounded-[var(--radius-md)] border px-3 py-2 text-left transition-all",
              active
                ? "border-[var(--primary)] bg-[var(--primary-light)] shadow-sm"
                : "border-[var(--border-color)] bg-white hover:border-[var(--primary)]/40 hover:bg-[var(--surface-dim)]",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{item.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums leading-none text-[var(--text-main)]">{item.value}</p>
          </button>
        );
      })}
    </div>
  );
}

export function VisitWhen({ value, className }: { value?: string | null; className?: string }) {
  if (!value) return <CrmListMutedText>—</CrmListMutedText>;
  return (
    <span className={cn("block min-w-0", className)} title={formatVisitWhen(value)}>
      <span className="block text-[13px] font-medium text-[var(--text-main)]">{formatVisitRelative(value)}</span>
      <span className="block text-[11px] text-[var(--text-muted)]">{formatVisitWhen(value)}</span>
    </span>
  );
}

export function VisitKpiCard({
  emoji,
  label,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  emoji: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const ring =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50/70"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/70"
        : tone === "danger"
          ? "border-rose-200 bg-rose-50/70"
          : tone === "info"
            ? "border-sky-200 bg-sky-50/70"
            : "border-[var(--border-color)] bg-white";
  const inner = (
    <>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        <span className="text-[15px] leading-none" aria-hidden>
          {emoji}
        </span>
        {label}
      </p>
      <div className="mt-1.5 min-w-0 text-sm font-semibold leading-snug text-[var(--text-main)]">{value}</div>
      {hint ? <div className="mt-1 text-[11px] font-medium text-[var(--text-muted)]">{hint}</div> : null}
    </>
  );
  const className = cn(
    "block rounded-[var(--radius-md)] border px-3 py-2.5 shadow-[var(--crm-shadow-card)]",
    ring,
    href && "transition-all hover:-translate-y-0.5 hover:shadow-md",
  );
  return href ? (
    <Link href={href} className={cn(className, "no-underline")}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function VisitFindingBlock({
  emoji,
  title,
  children,
  tone = "neutral",
}: {
  emoji: string;
  title: string;
  children: ReactNode;
  tone?: "neutral" | "info" | "warning" | "danger" | "success";
}) {
  const bg =
    tone === "info"
      ? "border-sky-100 bg-sky-50/60"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50/70"
        : tone === "danger"
          ? "border-rose-100 bg-rose-50/70"
          : tone === "success"
            ? "border-emerald-100 bg-emerald-50/60"
            : "border-[var(--border-color)] bg-[var(--surface-dim)]/50";
  return (
    <div className={cn("rounded-[var(--radius-md)] border px-3 py-2.5", bg)}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        <span className="text-[15px] leading-none" aria-hidden>
          {emoji}
        </span>
        {title}
      </p>
      <div className="text-[13px] leading-relaxed text-[var(--text-main)]">{children}</div>
    </div>
  );
}

export function VisitStars({ value, max = 5 }: { value?: number | null; max?: number }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--text-muted)]" title="Not rated">
        {Array.from({ length: max }).map((_, i) => (
          <Star key={i} size={14} className="text-slate-200" />
        ))}
        <span className="ml-0.5 text-[12px] font-semibold">Not rated</span>
      </span>
    );
  }
  const n = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-1" title={`${value}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          size={14}
          className={i < n ? "fill-amber-400 text-amber-400" : "text-slate-300"}
        />
      ))}
      <span className="ml-0.5 text-[12px] font-semibold tabular-nums text-[var(--text-muted)]">{value}/{max}</span>
    </span>
  );
}

export function VisitTimeline({
  scheduledAt,
  checkInAt,
  checkOutAt,
  durationMinutes,
}: {
  scheduledAt?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  durationMinutes?: number | null;
}) {
  const steps = [
    { key: "scheduled", label: "Scheduled", emoji: "📅", icon: CalendarClock, at: scheduledAt },
    { key: "in", label: "Check-in", emoji: "📍", icon: MapPin, at: checkInAt },
    { key: "out", label: "Check-out", emoji: "🏁", icon: LogOut, at: checkOutAt },
  ];
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((step, i) => {
        const done = Boolean(step.at);
        const Icon = step.icon;
        return (
          <li
            key={step.key}
            className={cn(
              "relative rounded-[var(--radius-md)] border px-2.5 py-2.5 transition-colors",
              done
                ? "border-emerald-200 bg-emerald-50/80"
                : "border-dashed border-[var(--border-color)] bg-[var(--surface-dim)]",
            )}
          >
            {i < steps.length - 1 ? (
              <span
                className={cn(
                  "absolute right-[-0.4rem] top-6 hidden h-0.5 w-2 sm:block",
                  done ? "bg-emerald-300" : "bg-[var(--border-color)]",
                )}
                aria-hidden
              />
            ) : null}
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <span className="text-[14px] leading-none" aria-hidden>
                {step.emoji}
              </span>
              <Icon size={12} />
              {step.label}
            </p>
            <p className="mt-1.5 text-[12px] font-semibold text-[var(--text-main)]">
              {step.at ? formatVisitWhen(step.at) : "⏳ Pending"}
            </p>
            {done ? (
              <p className="mt-0.5 text-[11px] font-medium text-emerald-700">✓ Done</p>
            ) : null}
            {step.key === "out" && durationMinutes != null ? (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">⏱ {durationMinutes} min on site</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function VisitItemCard({
  href,
  title,
  subtitle,
  badge,
  footer,
}: {
  href: string;
  title: string;
  subtitle?: string;
  badge: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2.5 py-2 no-underline transition-all hover:border-[var(--primary)]/35 hover:bg-[var(--primary-light)]/40 hover:shadow-sm"
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[13px] font-semibold leading-snug text-[var(--text-main)] group-hover:text-[var(--primary)]">
          {title}
        </p>
        {subtitle ? <p className="mt-0.5 line-clamp-2 break-words text-[11px] leading-snug text-[var(--text-muted)]">{subtitle}</p> : null}
        {footer}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {badge}
        <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

export function VisitPhotoGrid({
  photos,
}: {
  photos: { key: string; url: string; alt: string; caption?: string; mediaType?: string }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  if (!photos.length) return null;
  const current = open != null ? photos[open] : null;

  const kindOf = (item?: { mediaType?: string; url: string }) => {
    const t = (item?.mediaType || "").toUpperCase();
    if (t.includes("AUDIO")) return "AUDIO";
    if (t.includes("VIDEO")) return "VIDEO";
    const path = (item?.url || "").toLowerCase();
    if (path.includes("/audio/")) return "AUDIO";
    if (path.includes("/videos/") || path.includes("/video/")) return "VIDEO";
    return "PHOTO";
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p, i) => {
          const kind = kindOf(p);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setOpen(i)}
              className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] text-left transition-shadow hover:shadow-md"
            >
              {kind === "VIDEO" ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={p.url}
                  className="h-28 w-full object-cover"
                  preload="metadata"
                  muted
                  playsInline
                />
              ) : kind === "AUDIO" ? (
                <div className="flex h-28 flex-col items-center justify-center gap-1 px-2">
                  <span className="text-2xl" aria-hidden>🎧</span>
                  <audio src={p.url} controls className="w-full" onClick={(e) => e.stopPropagation()} />
                </div>
              ) : failed[p.key] ? (
                <div className="flex h-28 flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-[var(--text-muted)]">
                  <span className="text-lg" aria-hidden>🖼️</span>
                  Photo unavailable
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt={p.alt}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-[1.06]"
                  onError={() => setFailed((prev) => ({ ...prev, [p.key]: true }))}
                />
              )}
              {kind === "VIDEO" ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow">
                    <Play size={14} fill="currentColor" />
                  </span>
                </span>
              ) : null}
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {kind === "VIDEO" ? "🎬 Video" : kind === "AUDIO" ? "🎧 Audio" : "📷 Photo"}
              </span>
              {p.caption ? (
                <span className="block truncate px-2 py-1 text-[10px] text-[var(--text-muted)]">{p.caption}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {current ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-800"
            onClick={() => setOpen(null)}
          >
            <X size={16} />
          </button>
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous"
                className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((i) => (i == null ? 0 : (i + photos.length - 1) % photos.length));
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                aria-label="Next"
                className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((i) => (i == null ? 0 : (i + 1) % photos.length));
                }}
              >
                <ChevronRight size={18} />
              </button>
            </>
          ) : null}
          {kindOf(current) === "VIDEO" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={current.url}
              controls
              autoPlay
              className="max-h-[85vh] max-w-[90vw] rounded-lg bg-black shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : kindOf(current) === "AUDIO" ? (
            <audio
              src={current.url}
              controls
              autoPlay
              className="w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.url}
              alt={current.alt}
              referrerPolicy="no-referrer"
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ) : null}
    </>
  );
}

export function VisitBool({ value }: { value?: boolean | null }) {
  if (value == null) return null;
  return value ? (
    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
      <Check size={13} /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
      <X size={13} /> No
    </span>
  );
}

export function VisitPanelShell({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-card)]">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-[3px] rounded-[1px] bg-[var(--crm-line-title)]" aria-hidden />
            <h3 className="text-sm font-semibold text-[var(--text-main)]">{title}</h3>
          </div>
          {hint ? <p className="mt-0.5 pl-[11px] text-[11px] text-[var(--text-muted)]">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

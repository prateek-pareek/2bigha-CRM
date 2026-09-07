"use client";

import { useState, useEffect, type MouseEvent } from "react";
import api from "@/lib/crm/api";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Droplets,
  Eye,
  Heart,
  Home,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  areaBighaToSqYd,
  daysOnPlatform,
  displayPropertyType,
  formatIndianLandAmount,
  formatListingArea,
  formatRatePerBigha,
  resolveAreaBigha,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CARD =
  "group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-[#e8ecf1] bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)]";

function formatDaysLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return "Listed today on 2Bigha";
  if (days === 1) return "Listed 1 day ago";
  if (days < 30) return `Listed ${days} days ago`;
  if (days < 365) return `Listed ${Math.floor(days / 30)}m ago`;
  return `Listed ${Math.floor(days / 365)}y ago`;
}

function formatSqYd(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function locationLine(listing: PropertyListingRecord): string {
  return (
    [listing.address, listing.village, listing.city, listing.district, listing.state]
      .filter(Boolean)
      .join(", ") || "—"
  );
}

async function shareListing(listing: PropertyListingRecord) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/crm/property-listings/${listing._id}`
      : "";
  const title = listing.title || "Property on 2Bigha";
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, url, text: title });
      return;
    }
    if (url && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
      return;
    }
    toast.error("Sharing is not available");
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    toast.error("Could not share listing");
  }
}

export function PropertyListingCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(CARD, "w-[min(100%,320px)] shrink-0 animate-pulse")}
        >
          <div className="aspect-[4/3] w-full bg-[#eef1f5]" />
          <div className="space-y-2.5 p-4">
            <div className="h-5 w-2/3 rounded bg-[#eef1f5]" />
            <div className="h-3.5 w-1/2 rounded bg-[#eef1f5]" />
            <div className="h-3.5 w-3/4 rounded bg-[#eef1f5]" />
            <div className="h-3.5 w-1/3 rounded bg-[#eef1f5]" />
            <div className="h-3 w-full rounded bg-[#eef1f5]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PropertyListingCard({
  listing,
  onClick,
  onEdit,
  onDelete,
  className,
}: {
  listing: PropertyListingRecord;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  const [lazyImages, setLazyImages] = useState<string[]>(listing.images || []);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    if (listing.images && listing.images.length > 0) {
      setLazyImages(listing.images);
      setImageIndex(0);
      return;
    }
    const isMockId = listing._id?.startsWith("tp_listing_") || listing._id?.startsWith("mock_");
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(listing._id || "");
    if (!isMockId && !isMongoId && listing._id) {
      let active = true;
      setLoadingMedia(true);
      api
        .get<{ images: string[] }>(
          `/crm/property-listings/twobigha/farms/media/${encodeURIComponent(listing._id)}`,
        )
        .then(({ data }) => {
          if (active && Array.isArray(data?.images) && data.images.length) {
            setLazyImages(data.images.filter((url) => /^https?:\/\//i.test(url)));
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoadingMedia(false);
        });
      return () => {
        active = false;
      };
    }
  }, [listing.images, listing.listingBucket, listing._id]);

  const images = lazyImages.length ? lazyImages : [];
  const activeImage = images[Math.min(imageIndex, Math.max(images.length - 1, 0))];
  const areaBigha = resolveAreaBigha(listing);
  const rate = formatRatePerBigha(listing.price, areaBigha);
  const displayRate =
    listing.pricePerUnit && Number(listing.pricePerUnit) > 0
      ? `${formatIndianLandAmount(Number(listing.pricePerUnit))}/ ${listing.areaUnit || "Bigha"}`
      : rate;
  const days = daysOnPlatform(listing);
  const views = listing.viewCount ?? 0;
  const likes = listing.likeCount ?? 0;

  const cycleImage = (dir: 1 | -1, e: MouseEvent) => {
    e.stopPropagation();
    if (images.length < 2) return;
    setImageIndex((i) => (i + dir + images.length) % images.length);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
        {activeImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeImage}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => {
              setLazyImages((prev) => {
                const next = prev.filter((_, i) => i !== imageIndex);
                setImageIndex(0);
                return next;
              });
            }}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-slate-300 dark:text-slate-700">
            {loadingMedia ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            ) : (
              <>
                <Home size={32} strokeWidth={1.5} />
                <span className="text-[11px] font-medium text-slate-400">No Image</span>
              </>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

        {/* Top Badges */}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap items-center gap-1.5">
          {(() => {
            const daysLabel = formatDaysLabel(days);
            if (!daysLabel) return null;
            return (
              <span className="rounded-full bg-slate-900/75 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white shadow-sm backdrop-blur-md">
                {daysLabel}
              </span>
            );
          })()}
          {listing.verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-md">
              <CheckCircle2 size={10} /> Verified
            </span>
          )}
          {listing.listingBucket === "farm" && (
            <span className="rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
              Farm
            </span>
          )}
        </div>

        {/* Actions Dropdown */}
        {(onEdit || onDelete) && (
          <div className="absolute right-2.5 top-2.5" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Listing actions"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md backdrop-blur-md transition-transform hover:scale-105 active:scale-95 dark:bg-slate-900/90 dark:text-slate-200"
                >
                  <MoreVertical size={13} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {onEdit ? (
                  <DropdownMenuItem onClick={onEdit} className="gap-2 cursor-pointer">
                    <Pencil size={13} className="text-blue-500" /> Edit
                  </DropdownMenuItem>
                ) : null}
                {onDelete ? (
                  <DropdownMenuItem onClick={onDelete} className="gap-2 text-rose-600 cursor-pointer">
                    <Trash2 size={13} /> Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* View Count */}
        {views > 0 && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-md">
            <Eye size={11} />
            {views.toLocaleString("en-IN")} views
          </span>
        )}

        {/* Carousel Controls */}
        {images.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={(e) => cycleImage(-1, e)}
              className="absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/60"
            >
              <ChevronRight size={14} className="rotate-180" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => cycleImage(1, e)}
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/60"
            >
              <ChevronRight size={14} />
            </button>
            <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
              {images.slice(0, 5).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Image ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageIndex(i);
                  }}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === imageIndex ? "w-4 bg-white" : "w-1.5 bg-white/60",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="min-w-0 text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
              {displayRate || formatIndianLandAmount(listing.price)}
            </p>
            {displayRate && (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Total: {formatIndianLandAmount(listing.price)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void shareListing(listing);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Share2 size={12} />
            Share
          </button>
        </div>

        <p className="min-w-0 truncate text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100" title={listing.title}>
          {listing.title || "Untitled Property"}
        </p>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          {(() => {
            const areaLabel = formatListingArea(listing);
            if (areaLabel === "—") return null;
            return (
              <div className="flex items-center gap-1 font-medium">
                <span className="text-slate-500">Area:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{areaLabel}</span>
                {listing.areaUnit === "Bigha" && areaBigha != null ? (
                  <span className="text-[11px] text-slate-400">
                    ({formatSqYd(areaBighaToSqYd(areaBigha))} sq.yd)
                  </span>
                ) : null}
              </div>
            );
          })()}

          {listing.khasraNumber && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Khasra #{listing.khasraNumber}
            </span>
          )}

          {listing.waterLevel != null && listing.waterLevel > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              <Droplets size={10} /> Water {listing.waterLevel}ft
            </span>
          )}

          {listing.highwayConn && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              Highway Access
            </span>
          )}

          {listing.roadAccess && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Road{listing.roadAccessWidth ? ` ${listing.roadAccessWidth}ft` : ""}
            </span>
          )}
        </div>

        <div className="mt-auto pt-1 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate max-w-[150px]" title={locationLine(listing)}>
              {locationLine(listing)}
            </span>
            {listing.contactName && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 truncate max-w-[110px]" title={listing.contactName}>
                <User size={10} /> {listing.contactName}
              </span>
            )}
          </div>
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {displayPropertyType(listing.propertyType)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PropertyListingsCarousel({
  listings,
  onOpen,
  onEdit,
  onDelete,
  title = "Trending Properties",
  subtitle = "Popular listings on 2Bigha",
}: {
  listings: PropertyListingRecord[];
  onOpen: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const scroll = (dir: 1 | -1) => {
    const el = document.getElementById("property-listings-carousel");
    if (!el) return;
    el.scrollBy({ left: dir * 340, behavior: "smooth" });
  };

  return (
    <section className="relative">
      <div className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight text-[#0f1b2d] sm:text-[28px]">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="relative">
        <div
          id="property-listings-carousel"
          className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {listings.map((p) => (
            <PropertyListingCard
              key={p._id}
              listing={p}
              className="w-[min(100%,300px)] shrink-0 sm:w-[310px]"
              onClick={() => onOpen(p._id)}
              onEdit={onEdit ? () => onEdit(p._id) : undefined}
              onDelete={onDelete ? () => onDelete(p._id) : undefined}
            />
          ))}
        </div>

        {listings.length > 2 ? (
          <button
            type="button"
            aria-label="Scroll to next listings"
            onClick={() => scroll(1)}
            className="absolute -right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#0f1b2d] shadow-[0_4px_16px_rgba(15,23,42,0.12)] transition hover:bg-slate-50 sm:right-0"
          >
            <ChevronRight size={20} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

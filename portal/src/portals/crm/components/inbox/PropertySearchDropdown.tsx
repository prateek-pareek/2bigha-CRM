"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check, Building2, MapPin, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PropertyOption = {
  _id?: string;
  id?: string;
  title?: string;
  propertyName?: string;
  propertyType?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  price?: number;
  areaSqft?: number;
  areaUnit?: string;
  brochurePdfUrl?: string;
  images?: string[];
  [key: string]: any;
};

type Props = {
  properties: PropertyOption[];
  selectedPropertyId?: string;
  onSelect: (propertyId: string, property: PropertyOption) => void;
  loading?: boolean;
  className?: string;
};

export default function PropertySearchDropdown({
  properties,
  selectedPropertyId,
  onSelect,
  loading = false,
  className,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  const selectedProperty = useMemo(() => {
    return properties.find((p) => (p._id || p.id) === selectedPropertyId);
  }, [properties, selectedPropertyId]);

  const filteredProperties = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => {
      const title = String(p.title || p.propertyName || "").toLowerCase();
      const type = String(p.propertyType || "").toLowerCase();
      const city = String(p.city || "").toLowerCase();
      const district = String(p.district || "").toLowerCase();
      const state = String(p.state || "").toLowerCase();
      const addr = String(p.address || "").toLowerCase();
      const priceStr = p.price ? String(p.price) : "";
      return (
        title.includes(q) ||
        type.includes(q) ||
        city.includes(q) ||
        district.includes(q) ||
        state.includes(q) ||
        addr.includes(q) ||
        priceStr.includes(q)
      );
    });
  }, [properties, search]);

  const formatLocation = (p: PropertyOption) => {
    const parts = [p.city, p.district, p.state].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : p.address || "Location on Request";
  };

  return (
    <div ref={dropdownRef} className={cn("relative w-full", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between gap-2.5 rounded-xl border bg-white px-3.5 py-2.5 text-left text-xs transition shadow-xs outline-none",
          isOpen
            ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm"
            : "border-emerald-300/80 hover:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20",
          !selectedProperty && "text-slate-400"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
            <Building2 size={14} />
          </div>
          {selectedProperty ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 truncate block text-xs">
                  {selectedProperty.title || selectedProperty.propertyName || "Selected Property"}
                </span>
                {selectedProperty.brochurePdfUrl && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300/60 shrink-0">
                    <Sparkles size={9} className="text-emerald-600" /> PDF Ready
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 truncate mt-0.5">
                <span className="truncate flex items-center gap-1">
                  <MapPin size={10} className="text-slate-400 shrink-0" />
                  {formatLocation(selectedProperty)}
                </span>
                {selectedProperty.price && (
                  <span className="font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/80 text-[10px] shrink-0">
                    ₹{Number(selectedProperty.price).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-slate-400 font-medium">
              {loading ? "Loading properties..." : "Search and select a property / project..."}
            </span>
          )}
        </div>
        <ChevronDown
          size={15}
          className={cn("text-slate-400 transition-transform shrink-0", isOpen && "rotate-180 text-emerald-600")}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 z-[100] mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150 overflow-hidden">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by property name, city, district, price..."
                className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8.5 pr-8 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-medium text-slate-800 placeholder:text-slate-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-1 pt-1.5 text-[10px] font-semibold text-slate-400">
              <span>Showing {filteredProperties.length} properties</span>
              <span>Scroll to view all</span>
            </div>
          </div>

          {/* Scrollable Properties List (shows ~5 items visible with smooth scroll) */}
          <div className="max-h-[255px] overflow-y-auto divide-y divide-slate-100/80 p-1">
            {filteredProperties.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">
                No matching properties found
              </div>
            ) : (
              filteredProperties.map((p) => {
                const id = p._id || p.id || "";
                const isSelected = (selectedPropertyId || "") === id;
                const loc = formatLocation(p);

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSelect(id, p);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg transition flex items-center justify-between gap-3 group",
                      isSelected
                        ? "bg-emerald-50 text-emerald-950 font-semibold border border-emerald-200"
                        : "hover:bg-slate-50/80 text-slate-700"
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 truncate block group-hover:text-emerald-700 transition">
                          {p.title || p.propertyName || "Untitled Property"}
                        </span>
                        {p.brochurePdfUrl && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300/60 shrink-0">
                            PDF Ready
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 truncate">
                        <span className="truncate flex items-center gap-1">
                          <MapPin size={10} className="text-slate-400 shrink-0" />
                          {loc}
                        </span>
                        {p.price && (
                          <span className="font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/80 text-[10px] shrink-0">
                            ₹{Number(p.price).toLocaleString("en-IN")}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

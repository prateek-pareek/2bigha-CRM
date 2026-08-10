"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface CrmDropdownOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface CrmDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: CrmDropdownOption[];
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  textSize?: "text-xs" | "text-sm" | "text-base";
}

export function CrmDropdown({
  value,
  onChange,
  options,
  className = "",
  buttonClassName = "",
  placeholder = "Select...",
  disabled = false,
  textSize = "text-sm",
}: CrmDropdownProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const updateCoords = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 160),
      });
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!open) {
      updateCoords();
    }
    setOpen((p) => !p);
  };

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updateCoords();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`inline-flex h-10 items-center justify-between gap-2.5 whitespace-nowrap rounded-lg border bg-card px-3 ${textSize} font-medium text-text-primary shadow-xs transition-colors disabled:opacity-50 disabled:pointer-events-none ${
          open
            ? "border-primary ring-2 ring-primary/15"
            : "border-border hover:border-text-muted/40"
        } ${buttonClassName}`}
      >
        <span className="truncate">{selected?.label || placeholder}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-text-muted transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "absolute",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
            }}
            className="z-[99999] max-h-64 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-xl animate-in fade-in duration-100"
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const [title, subtitle] = opt.sublabel
                ? [opt.label, opt.sublabel]
                : opt.label.includes(" · ")
                  ? opt.label.split(" · ")
                  : [opt.label, null];

              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-secondary text-text-primary"
                      : "hover:bg-secondary/60"
                  }`}
                >
                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                    <span
                      className={`truncate text-sm ${
                        isSelected ? "font-semibold text-text-primary" : "font-medium text-text-primary"
                      }`}
                    >
                      {title}
                    </span>
                    {subtitle ? (
                      <span
                        className={`truncate text-xs ${
                          isSelected
                            ? "text-text-muted font-medium"
                            : "text-text-muted/80 font-normal"
                        }`}
                      >
                        {subtitle}
                      </span>
                    ) : null}
                  </div>
                  {isSelected && (
                    <Check size={14} className="shrink-0 text-text-primary" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default CrmDropdown;

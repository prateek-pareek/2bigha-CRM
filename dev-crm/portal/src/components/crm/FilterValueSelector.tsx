"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface FilterValueSelectorProps {
  module: string;
  fieldKey: string;
  value: string; // The joined string, e.g. "Val1||Val2"
  onChange: (value: string) => void;
  operator: string;
  pipelineId?: string;
}

export function FilterValueSelector({
  module,
  fieldKey,
  value,
  onChange,
  operator,
  pipelineId,
}: FilterValueSelectorProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Split the "||" joined string into an array
  const selectedValues = value ? value.split("||").filter(Boolean) : [];

  const isMultiSelect = operator === "in" || operator === "not_in";

  useEffect(() => {
    // Only fetch if fieldKey is valid
    if (!fieldKey || !module) return;

    let cancelled = false;
    const fetchOptions = async () => {
      setLoading(true);
      try {
        const token = getCrmAuthToken();
        const url = new URL(`${CRM_API_URL}/crm/distinct-values`);
        url.searchParams.set('module', module);
        url.searchParams.set('field', fieldKey);
        if (pipelineId) {
          url.searchParams.set('pipeline', pipelineId);
        }

        const res = await fetch(
          url.toString(),
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!cancelled) setOptions(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOptions();
    return () => {
      cancelled = true;
    };
  }, [fieldKey, module]);

  const toggleOption = (opt: string) => {
    if (!isMultiSelect) {
      onChange(opt);
      setOpen(false);
      return;
    }

    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter((v) => v !== opt).join("||"));
    } else {
      onChange([...selectedValues, opt].join("||"));
    }
  };

  const removeOption = (opt: string) => {
    onChange(selectedValues.filter((v) => v !== opt).join("||"));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex-1 min-w-[200px] max-w-[400px] justify-between h-auto min-h-10 py-1.5 px-3 bg-surface-dim border-[#dfe1e6] rounded-[3px] text-sm font-medium hover:bg-surface-dim hover:text-text-main"
        >
          {selectedValues.length > 0 ? (
            <div className="flex flex-wrap gap-1 items-center">
              {selectedValues.map((val) => (
                <Badge
                  variant="secondary"
                  key={val}
                  className="rounded-md font-semibold text-xs px-2 py-0 bg-primary/10 text-primary hover:bg-primary/20"
                >
                  {val}
                  {isMultiSelect && (
                    <span
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeOption(val);
                      }}
                    >
                      <X className="h-3 w-3 text-primary hover:text-primary-dark" />
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-text-muted font-normal">Select values...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 rounded-[3px] shadow-lg border-[#ebecf0]" align="start">
        <Command>
          <CommandInput placeholder="Search value..." className="text-sm border-none" />
          <CommandList className="max-h-[220px] overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-4 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : options.length === 0 ? (
              <CommandEmpty>No values found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {options.map((opt) => {
                  const isSelected = selectedValues.includes(opt);
                  return (
                    <CommandItem
                      key={opt}
                      value={opt}
                      onSelect={() => toggleOption(opt)}
                      className="cursor-pointer font-medium text-sm text-text-main"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 text-primary",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {opt}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

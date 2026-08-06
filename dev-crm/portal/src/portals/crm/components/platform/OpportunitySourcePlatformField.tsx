"use client";

import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION,
  isCustomOpportunityPlatformSelection,
  mergeOpportunitySourcePlatforms,
  normalizeOpportunityPlatformName,
  resolveOpportunitySourcePlatform,
} from "@/lib/crm/crm-opportunity-portal-options";
import { useOpportunitySourcePlatforms } from '@/lib/crm/hooks/useOpportunitySourcePlatforms';
import { usePermissions } from "@/hooks/usePermissions";

type Props = {
  name?: string;
  customNameField?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  label?: string | null;
  /** Extra values (e.g. from an existing record) to show even if not in team settings. */
  legacyValue?: string;
  /** Show “Save to team list” when typing under Other / custom (requires settings:write). */
  enableSaveToTeamList?: boolean;
};

export default function OpportunitySourcePlatformField({
  name = "opportunitySourcePlatform",
  customNameField = "opportunitySourcePlatformCustom",
  defaultValue = "",
  required = false,
  className,
  labelClassName,
  inputClassName,
  label = "Platform",
  legacyValue,
  enableSaveToTeamList = false,
}: Props) {
  const { isAdmin, hasAccess } = usePermissions();
  const canSaveToTeam =
    enableSaveToTeamList &&
    (isAdmin || hasAccess("settings:write") || hasAccess("admin:manage"));

  const legacy = normalizeOpportunityPlatformName(legacyValue || defaultValue);
  const {
    options: fetchedOptions,
    loading,
    custom: teamCustom,
    saveCustomPlatform,
  } = useOpportunitySourcePlatforms(legacy ? [legacy] : []);

  const options = useMemo(() => {
    if (!loading && fetchedOptions.length > 0) return fetchedOptions;
    return mergeOpportunitySourcePlatforms([], legacy ? [legacy] : []);
  }, [fetchedOptions, legacy, loading]);

  const builtinAndCustom = options.filter(
    (p) => p !== CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION,
  );
  const knownValues = useMemo(
    () => new Set(builtinAndCustom.map((p) => p.toLowerCase())),
    [builtinAndCustom],
  );

  const initialSelect = useMemo(() => {
    if (!legacy) return "";
    if (knownValues.has(legacy.toLowerCase())) return legacy;
    return CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION;
  }, [legacy, knownValues]);

  const [selected, setSelected] = useState(initialSelect);
  const [customName, setCustomName] = useState(
    initialSelect === CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION ? legacy : "",
  );
  const [savingToTeam, setSavingToTeam] = useState(false);

  useEffect(() => {
    setSelected(initialSelect);
    setCustomName(
      initialSelect === CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION ? legacy : "",
    );
  }, [initialSelect, legacy]);

  const showCustomInput = isCustomOpportunityPlatformSelection(selected);
  const resolved = resolveOpportunitySourcePlatform(selected, customName);
  const normalizedCustom = normalizeOpportunityPlatformName(customName);
  const alreadyOnTeamList =
    normalizedCustom.length >= 2 &&
    teamCustom.some((c) => c.toLowerCase() === normalizedCustom.toLowerCase());
  const alreadyKnown =
    normalizedCustom.length >= 2 && knownValues.has(normalizedCustom.toLowerCase());
  const canOfferSaveToTeam =
    canSaveToTeam &&
    showCustomInput &&
    normalizedCustom.length >= 2 &&
    !alreadyOnTeamList &&
    !alreadyKnown;

  const handleSaveToTeamList = async () => {
    setSavingToTeam(true);
    try {
      const saved = await saveCustomPlatform(normalizedCustom);
      toast.success(`“${saved}” saved to the team platform list.`);
      setSelected(saved);
      setCustomName("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save to team list.");
    } finally {
      setSavingToTeam(false);
    }
  };

  return (
    <div className={className}>
      {label ? (
        <label className={labelClassName}>
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <select
        name={`${name}__select`}
        required={required && !showCustomInput}
        className={inputClassName}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Select…</option>
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {showCustomInput && (
        <div className="mt-2 space-y-2">
          <input
            name={customNameField}
            required={required}
            className={inputClassName}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Your platform name (e.g. customer portal, niche board)"
          />
          {canOfferSaveToTeam && (
            <button
              type="button"
              disabled={savingToTeam}
              onClick={() => void handleSaveToTeamList()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 disabled:opacity-60"
            >
              {savingToTeam ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookmarkPlus className="h-3.5 w-3.5" />
              )}
              Save “{normalizedCustom}” to team list
            </button>
          )}
          {canSaveToTeam && showCustomInput && alreadyOnTeamList && (
            <p className="text-[11px] text-[var(--primary-muted)]">
              Already on your team platform list.
            </p>
          )}
        </div>
      )}
      <input type="hidden" name={name} value={resolved} />
    </div>
  );
}

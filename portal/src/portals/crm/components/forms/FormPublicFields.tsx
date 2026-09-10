"use client";

import type { PublicForm } from "@/lib/crm/forms";

const BASE =
  "w-full h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400 transition-shadow placeholder:text-gray-400 bg-white";

export function FormPublicFieldInput({
  field,
  value,
  onChange,
  accent,
}: {
  field: PublicForm["fields"][number];
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  accent: string;
}) {
  const help = field.helpText ? (
    <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
  ) : null;

  const label = (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          required={field.required}
          placeholder={field.placeholder}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${BASE} h-24 py-2`}
        />
        {help}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {label}
        <select
          required={field.required}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className={BASE}
        >
          <option value="" disabled>
            {field.placeholder || "Select…"}
          </option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {help}
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div>
        {label}
        <div className="space-y-1.5">
          {(field.options || []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name={field.key}
                required={field.required}
                checked={value === opt}
                onChange={() => onChange(opt)}
                style={{ accentColor: accent }}
              />
              {opt}
            </label>
          ))}
        </div>
        {help}
      </div>
    );
  }

  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (opt: string) => {
      onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
    };
    return (
      <div>
        {label}
        <div className="space-y-1.5">
          {(field.options || []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                style={{ accentColor: accent }}
              />
              {opt}
            </label>
          ))}
        </div>
        {help}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div>
        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            required={field.required}
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            style={{ accentColor: accent }}
            className="mt-0.5"
          />
          <span>
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </span>
        </label>
        {help}
      </div>
    );
  }

  const inputType =
    field.type === "email"
      ? "email"
      : field.type === "phone"
        ? "tel"
        : field.type === "number"
          ? "number"
          : field.type === "date"
            ? "date"
            : "text";

  return (
    <div>
      {label}
      <input
        type={inputType}
        required={field.required}
        placeholder={field.placeholder}
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        className={BASE}
      />
      {help}
    </div>
  );
}

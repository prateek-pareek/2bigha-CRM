"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { getPublicForm, submitPublicForm, type PublicForm } from "@/lib/crm/forms";

/**
 * Public, unauthenticated hosted form — this is what gets embedded via
 * iframe or used directly as a Meta/Google Ads landing page. Allow-listed
 * past AuthGuard (see `pathname.startsWith('/forms/')` in
 * portal/src/components/AuthGuard.tsx) since visitors never have a CRM
 * session. Deliberately styled independently of the CRM design system —
 * this page's audience is the public, not CRM users.
 */
export default function PublicFormPage() {
  const params = useParams();
  const id = String(params?.id || "");

  const [form, setForm] = useState<PublicForm | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ successMessage: string; redirectUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string | string[]>>({});

  const utm = useMemo(() => {
    if (typeof window === "undefined") return {};
    const sp = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = sp.get(key);
      if (v) out[key.replace("utm_", "")] = v;
    }
    return out;
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setForm(await getPublicForm(id));
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (submitted?.redirectUrl) {
      window.location.href = submitted.redirectUrl;
    }
  }, [submitted]);

  const accent = form?.accentColor || "#ff5c35";

  const handleChange = (key: string, value: string | string[]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await submitPublicForm(form._id, values, utm);
      setSubmitted(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-gray-400" size={28} />
        </div>
      </Shell>
    );
  }

  if (notFound || !form) {
    return (
      <Shell>
        <p className="text-center text-gray-500 py-16">This form isn't available.</p>
      </Shell>
    );
  }

  if (submitted && !submitted.redirectUrl) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center py-16 gap-3">
          <CheckCircle2 size={40} style={{ color: accent }} />
          <p className="text-gray-700 max-w-sm">{submitted.successMessage}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">{form.name}</h1>
      {form.description && <p className="text-sm text-gray-500 mb-6">{form.description}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {form.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(v) => handleChange(field.key, v)}
            accent={accent}
          />
        ))}

        {/* Honeypot — hidden from real visitors, bots that fill every input trip it. */}
        <input
          type="text"
          name="_hp"
          tabIndex={-1}
          autoComplete="off"
          value={(values._hp as string) || ""}
          onChange={(e) => handleChange("_hp", e.target.value)}
          className="absolute -left-[9999px] w-px h-px opacity-0"
          aria-hidden="true"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-11 rounded-md text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: accent }}
        >
          {submitting ? "Submitting…" : form.submitButtonLabel}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}

function FieldInput({
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
  const baseClass =
    "w-full h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:ring-2 transition-shadow placeholder:text-gray-400";
  const focusStyle = { boxShadow: "none" } as React.CSSProperties;

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
          className={`${baseClass} h-24 py-2`}
          style={focusStyle}
        />
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
          className={baseClass}
        >
          <option value="" disabled>
            Select…
          </option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
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
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          required={field.required}
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "")}
          style={{ accentColor: accent }}
        />
        {field.label}
        {field.required && <span className="text-red-500">*</span>}
      </label>
    );
  }

  const inputType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

  return (
    <div>
      {label}
      <input
        type={inputType}
        required={field.required}
        placeholder={field.placeholder}
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        className={baseClass}
        style={focusStyle}
      />
    </div>
  );
}

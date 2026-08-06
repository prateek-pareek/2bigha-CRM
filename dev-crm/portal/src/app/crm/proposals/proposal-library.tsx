"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import RichTextEditor from '@/components/suite/editors/RichTextEditor';

export type ProposalBlockRow = {
  _id: string;
  name: string;
  category: string;
  bodyHtml?: string;
  isActive?: boolean;
};

export type CategoryOpt = { id: string; label: string };

type AuthFn = () => Record<string, string>;

function escSnippetTitle(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type AgencyBrandingForm = {
  companyName: string;
  tagline: string;
  logoUrl: string;
  addressLines: string;
  phone: string;
  email: string;
  website: string;
  headerHtml: string;
  footerHtml: string;
};

export type FreelancerBrandingForm = {
  displayName: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  addressLines: string;
  headerHtml: string;
  footerHtml: string;
};

const emptyAgency = (): AgencyBrandingForm => ({
  companyName: "",
  tagline: "",
  logoUrl: "",
  addressLines: "",
  phone: "",
  email: "",
  website: "",
  headerHtml: "",
  footerHtml: "",
});

const emptyFreelancer = (): FreelancerBrandingForm => ({
  displayName: "",
  title: "",
  email: "",
  phone: "",
  website: "",
  addressLines: "",
  headerHtml: "",
  footerHtml: "",
});

type BrandingDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  crmApiUrl: string;
  authHeaders: AuthFn;
};

export function ProposalBrandingDialog({
  open,
  onOpenChange,
  crmApiUrl,
  authHeaders,
}: BrandingDialogProps) {
  const [tab, setTab] = useState<"agency" | "freelancer">("agency");
  const [agency, setAgency] = useState(emptyAgency);
  const [freelancer, setFreelancer] = useState(emptyFreelancer);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${crmApiUrl}/crm/proposal-branding/me`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const a = data.agency ?? {};
      const f = data.freelancer ?? {};
      setAgency({
        companyName: a.companyName ?? "",
        tagline: a.tagline ?? "",
        logoUrl: a.logoUrl ?? "",
        addressLines: a.addressLines ?? "",
        phone: a.phone ?? "",
        email: a.email ?? "",
        website: a.website ?? "",
        headerHtml: a.headerHtml ?? "",
        footerHtml: a.footerHtml ?? "",
      });
      setFreelancer({
        displayName: f.displayName ?? "",
        title: f.title ?? "",
        email: f.email ?? "",
        phone: f.phone ?? "",
        website: f.website ?? "",
        addressLines: f.addressLines ?? "",
        headerHtml: f.headerHtml ?? "",
        footerHtml: f.footerHtml ?? "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load branding");
    } finally {
      setLoading(false);
    }
  }, [crmApiUrl, authHeaders]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${crmApiUrl}/crm/proposal-branding/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ agency, freelancer }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Save failed");
      }
      toast.success("Branding saved — used on PDF & Word exports.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(42rem,calc(100vw-2rem))] max-h-[90vh] flex flex-col rounded-md border-[var(--border-color)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-main)]">Proposal &amp; quotation branding</DialogTitle>
          <DialogDescription className="text-[var(--primary-muted)]">
            Agency mode uses logo and company details in the PDF header and footer. Freelancer mode uses your personal
            contact block. Configure both; each document picks one via &quot;Issuer profile&quot; when you edit it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b border-[var(--surface-dim)] pb-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "agency" ? "default" : "outline"}
            className="rounded-md"
            onClick={() => setTab("agency")}
          >
            Agency / company
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "freelancer" ? "default" : "outline"}
            className="rounded-md"
            onClick={() => setTab("freelancer")}
          >
            Freelancer / individual
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 space-y-3 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--primary-muted)] gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : tab === "agency" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company name</Label>
                  <Input
                    value={agency.companyName}
                    onChange={(e) => setAgency((a) => ({ ...a, companyName: e.target.value }))}
                    className="rounded-md border-[var(--border-color)]"
                    placeholder="Acme Digital Pvt Ltd"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tagline</Label>
                  <Input
                    value={agency.tagline}
                    onChange={(e) => setAgency((a) => ({ ...a, tagline: e.target.value }))}
                    className="rounded-md border-[var(--border-color)]"
                    placeholder="Design & build"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Logo URL (https or hosted image)</Label>
                <Input
                  value={agency.logoUrl}
                  onChange={(e) => setAgency((a) => ({ ...a, logoUrl: e.target.value }))}
                  className="rounded-md border-[var(--border-color)]"
                  placeholder="https://…"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={agency.phone}
                    onChange={(e) => setAgency((a) => ({ ...a, phone: e.target.value }))}
                    className="rounded-md border-[var(--border-color)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={agency.email}
                    onChange={(e) => setAgency((a) => ({ ...a, email: e.target.value }))}
                    className="rounded-md border-[var(--border-color)]"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={agency.website}
                  onChange={(e) => setAgency((a) => ({ ...a, website: e.target.value }))}
                  className="rounded-md border-[var(--border-color)]"
                />
              </div>
              <div className="space-y-2">
                <Label>Address (multi-line)</Label>
                <Textarea
                  value={agency.addressLines}
                  onChange={(e) => setAgency((a) => ({ ...a, addressLines: e.target.value }))}
                  className="rounded-md border-[var(--border-color)] min-h-[72px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Extra header HTML (optional)</Label>
                <div className="rounded-md border border-[var(--border-color)] min-h-[120px]">
                  <RichTextEditor
                    content={agency.headerHtml || ""}
                    onChange={(html) => setAgency((a) => ({ ...a, headerHtml: html }))}
                    placeholder="Optional line under company name…"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Footer HTML (optional)</Label>
                <div className="rounded-md border border-[var(--border-color)] min-h-[120px]">
                  <RichTextEditor
                    content={agency.footerHtml || ""}
                    onChange={(html) => setAgency((a) => ({ ...a, footerHtml: html }))}
                    placeholder="Registrations, GSTIN, legal note…"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Display name</Label>
                  <Input
                    value={freelancer.displayName}
                    onChange={(e) => setFreelancer((f) => ({ ...f, displayName: e.target.value }))}
                    className="rounded-md border-[var(--border-color)]"
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title / role</Label>
                  <Input
                    value={freelancer.title}
                    onChange={(e) => setFreelancer((f) => ({ ...f, title: e.target.value }))}
                    className="rounded-md border-[var(--border-color)]"
                    placeholder="Full-stack consultant"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={freelancer.email}
                    onChange={(e) => setFreelancer((f) => ({ ...f, email: e.target.value }))}
                    className="rounded-md border-[var(--border-color)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={freelancer.phone}
                    onChange={(e) => setFreelancer((f) => ({ ...f, phone: e.target.value }))}
                    className="rounded-md border-[var(--border-color)]"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={freelancer.website}
                  onChange={(e) => setFreelancer((f) => ({ ...f, website: e.target.value }))}
                  className="rounded-md border-[var(--border-color)]"
                />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  value={freelancer.addressLines}
                  onChange={(e) => setFreelancer((f) => ({ ...f, addressLines: e.target.value }))}
                  className="rounded-md border-[var(--border-color)] min-h-[64px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Extra header HTML (optional)</Label>
                <div className="rounded-md border border-[var(--border-color)] min-h-[100px]">
                  <RichTextEditor
                    content={freelancer.headerHtml || ""}
                    onChange={(html) => setFreelancer((f) => ({ ...f, headerHtml: html }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Footer HTML (optional)</Label>
                <div className="rounded-md border border-[var(--border-color)] min-h-[100px]">
                  <RichTextEditor
                    content={freelancer.footerHtml || ""}
                    onChange={(html) => setFreelancer((f) => ({ ...f, footerHtml: html }))}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-[var(--surface-dim)] pt-3">
          <Button type="button" variant="outline" className="rounded-md" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-md bg-[var(--hs-link)] hover:bg-[#e86a4d]"
            disabled={saving || loading}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save branding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BlocksDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  crmApiUrl: string;
  authHeaders: AuthFn;
  onChanged?: () => void;
};

export function ProposalBlocksManagerDialog({
  open,
  onOpenChange,
  crmApiUrl,
  authHeaders,
  onChanged,
}: BlocksDialogProps) {
  const [rows, setRows] = useState<ProposalBlockRow[]>([]);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("other");
  const [formHtml, setFormHtml] = useState("<p></p>");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, bRes] = await Promise.all([
        fetch(`${crmApiUrl}/crm/proposal-blocks/categories`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
        fetch(`${crmApiUrl}/crm/proposal-blocks`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
      ]);
      if (cRes.ok) {
        const c = await cRes.json();
        setCategories(Array.isArray(c) ? c : []);
      }
      if (!bRes.ok) throw new Error(`Blocks ${bRes.status}`);
      const b = await bRes.json();
      setRows(Array.isArray(b) ? b : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load blocks");
    } finally {
      setLoading(false);
    }
  }, [crmApiUrl, authHeaders]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const catLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;

  const openNew = () => {
    setEditingId(null);
    setFormName("");
    setFormCategory("other");
    setFormHtml("<p></p>");
    setEditorOpen(true);
  };

  const openEdit = (r: ProposalBlockRow) => {
    setEditingId(r._id);
    setFormName(r.name);
    setFormCategory(r.category || "other");
    setFormHtml(r.bodyHtml || "<p></p>");
    setEditorOpen(true);
  };

  const saveBlock = async () => {
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `${crmApiUrl}/crm/proposal-blocks/${editingId}`
        : `${crmApiUrl}/crm/proposal-blocks`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: formName.trim(),
          category: formCategory,
          bodyHtml: formHtml || "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Save failed");
      }
      toast.success(editingId ? "Block updated" : "Block created");
      setEditorOpen(false);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`${crmApiUrl}/crm/proposal-blocks/${deleteId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setDeleteId(null);
    if (!res.ok) {
      toast.error("Could not delete");
      return;
    }
    toast.success("Block removed");
    await load();
    onChanged?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(48rem,calc(100vw-2rem))] max-h-[90vh] flex flex-col rounded-md border-[var(--border-color)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-main)]">Reusable proposal &amp; CV content</DialogTitle>
            <DialogDescription className="text-[var(--primary-muted)]">
              Build a library of portfolio blurbs, payment terms, CV sections, legal snippets, and more. Insert them from
              any proposal, quotation, or CV while editing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-between items-center gap-2">
            <Button type="button" size="sm" className="rounded-md bg-[var(--hs-link)] hover:bg-[#007e8f]" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              New block
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-md" onClick={() => void load()}>
              Refresh
            </Button>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 border border-[var(--surface-dim)] rounded-md">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[var(--primary-muted)] gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--primary-muted)]">No blocks yet. Create your first reusable snippet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--surface-dim)] text-left text-xs font-semibold uppercase text-[var(--primary-muted)]">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 w-40">Category</th>
                    <th className="px-3 py-2 w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id} className="border-b border-[var(--surface-dim)] hover:bg-[var(--background)]/80">
                      <td className="px-3 py-2 font-medium text-[var(--text-main)]">{r.name}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)] text-xs">{catLabel(r.category)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-[var(--hs-link)]"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-rose-600"
                          onClick={() => setDeleteId(r._id)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[min(44rem,calc(100vw-2rem))] max-h-[90vh] flex flex-col rounded-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit block" : "New block"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="rounded-md border-[var(--border-color)]"
                  placeholder="e.g. Standard payment terms"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="rounded-md border-[var(--border-color)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>HTML body</Label>
              <div className="rounded-md border border-[var(--border-color)] min-h-[220px]">
                <RichTextEditor content={formHtml} onChange={setFormHtml} placeholder="Compose reusable HTML…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-md" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-md bg-[var(--hs-link)] hover:bg-[#e86a4d]"
              disabled={saving}
              onClick={() => void saveBlock()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this block?</AlertDialogTitle>
            <AlertDialogDescription>Proposals that already inserted it keep the pasted HTML.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-md bg-rose-600" onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function appendBlockToBody(currentHtml: string, block: ProposalBlockRow): string {
  const title = escSnippetTitle(block.name);
  const chunk = block.bodyHtml || "";
  return `${currentHtml || ""}\n<hr/><p><strong>${title}</strong></p>\n${chunk}`;
}

"use client";

import { useState } from "react";
import { FileText, UploadCloud, Download, Loader2, Trash2 } from "lucide-react";
import { HS_PANEL } from "./panel-styles";
import { cn } from "@/lib/utils";
import { CRM_API_URL } from "@/lib/api/config";
import { toast } from "sonner";
import type { PortalPayload } from "./types";

export function PortalDocsSection({
  deal,
  portalToken,
  onUploadSuccess,
  authHeaders = {},
}: {
  deal: PortalPayload['deal'];
  portalToken: string;
  onUploadSuccess: () => void;
  /** Same auth as GET /api/portal/:token — required when the portal has a password or Google login. */
  authHeaders?: Record<string, string>;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [docName, setDocName] = useState("");
  const [docUrl, setDocUrl] = useState("");

  const docs = deal?.portalDocuments || [];

  const handleDelete = async (index: number) => {
    if (!confirm("Are you sure you want to remove this document?")) return;

    try {
      const res = await fetch(`${CRM_API_URL}/portal/${portalToken}/documents/${index}`, {
        method: 'DELETE',
        headers: { ...authHeaders },
      });

      if (!res.ok) throw new Error("Delete failed");
      
      toast.success("Document removed");
      onUploadSuccess();
    } catch (err) {
      toast.error("Failed to remove document");
    }
  };
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim() || !docUrl.trim()) return;

    setIsUploading(true);
    try {
      const res = await fetch(`${CRM_API_URL}/portal/${portalToken}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name: docName, url: docUrl }),
      });

      if (!res.ok) throw new Error("Upload failed");
      
      toast.success("Document added successfully");
      setDocName("");
      setDocUrl("");
      onUploadSuccess();
    } catch (err) {
      toast.error("Failed to add document");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section id="portal-docs" className={cn(HS_PANEL, "scroll-mt-28 p-5 md:p-6 md:scroll-mt-24")}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-dim)] pb-3">
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          <FileText className="h-5 w-5 text-[var(--hs-link)]" />
          Documents
        </h2>
      </div>

      <div className="mt-5 space-y-4">
        {docs.length === 0 ? (
          <div className="text-center py-6 bg-[#fafbfc] rounded-xl border border-dashed border-[var(--border-color)]">
            <FileText className="h-8 w-8 text-[var(--border-color)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No documents available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {docs.map((doc, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-[var(--surface-dim)] bg-white shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={cn("p-2 rounded-lg", doc.type === 'admin_provided' ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600")}>
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold text-[var(--text-main)] truncate">{doc.name}</p>
                    <p className="text-xs text-[var(--primary-muted)] uppercase tracking-wider">
                      {doc.type === 'admin_provided'
                        ? 'From Mathionix'
                        : doc.satisfiedNeedId
                          ? 'Fulfills Request'
                          : 'Client Upload'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-2 text-[var(--text-muted)] hover:text-[var(--hs-link)] hover:bg-[var(--surface-dim)] rounded-lg transition-colors" title="Download">
                    <Download className="h-4 w-4" />
                  </a>
                  {doc.type === 'client_uploaded' && (
                    <button 
                      onClick={() => handleDelete(idx)}
                      className="p-2 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100" 
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 pt-5 border-t border-[var(--surface-dim)]">
        <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3 flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-[var(--hs-link)]" />
          Submit a Document
        </h3>
        <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Document Name"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            className="flex-1 h-10 rounded-md border border-[var(--border-color)] px-3 text-sm focus:ring-2 focus:ring-[var(--hs-link)] focus:border-[var(--hs-link)] outline-none transition-all"
            required
          />
          <input
            type="url"
            placeholder="Document URL (Link)"
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
            className="flex-1 h-10 rounded-md border border-[var(--border-color)] px-3 text-sm focus:ring-2 focus:ring-[var(--hs-link)] focus:border-[var(--hs-link)] outline-none transition-all"
            required
          />
          <button
            type="submit"
            disabled={isUploading}
            className="h-10 px-5 rounded-md bg-[var(--hs-link)] text-white text-sm font-semibold hover:bg-[#007a94] disabled:opacity-50 transition-colors flex items-center justify-center min-w-[100px]"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
          </button>
        </form>
      </div>
    </section>
  );
}

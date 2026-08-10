"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Plus, Search, Edit2, Trash2, ScrollText, FolderOpen, ChevronLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP = "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all";
const SEL = "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all appearance-none";
const TXA = "w-full bg-white border border-[var(--border-color)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all resize-none";

interface Article {
  _id: string;
  title: string;
  status: string;
  category: { name: string };
  author: { firstName: string; lastName: string };
  viewCount: number;
  updatedAt: string;
}

interface Category {
  _id: string;
  name: string;
  description: string;
  icon: string;
}

export default function KnowledgeBaseManagementPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"articles" | "categories">("articles");
  const [isArtModalOpen, setIsArtModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newArticle, setNewArticle] = useState({ title: "", content: "", category: "", status: "Published" });
  const [newCategory, setNewCategory] = useState({ name: "", description: "", icon: "Book" });

  const fetchData = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const [artRes, catRes] = await Promise.all([
        fetch(`${CRM_API_URL}/knowledge-base/articles`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${CRM_API_URL}/knowledge-base/categories`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (artRes.ok) setArticles(await artRes.json());
      if (catRes.ok) setCategories(await catRes.json());
    } catch (err) {
      console.error("Failed to fetch KB data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredArticles = articles.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.category?.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveArticle = async () => {
    if (!newArticle.title || !newArticle.category) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/knowledge-base/articles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newArticle),
      });
      if (res.ok) {
        toast.success("Article created successfully!");
        setIsArtModalOpen(false);
        setNewArticle({ title: "", content: "", category: "", status: "Published" });
        fetchData();
      } else {
        toast.error("Failed to create article");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!newCategory.name) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/knowledge-base/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newCategory),
      });
      if (res.ok) {
        toast.success("Category created successfully!");
        setIsCatModalOpen(false);
        setNewCategory({ name: "", description: "", icon: "Book" });
        fetchData();
      } else {
        toast.error("Failed to create category");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm("Delete this article?")) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/knowledge-base/articles/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { toast.success("Article deleted"); fetchData(); }
    else toast.error("Failed to delete article");
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/knowledge-base/categories/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { toast.success("Category deleted"); fetchData(); }
    else toast.error("Failed to delete category");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/crm/settings"
            className="p-1.5 hover:bg-[var(--background)] rounded-md transition-colors border border-transparent hover:border-[var(--surface-dim)]"
          >
            <ChevronLeft size={18} className="text-[var(--primary-muted)]" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#fff3f0] border border-[#ffd6cc] flex items-center justify-center">
              <BookOpen size={16} className="text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[var(--text-main)] leading-tight">Knowledge Base</h1>
              <p className="text-xs text-[var(--primary-muted)]">Create and manage documentation for your team and customers.</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => activeTab === "articles" ? setIsArtModalOpen(true) : setIsCatModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--hs-link)] text-white text-sm font-semibold hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm"
        >
          <Plus size={15} />
          {activeTab === "articles" ? "New Article" : "New Category"}
        </button>
      </div>

      {/* Main card */}
      <div className="bg-white border border-[var(--surface-dim)] rounded-md overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-[var(--surface-dim)] bg-[var(--background)]">
          {(["articles", "categories"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-[var(--hs-link)] text-[var(--hs-link)] bg-white"
                  : "border-transparent text-[var(--primary-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {tab === "articles" ? <ScrollText size={14} /> : <FolderOpen size={14} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-[var(--surface-dim)] bg-[var(--background)]">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--primary-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] placeholder:text-[var(--primary-muted)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="divide-y divide-[var(--surface-dim)]">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="px-5 py-4 animate-pulse flex items-center gap-4">
                <div className="w-8 h-8 bg-[var(--background)] rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[var(--background)] rounded w-1/3" />
                  <div className="h-3 bg-[var(--background)] rounded w-1/5" />
                </div>
              </div>
            ))
          ) : activeTab === "articles" ? (
            filteredArticles.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-12 h-12 bg-[var(--background)] border border-[var(--surface-dim)] rounded-md flex items-center justify-center mx-auto mb-3">
                  <ScrollText size={20} className="text-[var(--primary-muted)]" />
                </div>
                <p className="text-sm font-semibold text-[var(--text-main)]">No articles found</p>
                <p className="text-sm text-[var(--primary-muted)] mt-1">Create your first article to get started.</p>
              </div>
            ) : (
              filteredArticles.map((article) => (
                <div key={article._id} className="px-5 py-4 hover:bg-[var(--background)] transition-colors group flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#fff3f0] border border-[#ffd6cc] rounded-md flex items-center justify-center shrink-0">
                      <ScrollText size={15} className="text-[var(--hs-link)]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-main)]">{article.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[var(--primary-muted)]">{article.category?.name}</span>
                        <span className="text-[var(--border-color)]">·</span>
                        <span className="text-xs text-[var(--primary-muted)]">By {article.author?.firstName}</span>
                        <span className="text-[var(--border-color)]">·</span>
                        <span className="text-xs text-[var(--primary-muted)]">{article.viewCount} views</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 text-[var(--primary-muted)] hover:text-[var(--hs-link)] hover:bg-[var(--background)] rounded-md transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDeleteArticle(article._id)} className="p-1.5 text-[var(--primary-muted)] hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )
          ) : (
            categories.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-12 h-12 bg-[var(--background)] border border-[var(--surface-dim)] rounded-md flex items-center justify-center mx-auto mb-3">
                  <FolderOpen size={20} className="text-[var(--primary-muted)]" />
                </div>
                <p className="text-sm font-semibold text-[var(--text-main)]">No categories yet</p>
                <p className="text-sm text-[var(--primary-muted)] mt-1">Add a category to organise your articles.</p>
              </div>
            ) : (
              categories.map((category) => (
                <div key={category._id} className="px-5 py-4 hover:bg-[var(--background)] transition-colors group flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[var(--background)] border border-[var(--surface-dim)] rounded-md flex items-center justify-center shrink-0">
                      <FolderOpen size={15} className="text-[var(--primary-muted)]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-main)]">{category.name}</p>
                      {category.description && (
                        <p className="text-xs text-[var(--primary-muted)] mt-0.5">{category.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 text-[var(--primary-muted)] hover:text-[var(--hs-link)] hover:bg-[var(--background)] rounded-md transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDeleteCategory(category._id)} className="p-1.5 text-[var(--primary-muted)] hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* Article slide panel */}
      {isArtModalOpen && typeof document !== "undefined" && createPortal(
        <CrmSlidePanelShell
          isOpen={isArtModalOpen}
          onClose={() => setIsArtModalOpen(false)}
          title="New Article"
          subtitle="Fill in the details to create a new knowledge base article."
          headerTone="hubspot"
          footer={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsArtModalOpen(false)}
                className="flex-1 inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveArticle}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Creating…" : "Create Article"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={LBL}>Title <span className="text-[#f2545b]">*</span></label>
              <input
                className={INP}
                placeholder="Article title"
                value={newArticle.title}
                onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
              />
            </div>
            <div>
              <label className={LBL}>Category <span className="text-[#f2545b]">*</span></label>
              <select
                className={SEL}
                value={newArticle.category}
                onChange={(e) => setNewArticle({ ...newArticle, category: e.target.value })}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LBL}>Status</label>
              <select
                className={SEL}
                value={newArticle.status}
                onChange={(e) => setNewArticle({ ...newArticle, status: e.target.value })}
              >
                <option value="Published">Published</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
            <div>
              <label className={LBL}>Content (Markdown)</label>
              <textarea
                className={`${TXA} min-h-[160px]`}
                placeholder="Write article content…"
                value={newArticle.content}
                onChange={(e) => setNewArticle({ ...newArticle, content: e.target.value })}
              />
            </div>
          </div>
        </CrmSlidePanelShell>,
        document.body
      )}

      {/* Category slide panel */}
      {isCatModalOpen && typeof document !== "undefined" && createPortal(
        <CrmSlidePanelShell
          isOpen={isCatModalOpen}
          onClose={() => setIsCatModalOpen(false)}
          title="New Category"
          subtitle="Add a category to organise your knowledge base articles."
          headerTone="hubspot"
          footer={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsCatModalOpen(false)}
                className="flex-1 inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCategory}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Creating…" : "Create Category"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={LBL}>Category name <span className="text-[#f2545b]">*</span></label>
              <input
                className={INP}
                placeholder="e.g. Getting Started"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
              />
            </div>
            <div>
              <label className={LBL}>Description</label>
              <textarea
                className={`${TXA} min-h-[100px]`}
                placeholder="Brief description of this category…"
                value={newCategory.description}
                onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
              />
            </div>
          </div>
        </CrmSlidePanelShell>,
        document.body
      )}
    </div>
  );
}

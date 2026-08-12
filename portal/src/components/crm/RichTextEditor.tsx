"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import {
  extractManagedImageUrlsFromHtml,
  normalizeStoredImageUrl,
  removeUploadedImage,
  resolveUploadedImageUrl,
  uploadImageFile,
} from "@/lib/media/upload-image";
import { uploadDocumentFile } from "@/lib/media/upload-media";
import type { MediaUploadContext } from "@/lib/media/types";
import type { ImageUploadPreset } from "@/lib/media/optimize-image-client";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  Eraser,
  Undo2,
  Redo2,
  ExternalLink,
  ImagePlus,
  UploadCloud,
  Loader2,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Download,
  Table as TableIcon,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  TableCellsMerge,
  TableCellsSplit,
  SquareSlash,
  SquarePlus,
  ChevronDown,
  Type,
  Baseline,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Pilcrow,
} from "lucide-react";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import FontSize from "tiptap-extension-font-size";
import { Markdown } from "tiptap-markdown";
import {
  Plus as PlusIcon,
  Minus as MinusIcon,
} from "lucide-react";
import api from "@/lib/hrms/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import type { Editor } from "@tiptap/core";

function guessAltFromImageSource(src: string): string {
  const raw = String(src || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "https://placeholder.local");
    const last = parsed.pathname.split("/").filter(Boolean).pop() || "";
    const withoutExt = last.replace(/\.[a-z0-9]+$/i, "");
    return decodeURIComponent(withoutExt)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  /** When true, content is view-only (toolbar hidden). */
  readOnly?: boolean;
  /** Exposes the TipTap editor (e.g. PM @-mentions, programmatic edits). */
  editorRef?: React.MutableRefObject<Editor | null>;
  /** Fired on Ctrl+Enter / Cmd+Enter (e.g. post comment). */
  onModEnter?: () => void;
  onEscape?: () => void;
  /** Server disk folder: uploads/{context}/ (default crm) */
  imageUploadContext?: MediaUploadContext;
  imageUploadPreset?: ImageUploadPreset;
  /** When true, uploaded/pasted images insert at the caret (recommended for blog body). */
  insertImageAtCursor?: boolean;
  /** Allow clipboard image paste and upload into the editor body. */
  enableImagePaste?: boolean;
  /** When true, images removed from the document are deleted from local server storage (default). */
  deleteRemovedImages?: boolean;
  /** Classes on the outer shell (toolbar + body). */
  shellClassName?: string;
  /** Min height of the whole editor shell. */
  shellMinHeightClass?: string;
  /** Min height of the editable content area. */
  bodyMinHeightClass?: string;
  /** Show paragraph / H1–H4 heading controls in the toolbar (blog editor). */
  showHeadingControls?: boolean;
  /** Blog-optimized editor: headings, typography, no body H1. */
  blogMode?: boolean;
  /** Hide the toolbar entirely for minimal editors (e.g. comments). */
  hideToolbar?: boolean;
}

const ResizableImageNode = (props: any) => {
  const { node, updateAttributes, selected } = props;
  const imageRef = useRef<HTMLImageElement>(null);

  const float = node.attrs.float || 'center';

  const handleDownload = async () => {
    const src = node.attrs.src as string;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = src.split('/').pop()?.split('?')[0] || 'image';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, '_blank');
    }
  };

  const onMouseDown = (direction: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = imageRef.current?.clientWidth || 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      let newWidth = startWidth;
      if (direction.includes('right')) {
        newWidth = startWidth + (moveEvent.clientX - startX);
      } else if (direction.includes('left')) {
        newWidth = startWidth - (moveEvent.clientX - startX);
      }
      updateAttributes({ width: Math.max(30, newWidth) });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Outer wrapper style: controls float positioning
  const wrapperStyle: React.CSSProperties = {
    display: 'block',
    clear: float === 'center' ? 'both' : undefined,
    float: float === 'left' || float === 'right' ? float as any : undefined,
    marginRight: float === 'left' ? '1.5rem' : float === 'center' ? 'auto' : undefined,
    marginLeft: float === 'right' ? '1.5rem' : float === 'center' ? 'auto' : undefined,
    marginBottom: '1rem',
    marginTop: '0.5rem',
    width: node.attrs.width ? `${node.attrs.width}px` : 'fit-content',
    maxWidth: '100%',
    position: 'relative',
  };

  return (
    <NodeViewWrapper
      as="div"
      data-drag-handle
      style={wrapperStyle}
      className={`group transition-shadow ${selected ? 'ring-2 ring-[var(--hs-link)] ring-offset-2 rounded-[3px]' : ''}`}
    >
      {/* Inner wrapper keeps position:relative for the resize handles */}
      <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
        <img
          ref={imageRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
          }}
          className="rounded-[3px] border border-[#dfe1e6] shadow-sm pointer-events-none"
        />

        {!props.editor.isReadOnly && (
          <>
            {/* 8 Resize Handles */}
            {[
              { dir: 'top-left',     cursor: 'nw-resize', cls: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full' },
              { dir: 'top-right',    cursor: 'ne-resize', cls: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full' },
              { dir: 'bottom-left',  cursor: 'sw-resize', cls: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-3 h-3 rounded-full' },
              { dir: 'bottom-right', cursor: 'se-resize', cls: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-3 h-3 rounded-full' },
              { dir: 'top',          cursor: 'n-resize',  cls: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1.5 rounded-full' },
              { dir: 'bottom',       cursor: 's-resize',  cls: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-8 h-1.5 rounded-full' },
              { dir: 'left',         cursor: 'w-resize',  cls: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-8 rounded-full' },
              { dir: 'right',        cursor: 'e-resize',  cls: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-1.5 h-8 rounded-full' },
            ].map((h) => (
              <div
                key={h.dir}
                onMouseDown={onMouseDown(h.dir)}
                className={cn(
                  'absolute bg-[var(--hs-link)] opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-md border border-white',
                  h.cls
                )}
                style={{ cursor: h.cursor }}
              />
            ))}

            {/* Alignment Toolbar */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-800 text-white p-1 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-30 whitespace-nowrap">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ float: 'left' }); }}
                className={cn('p-1.5 rounded-md hover:bg-slate-700 transition-colors', float === 'left' && 'bg-slate-600 text-[var(--hs-link)]')}
                title="Float Left (text wraps on right)"
              >
                <AlignLeft size={14} />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ float: 'center' }); }}
                className={cn('p-1.5 rounded-md hover:bg-slate-700 transition-colors', float === 'center' && 'bg-slate-600 text-[var(--hs-link)]')}
                title="Center (no wrapping)"
              >
                <AlignCenter size={14} />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ float: 'right' }); }}
                className={cn('p-1.5 rounded-md hover:bg-slate-700 transition-colors', float === 'right' && 'bg-slate-600 text-[var(--hs-link)]')}
                title="Float Right (text wraps on left)"
              >
                <AlignRight size={14} />
              </button>
              <div className="w-px h-4 bg-slate-600 mx-0.5" />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleDownload(); }}
                className="p-1.5 rounded-md hover:bg-slate-700 transition-colors"
                title="Download image"
              >
                <Download size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};

const ResizableImage = Image.extend({
  inline: false,
  group: 'block',
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attributes) => {
          // Width is controlled by the wrapper div, not the img tag itself
          return {};
        },
      },
      float: {
        default: 'center',
        // renderHTML controls what goes into the saved HTML (used by preview)
        renderHTML: (attributes) => {
          const f = attributes.float || 'center';
          if (f === 'left') {
            return { 'data-float': 'left' };
          }
          if (f === 'right') {
            return { 'data-float': 'right' };
          }
          // center
          return { 'data-float': 'center' };
        },
        // parseHTML reads data-float back from saved HTML
        parseHTML: (element) => {
          return element.getAttribute('data-float') || 'center';
        },
      },
      // Store width separately in a data attribute so it survives HTML round-trips
      'data-width': {
        default: null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { 'data-width': attributes.width };
        },
        parseHTML: (element) => element.getAttribute('data-width'),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNode);
  },
});

export default function RichTextEditor({
  content,
  onChange,
  placeholder = "Write your message...",
  className,
  readOnly = false,
  editorRef,
  onModEnter,
  onEscape,
  imageUploadContext = "crm",
  imageUploadPreset = "inline",
  insertImageAtCursor = false,
  enableImagePaste = false,
  deleteRemovedImages = true,
  shellClassName,
  shellMinHeightClass = "min-h-[400px]",
  bodyMinHeightClass = "min-h-[300px] max-h-[600px]",
  showHeadingControls = false,
  blogMode = false,
  hideToolbar = false,
}: RichTextEditorProps) {
  const headingControlsEnabled = showHeadingControls || blogMode;
  const [linkUrl, setLinkUrl] = useState("");
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageWidth, setImageWidth] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [isImageOpen, setIsImageOpen] = useState(false);
  const [, setToolbarStateVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDocInputRef = useRef<HTMLInputElement>(null);
  const editorInstanceRef = useRef<Editor | null>(null);

  const trackedManagedImagesRef = useRef<Set<string>>(
    new Set(extractManagedImageUrlsFromHtml(content)),
  );
  const skipRemovedImageCleanupRef = useRef(false);
  const imageCleanupReadyRef = useRef(false);
  const shouldDeleteRemovedImages = deleteRemovedImages && !blogMode;
  const onModEnterRef = useRef(onModEnter);
  onModEnterRef.current = onModEnter;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const normalizeTrackedImageUrl = useCallback((url: string) => {
    return normalizeStoredImageUrl(url).split("?")[0].trim();
  }, []);

  const syncTrackedManagedImages = useCallback((html: string) => {
    trackedManagedImagesRef.current = new Set(
      extractManagedImageUrlsFromHtml(html).map(normalizeTrackedImageUrl),
    );
  }, [normalizeTrackedImageUrl]);

  const cleanupRemovedManagedImages = useCallback((html: string) => {
    if (!shouldDeleteRemovedImages || !imageCleanupReadyRef.current) return;
    const nextUrls = new Set(
      extractManagedImageUrlsFromHtml(html).map(normalizeTrackedImageUrl),
    );
    const previousUrls = trackedManagedImagesRef.current;
    for (const url of previousUrls) {
      if (!nextUrls.has(url)) {
        void removeUploadedImage(url);
      }
    }
    trackedManagedImagesRef.current = nextUrls;
  }, [shouldDeleteRemovedImages, normalizeTrackedImageUrl]);

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        bulletList: {
          HTMLAttributes: {
            style: "list-style-type: disc; padding-left: 20px; margin: 10px 0;",
          },
        },
        orderedList: {
          HTMLAttributes: {
            style: "list-style-type: decimal; padding-left: 20px; margin: 10px 0;",
          },
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        validate: (href) => /^https?:\/\//.test(href) || /^www\./.test(href) || /^mailto:/.test(href) || /^tel:/.test(href),
        HTMLAttributes: {
          style: "color: #ee5f3a; text-decoration: underline; cursor: pointer;",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      ResizableImage.configure({
        HTMLAttributes: {
          class: "rounded-lg border border-[#dfe1e6] max-w-full h-auto mx-1 my-2",
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "border-collapse table-auto w-full",
          border: "1",
          cellspacing: "0",
          cellpadding: "4",
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      FontSize.configure({
        types: ["textStyle"],
      }) as any,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: "tight",
        bulletListMarker: "-",
        linkify: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (skipRemovedImageCleanupRef.current) {
        skipRemovedImageCleanupRef.current = false;
        syncTrackedManagedImages(html);
      } else {
        cleanupRemovedManagedImages(html);
      }
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none overflow-y-auto px-6 py-5 text-sm leading-relaxed text-[var(--text-main)]",
          bodyMinHeightClass,
          "prose prose-slate dark:prose-invert max-w-none",
          "[&_img]:rounded-[3px] [&_img]:border [&_img]:border-[var(--border-color)] [&_img]:max-w-full [&_img]:h-auto [&_img]:shadow-sm",
          blogMode && [
            "prose-p:my-3 prose-p:leading-relaxed",
            "prose-h2:mt-8 prose-h2:mb-3 prose-h2:text-xl prose-h2:font-bold prose-h2:tracking-tight prose-h2:text-[var(--text-main)]",
            "prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-lg prose-h3:font-semibold prose-h3:text-[var(--text-main)]",
            "prose-h4:mt-4 prose-h4:mb-2 prose-h4:text-base prose-h4:font-semibold prose-h4:text-[var(--text-main)]",
            "prose-ul:my-3 prose-ol:my-3",
            "prose-blockquote:border-l-4 prose-blockquote:border-[var(--border-color)] prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-[var(--text-muted)]",
            "[&_.blog-table-of-contents]:my-6 [&_.blog-table-of-contents]:rounded-[3px] [&_.blog-table-of-contents]:border [&_.blog-table-of-contents]:border-[var(--border-color)] [&_.blog-table-of-contents]:bg-[var(--surface-dim)] [&_.blog-table-of-contents]:p-4",
            "[&_.faq-section]:my-6",
            "[&_a]:text-[var(--hs-link)] [&_a]:underline",
          ],
          className
        ),
      },
      handleKeyDown: (_view, event) => {
        if (
          onModEnterRef.current &&
          event.key === "Enter" &&
          (event.ctrlKey || event.metaKey)
        ) {
          event.preventDefault();
          onModEnterRef.current();
          return true;
        }
        if (onEscapeRef.current && event.key === "Escape") {
          onEscapeRef.current();
          return false;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const currentEditor = editorInstanceRef.current;
        if (!enableImagePaste || readOnly || !currentEditor) return false;
        const files = Array.from(event.clipboardData?.files || []).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        void (async () => {
          setIsUploading(true);
          try {
            for (const file of files.slice(0, 5)) {
              const data = await uploadImageFile(file, {
                context: imageUploadContext,
                preset: imageUploadPreset,
              });
              if (data?.url) {
                const src = resolveUploadedImageUrl(data.url);
                const escapedAlt = file.name
                  .replace(/&/g, "&amp;")
                  .replace(/"/g, "&quot;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
                if (insertImageAtCursor) {
                  currentEditor.chain().focus().setImage({ src, alt: file.name }).run();
                } else {
                  currentEditor
                    .chain()
                    .focus()
                    .insertContentAt(0, `<img src="${src}" alt="${escapedAlt}" /> `)
                    .run();
                }
              }
            }
            toast.success("Screenshot pasted");
          } catch (error) {
            console.error("Pasted image upload failed:", error);
            toast.error("Screenshot paste failed");
          } finally {
            setIsUploading(false);
          }
        })();
        return true;
      },
    },
  });

  useEffect(() => {
    editorInstanceRef.current = editor;
    return () => {
      if (editorInstanceRef.current === editor) {
        editorInstanceRef.current = null;
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const refreshToolbarState = () => {
      setToolbarStateVersion((value) => (value + 1) % 1000);
    };
    editor.on("selectionUpdate", refreshToolbarState);
    editor.on("transaction", refreshToolbarState);
    editor.on("focus", refreshToolbarState);
    editor.on("blur", refreshToolbarState);
    return () => {
      editor.off("selectionUpdate", refreshToolbarState);
      editor.off("transaction", refreshToolbarState);
      editor.off("focus", refreshToolbarState);
      editor.off("blur", refreshToolbarState);
    };
  }, [editor]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    imageCleanupReadyRef.current = false;
  }, [content]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      skipRemovedImageCleanupRef.current = true;
      editor.commands.setContent(content);
      syncTrackedManagedImages(content);
      const timer = window.setTimeout(() => {
        imageCleanupReadyRef.current = true;
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (editor) {
      imageCleanupReadyRef.current = true;
    }
  }, [content, editor, syncTrackedManagedImages]);

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl) return;

    const { from, to } = editor.state.selection;
    const isSelectionEmpty = from === to;

    let url = linkUrl.trim();
    if (url && !/^https?:\/\//i.test(url) && !/^mailto:/i.test(url) && !/^tel:/i.test(url)) {
      url = `https://${url}`;
    }

    if (isSelectionEmpty) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}">${url}</a> `)
        .run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }

    setLinkUrl("");
    setIsLinkOpen(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkUrl("");
    setIsLinkOpen(false);
  }, [editor]);

  const handleFileDocUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0 || !editor) return;

      setIsFileUploading(true);

      try {
        const file = files[0];
        const data = await uploadDocumentFile(file, imageUploadContext);
        if (data?.url) {
          const fullUrl = resolveUploadedImageUrl(data.url);
          const displayName = data.originalName || file.name;
          
          editor
            .chain()
            .focus()
            .insertContent(`<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" style="color: #ee5f3a; text-decoration: underline;">${displayName}</a> `)
            .run();
            
          setIsLinkOpen(false);
          toast.success("Document attached as link");
        }
      } catch (error) {
        console.error("Document upload failed:", error);
        toast.error("File upload failed");
      } finally {
        setIsFileUploading(false);
        if (fileDocInputRef.current) fileDocInputRef.current.value = "";
      }
    },
    [editor, imageUploadContext],
  );

  const insertImageSrc = useCallback(
    (src: string, altText?: string) => {
      if (!editor) return;
      const url = src.trim();
      if (!url) return;
      const resolvedAlt =
        String(altText || "").trim() || guessAltFromImageSource(url);
      if (insertImageAtCursor) {
        editor
          .chain()
          .focus()
          .setImage({ src: url, alt: resolvedAlt })
          .run();
      } else {
        const escapedAlt = resolvedAlt
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        editor
          .chain()
          .focus()
          .insertContentAt(0, `<img src="${url}" alt="${escapedAlt}" /> `)
          .run();
      }
    },
    [editor, insertImageAtCursor],
  );

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0 || !editor) return;

      if (files.length > 5) {
        toast.error("Maximum of 5 images can be selected at once.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setIsUploading(true);

      try {
        let uploadedCount = 0;
        for (const file of files) {
          const data = await uploadImageFile(file, {
            context: imageUploadContext,
            preset: imageUploadPreset,
          });
          if (data?.url) {
            const fullUrl = resolveUploadedImageUrl(data.url);
            const fileNameAlt = file.name
              ? file.name
                  .replace(/\.[a-z0-9]+$/i, "")
                  .replace(/[-_]+/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
              : "";
            insertImageSrc(fullUrl, fileNameAlt);
            uploadedCount++;
          }
        }
        if (uploadedCount > 0) {
          setIsImageOpen(false);
          toast.success(`${uploadedCount} image${uploadedCount > 1 ? "s" : ""} uploaded`);
        }
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error("Image upload failed");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [editor, imageUploadContext, imageUploadPreset, insertImageSrc],
  );

  const applyImage = useCallback(() => {
    if (!editor || !imageUrl) return;

    let url = imageUrl.trim();

    // Auto-extract from Google Images search results if possible
    if (url.includes("google.com/imgres") && url.includes("imgurl=")) {
      try {
        const u = new URL(url);
        const extracted = u.searchParams.get("imgurl");
        if (extracted) url = extracted;
      } catch {
        /* ignore */
      }
    }

    if (url && !/^https?:\/\//i.test(url) && !/^\//.test(url)) {
      url = `https://${url}`;
    }

    insertImageSrc(normalizeStoredImageUrl(url), imageAlt);

    setImageUrl("");
    setImageAlt("");
    setImageWidth("");
    setIsImageOpen(false);
  }, [editor, imageUrl, imageAlt, insertImageSrc]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-[3px] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-sm focus-within:ring-4 focus-within:ring-primary/5 transition-all w-full relative",
        shellMinHeightClass,
        shellClassName,
      )}
    >
      {!readOnly && !hideToolbar ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-color)] bg-[var(--card-bg)] p-1.5 sticky top-0 z-[100] shadow-sm rounded-t-2xl">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive("bold") && "bg-white text-primary shadow-sm"
            )}
            title="Bold"
          >
            <Bold size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive("italic") && "bg-white text-primary shadow-sm"
            )}
            title="Italic"
          >
            <Italic size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive("underline") && "bg-white text-primary shadow-sm"
            )}
            title="Underline"
          >
            <UnderlineIcon size={16} />
          </Button>

          {headingControlsEnabled ? (
            <>
              <div className="mx-1 h-4 w-px bg-slate-200" />
              <HeadingSelector editor={editor} blogMode={blogMode} />
            </>
          ) : null}

          <div className="mx-1 h-4 w-px bg-slate-200" />

          {/* Font Size Selector */}
          <FontSizeInput editor={editor} />

          <div className="mx-1 h-4 w-px bg-slate-200" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive({ textAlign: "left" }) && "bg-white text-primary shadow-sm"
            )}
            title="Align Left"
          >
            <AlignLeft size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive({ textAlign: "center" }) && "bg-white text-primary shadow-sm"
            )}
            title="Align Center"
          >
            <AlignCenter size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive({ textAlign: "right" }) && "bg-white text-primary shadow-sm"
            )}
            title="Align Right"
          >
            <AlignRight size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive({ textAlign: "justify" }) && "bg-white text-primary shadow-sm"
            )}
            title="Justify"
          >
            <AlignJustify size={16} />
          </Button>

          <div className="mx-1 h-4 w-px bg-slate-200" />

          <Popover open={isLinkOpen} onOpenChange={(open) => {
            setIsLinkOpen(open);
            if (open) {
              setLinkUrl(editor.getAttributes("link").href || "");
            }
          }}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
                  editor.isActive("link") && "bg-white text-primary shadow-sm"
                )}
                title="Insert Link"
              >
                <LinkIcon size={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="z-[5000] w-[340px] p-0 shadow-lg border-[#dfe1e6] rounded-[20px] overflow-hidden animate-in zoom-in-95"
              align="start"
              sideOffset={8}
            >
              <div className="bg-[#f4f5f7]/50 px-4 py-3 border-b border-[#ebecf0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--hs-link)] text-white shadow-sm shadow-[var(--hs-link)]/20">
                    <ExternalLink size={14} strokeWidth={2.5} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Insert Link</span>
                </div>
                <input
                  type="file"
                  ref={fileDocInputRef}
                  className="hidden"
                  onChange={handleFileDocUpload}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs font-semibold text-primary hover:bg-white rounded-lg"
                  onClick={() => fileDocInputRef.current?.click()}
                  disabled={isFileUploading}
                >
                  {isFileUploading ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <>
                      <UploadCloud size={14} className="mr-1" /> Upload file
                    </>
                  )}
                </Button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Upload file/document or paste a URL link. Documents are attached as download links.
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 ml-1">Destination URL</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      className="h-10 text-sm bg-white border-[#dfe1e6] rounded-[3px] focus-visible:ring-primary/20 transition-all font-medium"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applyLink();
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-10 px-4 shrink-0 bg-[var(--hs-link)] hover:bg-[var(--hs-link)]/90 text-xs font-semibold rounded-[3px] transition-all hover:scale-[1.02] active:scale-95"
                      onClick={applyLink}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
                {editor.isActive("link") && (
                  <div className="pt-2 border-t border-slate-50">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeLink}
                      className="w-full h-9 text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-[3px] transition-all"
                    >
                      Remove Current Link
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={isImageOpen} onOpenChange={(open) => {
            setIsImageOpen(open);
            if (open) {
              const attrs = editor.getAttributes("image");
              setImageUrl(attrs.src || "");
              setImageAlt(attrs.alt || "");
              setImageWidth(attrs.width || "");
            }
          }}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
                  editor.isActive("image") && "bg-white text-primary shadow-sm"
                )}
                title="Insert Image"
              >
                <ImagePlus size={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="z-[5000] w-[340px] p-0 shadow-lg border-[#dfe1e6] rounded-[20px] overflow-hidden animate-in zoom-in-95"
              align="start"
              sideOffset={8}
            >
              <div className="bg-[#f4f5f7]/50 px-4 py-3 border-b border-[#ebecf0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--hs-link)] text-white shadow-sm shadow-[var(--hs-link)]/20">
                    <ImagePlus size={14} strokeWidth={2.5} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Insert Image</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs font-semibold text-primary hover:bg-white rounded-lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <>
                      <UploadCloud size={14} className="mr-1" /> Upload
                    </>
                  )}
                </Button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Upload an image or paste an image URL. Images are optimized before upload.
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 ml-1">Image URL</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com/image.jpg"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="h-10 text-sm bg-white border-[#dfe1e6] rounded-[3px] focus-visible:ring-primary/20 transition-all font-medium"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applyImage();
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-10 px-6 bg-[var(--hs-link)] hover:bg-[var(--hs-link)]/90 text-xs font-semibold rounded-[3px] transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-[var(--hs-link)]/20"
                      onClick={applyImage}
                    >
                      Insert
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--text-muted)] ml-1">Alt text</label>
                  <Input
                    placeholder="Describe the image for accessibility"
                    value={imageAlt}
                    onChange={(e) => setImageAlt(e.target.value)}
                    className="h-10 text-sm bg-[var(--card-bg)] border-[var(--border-color)] rounded-[3px] focus-visible:ring-primary/20 transition-all font-medium"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="mx-1 h-4 w-px bg-slate-200" />

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-2 text-slate-500 hover:text-primary hover:bg-white flex items-center gap-1",
                  editor.isActive("table") && "bg-white text-primary shadow-sm"
                )}
                title="Table Menu"
              >
                <TableIcon size={16} />
                <ChevronDown size={12} className="opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="z-[5000] w-48 p-1 shadow-lg border-[#dfe1e6] rounded-[3px] overflow-hidden" align="start">
              <div className="grid gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start h-8 text-[11px] font-medium px-2 rounded-lg"
                  onClick={() => {
                    if (typeof editor.chain().focus().insertTable === 'function') {
                      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                    } else {
                      console.error("Tiptap Table extension is not properly loaded.");
                    }
                  }}
                >
                  <SquarePlus size={14} className="mr-2 text-primary" /> Insert 3x3 Table
                </Button>
                <div className="h-px bg-slate-100 my-1 mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start h-8 text-[11px] font-medium px-2 rounded-lg"
                  disabled={!editor.isActive("table")}
                  onClick={() => {
                    if (typeof editor.chain().focus().addRowAfter === 'function') {
                      editor.chain().focus().addRowAfter().run();
                    }
                  }}
                >
                  <BetweenHorizontalEnd size={14} className="mr-2 text-slate-400" /> Add Row
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start h-8 text-[11px] font-medium px-2 rounded-lg"
                  disabled={!editor.isActive("table")}
                  onClick={() => {
                    if (typeof editor.chain().focus().addColumnAfter === 'function') {
                      editor.chain().focus().addColumnAfter().run();
                    }
                  }}
                >
                  <BetweenVerticalEnd size={14} className="mr-2 text-slate-400" /> Add Column
                </Button>
                <div className="h-px bg-slate-100 my-1 mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start h-8 text-[11px] font-medium px-2 rounded-lg"
                  disabled={!editor.isActive("table")}
                  onClick={() => {
                    if (typeof editor.chain().focus().mergeCells === 'function') {
                      editor.chain().focus().mergeCells().run();
                    }
                  }}
                >
                  <TableCellsMerge size={14} className="mr-2 text-slate-400" /> Merge Cells
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start h-8 text-[11px] font-medium px-2 rounded-lg"
                  disabled={!editor.isActive("table")}
                  onClick={() => {
                    if (typeof editor.chain().focus().splitCell === 'function') {
                      editor.chain().focus().splitCell().run();
                    }
                  }}
                >
                  <TableCellsSplit size={14} className="mr-2 text-slate-400" /> Split Cell
                </Button>
                <div className="h-px bg-slate-100 my-1 mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start h-8 text-[11px] font-medium px-2 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                  disabled={!editor.isActive("table")}
                  onClick={() => {
                    if (typeof editor.chain().focus().deleteTable === 'function') {
                      editor.chain().focus().deleteTable().run();
                    }
                  }}
                >
                  <Trash2 size={14} className="mr-2" /> Delete Table
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive("bulletList") && "bg-white text-primary shadow-sm"
            )}
            title="Bullet List"
          >
            <List size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white",
              editor.isActive("orderedList") && "bg-white text-primary shadow-sm"
            )}
            title="Numbered List"
          >
            <ListOrdered size={16} />
          </Button>

          <div className="mx-1 h-4 w-px bg-slate-200" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().unsetAllMarks().run()}
            className="h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-white"
            title="Clear Formatting"
          >
            <Eraser size={16} />
          </Button>

          <div className="ml-auto flex items-center gap-0.5 mt-[-2px] mb-[-2px]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className="h-8 w-8 p-0 text-slate-400 disabled:opacity-30"
            >
              <Undo2 size={16} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className="h-8 w-8 p-0 text-slate-400 disabled:opacity-30"
            >
              <Redo2 size={16} />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Editor Content - Scrollable area */}
      <div
        className={cn(
          "flex-1 overflow-y-auto custom-scrollbar",
          !readOnly ? cn(bodyMinHeightClass, "max-h-[min(70vh,720px)] p-1") : "",
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

type HeadingLevel = 1 | 2 | 3 | 4;

const HEADING_OPTIONS: Array<{
  id: "paragraph" | `h${HeadingLevel}`;
  label: string;
  level?: HeadingLevel;
  icon: typeof Pilcrow;
  previewClass: string;
}> = [
  { id: "paragraph", label: "Paragraph", icon: Pilcrow, previewClass: "text-sm font-normal" },
  { id: "h1", label: "Heading 1", level: 1, icon: Heading1, previewClass: "text-2xl font-bold" },
  { id: "h2", label: "Heading 2", level: 2, icon: Heading2, previewClass: "text-xl font-bold" },
  { id: "h3", label: "Heading 3", level: 3, icon: Heading3, previewClass: "text-lg font-semibold" },
  { id: "h4", label: "Heading 4", level: 4, icon: Heading4, previewClass: "text-base font-semibold" },
];

function getActiveHeadingOption(editor: Editor) {
  for (let level = 4; level >= 1; level -= 1) {
    if (editor.isActive("heading", { level: level as HeadingLevel })) {
      return HEADING_OPTIONS.find((o) => o.level === level) ?? HEADING_OPTIONS[0];
    }
  }
  return HEADING_OPTIONS[0];
}

function HeadingSelector({ editor, blogMode = false }: { editor: Editor; blogMode?: boolean }) {
  const headingOptions = blogMode
    ? HEADING_OPTIONS.filter((o) => o.id !== "h1")
    : HEADING_OPTIONS;
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  const active = getActiveHeadingOption(editor);
  const ActiveIcon = active.icon;

  const applyHeading = (level?: HeadingLevel) => {
    if (level === 1 && blogMode) {
      editor.chain().focus().setHeading({ level: 2 }).run();
      toast.message("Post title is your page H1 — applied H2 for this section.");
    } else if (level) {
      editor.chain().focus().setHeading({ level }).run();
    } else {
      editor.chain().focus().setParagraph().run();
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 gap-1 px-2 text-slate-500 hover:text-primary hover:bg-white min-w-[108px] justify-between",
            active.id !== "paragraph" && "bg-white text-primary shadow-sm",
          )}
          title="Text style"
        >
          <span className="flex items-center gap-1.5">
            <ActiveIcon size={16} />
            <span className="text-xs font-semibold">{active.id === "paragraph" ? "Text" : active.id.toUpperCase()}</span>
          </span>
          <ChevronDown size={14} className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[5000] w-56 p-1" align="start" sideOffset={8}>
        {blogMode ? (
          <p className="px-2.5 py-1.5 text-[10px] font-medium leading-snug text-slate-500 border-b border-[#ebecf0] mb-1">
            Post title is the page H1. Use H2 for sections.
          </p>
        ) : null}
        {headingOptions.map((option) => {
          const Icon = option.icon;
          const isActive =
            option.id === "paragraph"
              ? !editor.isActive("heading")
              : editor.isActive("heading", { level: option.level });
          return (
            <button
              key={option.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#f4f5f7]",
                isActive && "bg-primary/5 text-primary",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyHeading(option.level)}
            >
              <Icon size={16} className="shrink-0 text-slate-500" />
              <span className={cn(option.previewClass, "text-slate-800")}>{option.label}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function FontSizeInput({ editor }: { editor: any }) {
  const currentSize = editor.getAttributes("textStyle").fontSize?.replace("px", "") || "16";
  const [inputValue, setInputValue] = useState(currentSize);

  useEffect(() => {
    setInputValue(currentSize);
  }, [currentSize]);

  const updateFontSize = (val: string) => {
    const numeric = val.replace(/[^0-9]/g, "");
    setInputValue(numeric);
    if (numeric) {
      editor.chain().setFontSize(`${numeric}px`).run();
    }
  };

  const increment = () => {
    const next = parseInt(inputValue || "16") + 1;
    if (next <= 100) updateFontSize(next.toString());
  };

  const decrement = () => {
    const next = parseInt(inputValue || "16") - 1;
    if (next >= 8) updateFontSize(next.toString());
  };

  return (
    <div className="flex items-center gap-1 bg-[#f4f5f7] rounded-lg p-0.5 ml-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-slate-500 hover:text-primary hover:bg-white"
        onClick={decrement}
      >
        <MinusIcon size={12} />
      </Button>

      <div className="flex items-center px-1 min-w-[32px] justify-center">
        <input
          type="text"
          className="w-8 bg-transparent text-[11px] font-bold text-center focus:outline-none"
          value={inputValue}
          onChange={(e) => updateFontSize(e.target.value)}
          onBlur={() => {
            if (!inputValue) {
              setInputValue("16");
              editor.chain().setFontSize("16px").run();
            }
          }}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-slate-500 hover:text-primary hover:bg-white"
        onClick={increment}
      >
        <PlusIcon size={12} />
      </Button>
    </div>
  );
}



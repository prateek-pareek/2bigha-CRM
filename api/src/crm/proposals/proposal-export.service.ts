import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import puppeteer from 'puppeteer';
import { ProposalsService } from './proposals.service';
import { ProposalBrandingService } from './proposal-branding.service';
import type { AgencyBrandingSubdoc } from '../schemas/proposal-branding.schema';
import type { FreelancerBrandingSubdoc } from '../schemas/proposal-branding.schema';

// html-to-docx ships UMD without TS types
// eslint-disable-next-line @typescript-eslint/no-require-imports
import HTMLtoDOCX = require('html-to-docx');
import * as XLSX from 'xlsx';

function esc(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fileSlug(title: string): string {
  const base = (title || 'document')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return base || 'document';
}

function htmlFragmentToPlainText(fragment: string): string {
  const $ = load(`<div class="crm-plain-root">${fragment || ''}</div>`);
  return ($('.crm-plain-root').text() || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeBodyHtml(fragment: string): string {
  const wrap = `<div class="crm-export-root">${fragment || '<p></p>'}</div>`;
  const $ = load(wrap);
  $('.crm-export-root script, .crm-export-root iframe, .crm-export-root object, .crm-export-root embed').remove();
  $('.crm-export-root *').each((_, el) => {
    if (el.type !== 'tag' || !el.attribs) return;
    const $el = $(el);
    for (const name of Object.keys(el.attribs)) {
      const lower = name.toLowerCase();
      const val = el.attribs[name] ?? '';
      if (lower.startsWith('on')) {
        $el.removeAttr(name);
      }
      if (lower === 'href' && /^\s*javascript:/i.test(val)) {
        $el.removeAttr('href');
      }
    }
  });
  return $('.crm-export-root').html() ?? '';
}

function safeLogoImg(url: string | undefined): string {
  const u = (url ?? '').trim();
  if (!u) return '';
  if (/^https:\/\//i.test(u)) {
    return `<img src="${attrEscape(u)}" alt="" class="issuer-logo" />`;
  }
  if (
    /^data:image\/(png|jpeg|gif|webp);base64,/i.test(u) &&
    u.length < 600_000
  ) {
    return `<img src="${attrEscape(u)}" alt="" class="issuer-logo" />`;
  }
  return '';
}

type BrandingPack = {
  agency?: AgencyBrandingSubdoc | null;
  freelancer?: FreelancerBrandingSubdoc | null;
};

function buildDocHeader(
  kindLabel: string,
  issuerProfile: 'agency' | 'freelancer',
  branding: BrandingPack | null,
  creatorDisplayName: string,
): string {
  const pill = `<div class="kind-pill">${esc(kindLabel)}</div>`;
  if (issuerProfile === 'freelancer') {
    const f = branding?.freelancer;
    const name =
      f?.displayName?.trim() ||
      creatorDisplayName.trim() ||
      'Independent professional';
    const titleLine = f?.title?.trim();
    const lines: string[] = [];
    if (f?.email?.trim()) lines.push(esc(f.email.trim()));
    if (f?.phone?.trim()) lines.push(esc(f.phone.trim()));
    if (f?.website?.trim()) lines.push(esc(f.website.trim()));
    const contact = lines
      .map((l) => `<div class="issuer-line">${l}</div>`)
      .join('');
    const addr = f?.addressLines?.trim()
      ? `<div class="issuer-addr">${esc(f.addressLines).replace(/\n/g, '<br/>')}</div>`
      : '';
    const extra = f?.headerHtml?.trim()
      ? `<div class="issuer-extra body-content">${sanitizeBodyHtml(f.headerHtml)}</div>`
      : '';
    return `<header class="doc-header">
      <div class="issuer-block">
        <div class="brand">${esc(name)}</div>
        ${titleLine ? `<div class="brand-sub">${esc(titleLine)}</div>` : ''}
        <div class="issuer-contact">${contact}</div>
        ${addr}
        ${extra}
      </div>
      ${pill}
    </header>`;
  }

  const a = branding?.agency;
  const hasCustom =
    a?.companyName?.trim() ||
    a?.logoUrl?.trim() ||
    a?.tagline?.trim() ||
    a?.headerHtml?.trim();
  if (!hasCustom) {
    return `<header class="doc-header">
      <div>
        <div class="brand">2Bigha</div>
        <div class="brand-sub">Technologies Private Limited</div>
      </div>
      ${pill}
    </header>`;
  }
  const logo = safeLogoImg(a?.logoUrl);
  const company = esc(a?.companyName?.trim() || 'Company');
  const tag = a?.tagline?.trim()
    ? `<div class="brand-sub">${esc(a.tagline)}</div>`
    : '';
  const extra = a?.headerHtml?.trim()
    ? `<div class="issuer-extra body-content">${sanitizeBodyHtml(a.headerHtml)}</div>`
    : '';
  return `<header class="doc-header">
    <div class="issuer-agency">
      ${logo ? `<div class="issuer-logo-wrap">${logo}</div>` : ''}
      <div>
        <div class="brand">${company}</div>
        ${tag}
        ${extra}
      </div>
    </div>
    ${pill}
  </header>`;
}

const DEFAULT_FOOTER_SENTENCE =
  'This document was generated from 2Bigha CRM. Commercial terms are subject to the final agreement between parties.';

function buildFooterInner(
  issuerProfile: 'agency' | 'freelancer',
  branding: BrandingPack | null,
): string {
  const parts: string[] = [];
  if (issuerProfile === 'agency') {
    const a = branding?.agency;
    if (a?.footerHtml?.trim()) {
      parts.push(
        `<div class="footer-custom body-content">${sanitizeBodyHtml(a.footerHtml)}</div>`,
      );
    }
    if (a?.addressLines?.trim()) {
      parts.push(
        `<div class="footer-addr">${esc(a.addressLines).replace(/\n/g, '<br/>')}</div>`,
      );
    }
    const line = [a?.phone, a?.email, a?.website]
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
      .map((x) => esc(x))
      .join(' · ');
    if (line) parts.push(`<div class="footer-line">${line}</div>`);
  } else {
    const f = branding?.freelancer;
    if (f?.footerHtml?.trim()) {
      parts.push(
        `<div class="footer-custom body-content">${sanitizeBodyHtml(f.footerHtml)}</div>`,
      );
    }
    if (f?.addressLines?.trim()) {
      parts.push(
        `<div class="footer-addr">${esc(f.addressLines).replace(/\n/g, '<br/>')}</div>`,
      );
    }
  }
  parts.push(`<div class="footer-default">${esc(DEFAULT_FOOTER_SENTENCE)}</div>`);
  return parts.join('');
}

function buildStyledDocumentHtml(input: {
  title: string;
  kind: string;
  status: string;
  clientName: string;
  clientEmail: string;
  currency?: string;
  totalAmount?: number;
  validityUntil?: Date | string | null;
  generatedAt: Date;
  bodyHtml: string;
  issuerProfile: 'agency' | 'freelancer';
  branding: BrandingPack | null;
  creatorDisplayName: string;
}): string {
  const kindLabel =
    input.kind === 'quotation'
      ? 'Quotation'
      : input.kind === 'cv'
        ? 'CV / Resume'
        : input.kind === 'contract'
          ? 'Contract'
          : 'Proposal';
  const total =
    input.totalAmount != null && Number.isFinite(Number(input.totalAmount))
      ? new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: input.currency || 'INR',
          maximumFractionDigits: 2,
        }).format(Number(input.totalAmount))
      : '';
  let validity = '';
  if (input.validityUntil) {
    const d =
      input.validityUntil instanceof Date
        ? input.validityUntil
        : new Date(input.validityUntil);
    if (!Number.isNaN(d.getTime())) {
      validity = d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }
  const generated = input.generatedAt.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const metaRows: { label: string; value: string }[] = [
    { label: 'Document', value: `${kindLabel} — ${esc(input.title)}` },
    { label: 'Issuer', value: esc(input.issuerProfile === 'freelancer' ? 'Freelancer / individual' : 'Agency / company') },
    { label: 'Status', value: esc(input.status || '—') },
    { label: 'Client', value: esc(input.clientName || '—') },
  ];
  if (input.clientEmail) {
    metaRows.push({ label: 'Email', value: esc(input.clientEmail) });
  }
  if (total) {
    metaRows.push({ label: 'Total', value: esc(total) });
  }
  if (validity) {
    metaRows.push({ label: 'Valid until', value: esc(validity) });
  }
  metaRows.push({ label: 'Generated', value: esc(generated) });

  const metaHtml = metaRows
    .map(
      (r) =>
        `<div class="meta-row"><span class="meta-label">${r.label}</span><span class="meta-value">${r.value}</span></div>`,
    )
    .join('');

  const headerHtml = buildDocHeader(
    kindLabel,
    input.issuerProfile,
    input.branding,
    input.creatorDisplayName,
  );
  const footerInner = buildFooterInner(input.issuerProfile, input.branding);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(input.title)}</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #1a1a1a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-shell { max-width: 100%; }
    .doc-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 14px;
      margin-bottom: 20px;
      border-bottom: 3px solid #0091ae;
    }
    .issuer-agency {
      display: flex;
      align-items: flex-end;
      gap: 14px;
      flex: 1;
      min-width: 0;
    }
    .issuer-logo-wrap { flex-shrink: 0; }
    .issuer-logo {
      max-height: 52px;
      max-width: 220px;
      object-fit: contain;
      display: block;
    }
    .issuer-block { flex: 1; min-width: 0; }
    .issuer-contact { margin-top: 6px; font-size: 9pt; color: #516f90; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .issuer-line { margin: 2px 0; }
    .issuer-addr { margin-top: 8px; font-size: 9pt; color: #516f90; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .issuer-extra { margin-top: 10px; font-size: 9.5pt; }
    .brand {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: #0091ae;
      letter-spacing: -0.03em;
      line-height: 1.2;
    }
    .brand-sub {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 9pt;
      color: #516f90;
      margin-top: 4px;
      font-weight: 500;
    }
    .kind-pill {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #fff;
      background: #ff7a59;
      padding: 6px 12px;
      border-radius: 3px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .meta-block {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 10pt;
      margin-bottom: 22px;
      padding: 14px 16px;
      background: #f5f8fa;
      border: 1px solid #eaf0f6;
      border-radius: 4px;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px 12px;
      padding: 4px 0;
      border-bottom: 1px solid #eaf0f6;
    }
    .meta-row:last-child { border-bottom: none; }
    .meta-label { color: #7c98b6; font-weight: 600; }
    .meta-value { color: #33475b; }
    .body-content {
      font-size: 11pt;
    }
    .body-content p { margin: 0 0 10px; }
    .body-content h1, .body-content h2, .body-content h3 {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #33475b;
      line-height: 1.25;
      margin: 18px 0 10px;
    }
    .body-content h1 { font-size: 17pt; border-bottom: 1px solid #eaf0f6; padding-bottom: 6px; }
    .body-content h2 { font-size: 14pt; }
    .body-content h3 { font-size: 12pt; }
    .body-content ul, .body-content ol { margin: 0 0 12px; padding-left: 1.35em; }
    .body-content li { margin: 4px 0; }
    .body-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 10pt;
    }
    .body-content th, .body-content td {
      border: 1px solid #cbd6e2;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    .body-content th {
      background: #f5f8fa;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-weight: 600;
      color: #33475b;
    }
    .body-content blockquote {
      margin: 12px 0;
      padding: 10px 14px;
      border-left: 4px solid #0091ae;
      background: #f5f8fa;
      color: #516f90;
    }
    .body-content a { color: #0091ae; }
    .footer-note {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid #eaf0f6;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 8.5pt;
      color: #7c98b6;
    }
    .footer-custom { margin-bottom: 10px; color: #33475b; }
    .footer-addr { margin-bottom: 8px; color: #516f90; }
    .footer-line { margin-bottom: 8px; color: #516f90; }
    .footer-default { margin-top: 10px; color: #7c98b6; }
  </style>
</head>
<body>
  <div class="doc-shell">
    ${headerHtml}
    <section class="meta-block">${metaHtml}</section>
    <main class="body-content">${input.bodyHtml}</main>
    <footer class="footer-note">
      ${footerInner}
    </footer>
  </div>
</body>
</html>`;
}

function creatorIdFromProposal(p: {
  createdBy?: unknown;
}): string | null {
  const c = p.createdBy;
  if (!c) return null;
  if (typeof c === 'object' && c !== null && '_id' in c) {
    return String((c as { _id: unknown })._id);
  }
  return String(c);
}

function creatorNameFromProposal(p: { createdBy?: unknown }): string {
  const c = p.createdBy;
  if (typeof c === 'object' && c !== null && 'firstName' in c) {
    const o = c as { firstName?: string; lastName?: string };
    return `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim();
  }
  return '';
}

@Injectable()
export class ProposalExportService {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly proposalBrandingService: ProposalBrandingService,
  ) {}

  private async loadAndBuildHtml(id: string): Promise<{
    html: string;
    slug: string;
  }> {
    const p = await this.proposalsService.findOne(id);
    const body = sanitizeBodyHtml(p.bodyHtml || '');
    const uid = creatorIdFromProposal(p);
    const brandingRow = uid
      ? await this.proposalBrandingService.findForUser(uid)
      : null;
    const issuerProfile: 'agency' | 'freelancer' =
      p.issuerProfile === 'freelancer' ? 'freelancer' : 'agency';
    const html = buildStyledDocumentHtml({
      title: p.title,
      kind: p.kind,
      status: p.status,
      clientName: p.clientName || '',
      clientEmail: p.clientEmail || '',
      currency: p.currency,
      totalAmount: p.totalAmount,
      validityUntil: p.validityUntil,
      generatedAt: new Date(),
      bodyHtml: body,
      issuerProfile,
      branding: brandingRow
        ? {
            agency: brandingRow.agency ?? undefined,
            freelancer: brandingRow.freelancer ?? undefined,
          }
        : null,
      creatorDisplayName: creatorNameFromProposal(p),
    });
    return { html, slug: fileSlug(p.title) };
  }

  async pdfBuffer(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const { html, slug } = await this.loadAndBuildHtml(id);
    const filename = `${slug}.pdf`;
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    const browser = await puppeteer.launch({
      headless: true,
      ...(execPath ? { executablePath: execPath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
      const buf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' },
      });
      return { buffer: Buffer.from(buf), filename };
    } finally {
      await browser.close();
    }
  }

  async docxBuffer(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const { html, slug } = await this.loadAndBuildHtml(id);
    const filename = `${slug}.docx`;
    const raw = await HTMLtoDOCX(html, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });
    const buffer = Buffer.isBuffer(raw)
      ? raw
      : Buffer.from(
          raw instanceof ArrayBuffer
            ? new Uint8Array(raw)
            : new Uint8Array(raw as Uint8Array),
        );
    return { buffer, filename };
  }

  /**
   * Spreadsheet export: metadata + plain text from stored HTML only (no PDF binary stored).
   * Generated in memory for download or email attachment workflows.
   */
  async xlsxBuffer(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const p = await this.proposalsService.findOne(id);
    const plain = htmlFragmentToPlainText(p.bodyHtml || '');
    const slug = fileSlug(p.title);
    const kindLabel =
      p.kind === 'quotation'
        ? 'Quotation'
        : p.kind === 'contract'
          ? 'Contract'
          : p.kind === 'cv'
          ? 'CV / Resume'
          : 'Proposal';
    const rows: (string | number)[][] = [
      ['Field', 'Value'],
      ['Document type', kindLabel],
      ['Title', p.title || ''],
      ['Status', p.status || ''],
      ['Recipient / client', p.clientName || ''],
      ['Email', p.clientEmail || ''],
      [
        'Total',
        p.totalAmount != null && Number.isFinite(Number(p.totalAmount))
          ? Number(p.totalAmount)
          : '',
      ],
      ['Currency', p.currency || ''],
      ['', ''],
      ['Body (plain text from HTML)', plain],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export');
    const raw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    return { buffer, filename: `${slug}.xlsx` };
  }
}

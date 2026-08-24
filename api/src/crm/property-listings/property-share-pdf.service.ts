import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { StorageService } from '../../storage/storage.service';
import { resolvePublicMediaUrl } from '../../storage/media-url.util';

export type PropertyShareInput = {
  title: string;
  location: string;
  area?: string;
  areaUnit?: string;
  pricePerUnit?: string;
  totalPrice?: string;
  landType?: string;
  roadAccess?: string;
  waterLevel?: string;
  highway?: string;
  contactName?: string;
  contactPhone?: string;
  link?: string;
  /** First image is the hero shot the area badge sits on; the rest render as a thumbnail strip. */
  images: string[];
};

function esc(s: string | undefined): string {
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
  const base = (title || 'property')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return base || 'property';
}

/** Only http(s)/data-image sources are trusted into the rendered HTML — same policy as proposal export's `safeLogoImg`. */
function safeImg(url: string | undefined, alt: string, cls: string): string {
  const resolved = resolvePublicMediaUrl(url);
  if (!resolved) return '';
  if (/^https:\/\//i.test(resolved) || /^http:\/\//i.test(resolved)) {
    return `<img src="${attrEscape(resolved)}" alt="${attrEscape(alt)}" class="${cls}" />`;
  }
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(resolved) && resolved.length < 2_000_000) {
    return `<img src="${attrEscape(resolved)}" alt="${attrEscape(alt)}" class="${cls}" />`;
  }
  return '';
}

/**
 * Renders the "Property Overview" brochure layout used across every
 * WhatsApp property share — 2Bigha logo, category label, hero image with an
 * area badge, and a green two-column details table. Reproduces the
 * reference deck's layout (see the "Share Property" feature plan).
 */
function buildPropertyShareHtml(input: PropertyShareInput): string {
  const rows: Array<[string, string | undefined]> = [
    ['Location', input.location],
    ['Area', input.area ? `${input.area} ${input.areaUnit || ''}`.trim() : undefined],
    ['Price/unit', input.pricePerUnit],
    ['Total Price', input.totalPrice],
    ['Land Type', input.landType],
    ['Road Access', input.roadAccess],
    ['Water Level', input.waterLevel],
    ['Highway', input.highway],
    ['Contact', [input.contactName, input.contactPhone].filter(Boolean).join(' · ')],
    ['Link', input.link],
  ];

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td class="row-label">${esc(label)}</td><td class="row-value">${esc(value) || ''}</td></tr>`,
    )
    .join('');

  const [hero, ...rest] = input.images;
  const heroImg = safeImg(hero, input.title, 'hero-img');
  const badge =
    input.area
      ? `<div class="area-badge"><span class="area-value">${esc(input.area)} ${esc(input.areaUnit || '')}</span><span class="area-caption">Total area</span></div>`
      : '';
  const thumbs = rest
    .slice(0, 4)
    .map((url) => `<div class="thumb">${safeImg(url, input.title, 'thumb-img')}</div>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(input.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .brand-row { display: flex; align-items: center; margin-bottom: 3px; }
    .brand-name { font-size: 30px; font-weight: 900; letter-spacing: -1.6px; color: #111; line-height: 1; }
    .brand-name .accent { display: inline-block; margin: 0 1px; padding: 1px 4px 2px; background: #258659; color: #fff; letter-spacing: -1px; }
    .brand-tagline { font-size: 8px; font-weight: 800; letter-spacing: 0.08em; color: #1f2937; text-transform: uppercase; }
    .category { font-family: Impact, "Arial Narrow", sans-serif; font-size: 20px; font-weight: 400; letter-spacing: 0.025em; color: #5b9134; text-transform: uppercase; margin: 34px 0 6px; }
    .layout { display: flex; gap: 28px; align-items: flex-start; }
    .media-col { flex: 1.15; min-width: 0; }
    .hero-wrap { position: relative; overflow: hidden; background: #e5e7eb; height: 340px; border: 1px solid #1d3557; }
    .hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .area-badge {
      position: absolute; left: 14px; bottom: 14px;
      background: rgba(20, 30, 22, 0.72); color: #fff;
      border-radius: 8px; padding: 8px 14px; text-align: center;
    }
    .area-value { display: block; font-size: 15px; font-weight: 700; }
    .area-caption { display: block; font-size: 9px; opacity: 0.85; }
    .thumb-row { display: flex; gap: 8px; margin-top: 8px; }
    .thumb { flex: 1; height: 58px; overflow: hidden; background: #e5e7eb; }
    .thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .table-col { flex: 0.82; min-width: 0; overflow: hidden; border: 1px solid #202020; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .overview-title {
      background: #578e31;
      color: #fff; font-family: Impact, "Arial Narrow", sans-serif; font-weight: 400; letter-spacing: 0.02em; font-size: 24px;
      padding: 12px 16px; text-align: center; border-bottom: 1px solid #202020;
    }
    td { height: 36px; padding: 7px 13px; border-bottom: 1px solid #202020; }
    tr:last-child td { border-bottom: 0; }
    .row-label { background: #578e31; font-family: Impact, "Arial Narrow", sans-serif; font-size: 17px; font-weight: 400; letter-spacing: 0.015em; color: #fff; width: 40%; border-right: 1px solid #202020; }
    .row-value { background: #9bd34d; color: #1a1a1a; word-break: break-word; }
  </style>
</head>
<body>
  <div class="brand-row">
    <span class="brand-name">2Bi<span class="accent">g</span>ha</span>
  </div>
  <div class="brand-tagline">Har Pata Humein Pata Hai</div>
  <div class="category">${esc(input.title)}</div>
  <div class="layout">
    <div class="media-col">
      <div class="hero-wrap">
        ${heroImg}
        ${badge}
      </div>
      ${thumbs ? `<div class="thumb-row">${thumbs}</div>` : ''}
    </div>
    <div class="table-col">
      <div class="overview-title">Property Overview</div>
      <table>${tableRows}</table>
    </div>
  </div>
</body>
</html>`;
}

@Injectable()
export class PropertyShareService {
  constructor(private readonly storageService: StorageService) {}

  async pdfBuffer(input: PropertyShareInput): Promise<{ buffer: Buffer; filename: string }> {
    const html = buildPropertyShareHtml(input);
    const filename = `${fileSlug(input.title)}.pdf`;
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    const browser = await puppeteer.launch({
      headless: true,
      ...(execPath ? { executablePath: execPath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
      const buf = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
      return { buffer: Buffer.from(buf), filename };
    } finally {
      await browser.close();
    }
  }

  async generateAndUpload(input: PropertyShareInput): Promise<{ url: string; filename: string }> {
    const { buffer, filename } = await this.pdfBuffer(input);
    const uploaded = await this.storageService.uploadDocumentBuffer(
      buffer,
      filename,
      'application/pdf',
    );
    return { url: uploaded.url, filename: uploaded.originalName || filename };
  }
}

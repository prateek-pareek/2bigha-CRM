import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  extractEmailsFromText,
  mergeExtractedEmails,
  type ExtractedEmail,
} from './utils/email-extract.util';

export type WebsiteEmailHit = ExtractedEmail & {
  pageUrl: string;
};

export type WebsiteEmailExtractorResult = {
  url: string;
  title: string | null;
  emails: WebsiteEmailHit[];
  pagesScanned: string[];
  error?: string;
};

const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGES = 6;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CONTACT_PATH_RE =
  /\/(contact|contact-us|about|about-us|team|support|get-in-touch|reach-us)(?:\/|$|\?|#)/i;

@Injectable()
export class WebsiteEmailExtractorService {
  private readonly logger = new Logger(WebsiteEmailExtractorService.name);

  async extractFromWebsite(
    rawInput: string,
    options: { crawlContactPages?: boolean } = {},
  ): Promise<WebsiteEmailExtractorResult> {
    const url = this.normalizeUrl(rawInput);
    this.assertSafeUrl(url);

    const pagesToScan = [url];
    const scanned = new Set<string>();
    const allHits: WebsiteEmailHit[] = [];
    let title: string | null = null;

    if (options.crawlContactPages) {
      try {
        const extra = await this.discoverContactPages(url);
        for (const page of extra) {
          if (!pagesToScan.includes(page)) pagesToScan.push(page);
        }
      } catch (err) {
        this.logger.debug(
          `Contact page discovery failed for ${url}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    for (const pageUrl of pagesToScan.slice(0, MAX_PAGES)) {
      if (scanned.has(pageUrl)) continue;
      scanned.add(pageUrl);

      try {
        const html = await this.fetchHtml(pageUrl);
        const $ = cheerio.load(html);
        if (!title && pageUrl === url) {
          title =
            $('meta[property="og:title"]').attr('content')?.trim() ||
            $('title').text().trim() ||
            null;
        }

        const hits = this.extractFromHtml($, html).map((hit) => ({
          ...hit,
          pageUrl,
        }));
        allHits.push(...hits);
      } catch (err) {
        if (pageUrl === url) {
          throw new BadRequestException(
            `Could not fetch ${pageUrl}: ${err instanceof Error ? err.message : 'request failed'}`,
          );
        }
        this.logger.debug(
          `Skipped ${pageUrl}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const deduped = mergeExtractedEmails([allHits]).map((hit) => {
      const match = allHits.find((h) => h.email === hit.email);
      return match ?? { ...hit, pageUrl: url };
    });

    return {
      url,
      title,
      emails: deduped,
      pagesScanned: [...scanned],
    };
  }

  private normalizeUrl(raw: string): string {
    const trimmed = String(raw || '').trim();
    if (!trimmed) {
      throw new BadRequestException('URL is required');
    }
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    let parsed: URL;
    try {
      parsed = new URL(withProtocol);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only http and https URLs are allowed');
    }
    return parsed.toString();
  }

  private assertSafeUrl(url: string): void {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '0.0.0.0'
    ) {
      throw new BadRequestException('Local URLs are not allowed');
    }

    if (
      host === 'metadata.google.internal' ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      throw new BadRequestException('Internal URLs are not allowed');
    }

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);
      const [a, b] = octets;
      const isPrivate =
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254);
      if (isPrivate) {
        throw new BadRequestException('Private network URLs are not allowed');
      }
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const { data } = await axios.get<string>(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 400,
    });
    return String(data || '');
  }

  private async discoverContactPages(startUrl: string): Promise<string[]> {
    const html = await this.fetchHtml(startUrl);
    const $ = cheerio.load(html);
    const origin = new URL(startUrl).origin;
    const found: string[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_, el) => {
      const href = String($(el).attr('href') || '').trim();
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      let absolute: string;
      try {
        absolute = new URL(href, startUrl).toString();
      } catch {
        return;
      }

      const parsed = new URL(absolute);
      if (parsed.origin !== origin) return;
      if (!CONTACT_PATH_RE.test(parsed.pathname)) return;

      const key = parsed.origin + parsed.pathname;
      if (seen.has(key)) return;
      seen.add(key);
      found.push(absolute);
    });

    return found.slice(0, MAX_PAGES - 1);
  }

  private extractFromHtml(
    $: ReturnType<typeof cheerio.load>,
    html: string,
  ): ExtractedEmail[] {
    const batches: ExtractedEmail[][] = [];

    $('a[href^="mailto:"]').each((_, el) => {
      const href = String($(el).attr('href') || '');
      const email = href.replace(/^mailto:/i, '').split('?')[0];
      const hits = extractEmailsFromText(email, 'mailto');
      if (hits.length) batches.push(hits);
    });

    $('[href*="@"], [data-email], [data-mail]').each((_, el) => {
      const attrs = ['href', 'data-email', 'data-mail', 'title', 'aria-label'];
      for (const attr of attrs) {
        const value = String($(el).attr(attr) || '');
        if (!value.includes('@')) continue;
        const hits = extractEmailsFromText(value, 'attribute');
        if (hits.length) batches.push(hits);
      }
    });

    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).text();
      if (!raw.includes('@')) return;
      try {
        const json = JSON.parse(raw) as unknown;
        const text = JSON.stringify(json);
        const hits = extractEmailsFromText(text, 'json-ld');
        if (hits.length) batches.push(hits);
      } catch {
        const hits = extractEmailsFromText(raw, 'json-ld');
        if (hits.length) batches.push(hits);
      }
    });

    const bodyText = $('body').text();
    if (bodyText) {
      batches.push(extractEmailsFromText(bodyText, 'text'));
    } else {
      batches.push(extractEmailsFromText(html, 'text'));
    }

    return mergeExtractedEmails(batches);
  }
}

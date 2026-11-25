import {
  CRM_LEAD_SOURCES,
  applyLeadSourceNormalization,
  normalizeLeadSource,
} from './lead-source.util';
import { normalizeLeadImportRow } from './lead-import-normalize.util';

describe('normalizeLeadSource', () => {
  it('keeps every standard source as-is (any casing / spacing)', () => {
    for (const s of CRM_LEAD_SOURCES) {
      expect(normalizeLeadSource(s)).toMatchObject({ source: s, known: true });
      expect(normalizeLeadSource(`  ${s.toUpperCase()} `).source).toBe(s);
    }
  });

  it('maps common aliases', () => {
    expect(normalizeLeadSource('facebook').source).toBe('Meta Ads');
    expect(normalizeLeadSource('Instagram').source).toBe('Meta Ads');
    expect(normalizeLeadSource('META_ADS').source).toBe('Meta Ads');
    expect(normalizeLeadSource('walk-in').source).toBe('Walk In');
    expect(normalizeLeadSource('WalkIn').source).toBe('Walk In');
    expect(normalizeLeadSource('google ads').source).toBe('Google Lead');
    expect(normalizeLeadSource('whats app').source).toBe('WhatsApp');
    expect(normalizeLeadSource('IVR').source).toBe('Direct Call');
  });

  it('splits legacy integration labels into source + detail', () => {
    expect(normalizeLeadSource('Meta Lead Ads — Jaipur plots')).toEqual({
      source: 'Meta Ads',
      detail: 'Jaipur plots',
      known: true,
    });
    expect(normalizeLeadSource('Form — Contact us')).toEqual({
      source: 'CRM Form',
      detail: 'Contact us',
      known: true,
    });
  });

  it('never drops an unknown label', () => {
    expect(normalizeLeadSource('99acres')).toEqual({
      source: '99acres',
      known: false,
    });
    expect(normalizeLeadSource('   ')).toEqual({
      source: undefined,
      known: false,
    });
  });
});

describe('applyLeadSourceNormalization', () => {
  it('fills sourceDetail only when empty', () => {
    const a: any = { source: 'Meta Lead Ads — Form A' };
    applyLeadSourceNormalization(a);
    expect(a).toEqual({ source: 'Meta Ads', sourceDetail: 'Form A' });

    const b: any = { source: 'Meta Lead Ads — Form A', sourceDetail: 'Kept' };
    applyLeadSourceNormalization(b);
    expect(b).toEqual({ source: 'Meta Ads', sourceDetail: 'Kept' });
  });

  it('leaves payloads without a source untouched', () => {
    const d: any = { firstName: 'X' };
    applyLeadSourceNormalization(d);
    expect(d).toEqual({ firstName: 'X' });
  });

  it('runs on Excel import rows', () => {
    const row: any = { firstName: 'R', source: 'FACEBOOK' };
    normalizeLeadImportRow(row);
    expect(row.source).toBe('Meta Ads');
  });
});

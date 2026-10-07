import {
  isBlankImportValue,
  normalizeImportCallStatus,
  normalizeImportLeadVertical,
  normalizeImportRole,
  normalizeLeadImportRow,
  resolveImportStageName,
} from './lead-import-normalize.util';

describe('lead-import-normalize', () => {
  describe('isBlankImportValue', () => {
    it.each([undefined, null, '', '   ', '\t'])('treats %p as blank', (v) => {
      expect(isBlankImportValue(v)).toBe(true);
    });
    it.each([0, false, 'x', ' a '])('treats %p as present', (v) => {
      expect(isBlankImportValue(v)).toBe(false);
    });
  });

  describe('normalizeImportCallStatus', () => {
    it.each([
      ['Not Called', 'Not Called'],
      ['not called', 'Not Called'],
      ['NOT_CALLED', 'Not Called'],
      ['  Completed ', 'Completed'],
      ['connected', 'Completed'],
      ['MISSED', 'Missed'],
      ['busy', 'Busy'],
      ['Switched Off', 'Failed'],
      ['No Answer', 'Not Answered'],
      ['not-answered', 'Not Answered'],
      ['RNR', 'Not Answered'],
    ])('%p -> %p', (raw, want) => {
      expect(normalizeImportCallStatus(raw)).toBe(want);
    });
    it.each(['', '  ', 'maybe', 'Called back later'])('%p -> null', (raw) => {
      expect(normalizeImportCallStatus(raw)).toBeNull();
    });
  });

  describe('normalizeImportLeadVertical', () => {
    it.each([
      ['Property Listing', 'property_listing'],
      ['property_listing', 'property_listing'],
      ['PROPERTY-LISTING', 'property_listing'],
      ['PL', 'property_listing'],
      ['Property Management', 'property_management'],
      ['pm', 'property_management'],
    ])('%p -> %p', (raw, want) => {
      expect(normalizeImportLeadVertical(raw)).toBe(want);
    });
    it.each(['', 'Rental', 'xyz'])('%p -> null', (raw) => {
      expect(normalizeImportLeadVertical(raw)).toBeNull();
    });
  });

  describe('normalizeImportRole', () => {
    it.each([
      ['owner', 'OWNER'],
      ['Property Owner', 'OWNER'],
      ['SELLER', 'OWNER'],
      ['Real Estate Agent', 'AGENT'],
      ['builder', 'AGENT'],
      ['2 Bigha User', 'USER'],
      ['buyer', 'USER'],
      ['Tenant', 'USER'],
    ])('%p -> %p', (raw, want) => {
      expect(normalizeImportRole(raw)).toBe(want);
    });
    it('returns null for unknown roles', () => {
      expect(normalizeImportRole('astronaut')).toBeNull();
    });
  });

  describe('normalizeLeadImportRow', () => {
    it('drops blank enum cells so schema defaults apply (the reported bug)', () => {
      const row: Record<string, any> = {
        firstName: 'A',
        callStatus: '',
        leadVertical: '',
        role: '  ',
      };
      const res = normalizeLeadImportRow(row);
      expect(row).toEqual({ firstName: 'A' });
      expect(res.invalidRole).toBe(false);
    });

    it('applies the default vertical only when the cell is blank', () => {
      const blank: Record<string, any> = { leadVertical: '' };
      normalizeLeadImportRow(blank, { defaultLeadVertical: 'property_management' });
      expect(blank.leadVertical).toBe('property_management');

      const explicit: Record<string, any> = { leadVertical: 'Property Listing' };
      normalizeLeadImportRow(explicit, { defaultLeadVertical: 'property_management' });
      expect(explicit.leadVertical).toBe('property_listing');
    });

    it('canonicalises template values', () => {
      const row: Record<string, any> = {
        callStatus: 'not called',
        leadVertical: 'Property Management',
        role: 'Seller',
      };
      normalizeLeadImportRow(row);
      expect(row).toEqual({
        callStatus: 'Not Called',
        leadVertical: 'property_management',
        role: 'OWNER',
      });
    });

    it('throws a readable error for an unknown call status', () => {
      expect(() => normalizeLeadImportRow({ callStatus: 'Maybe' })).toThrow(
        /Call Status "Maybe" is not recognised/,
      );
    });

    it('throws a readable error for an unknown vertical', () => {
      expect(() => normalizeLeadImportRow({ leadVertical: 'Rental' })).toThrow(
        /Lead Vertical "Rental" is not recognised/,
      );
    });

    it('falls back to USER and flags unknown roles', () => {
      const row: Record<string, any> = { role: 'Astronaut' };
      expect(normalizeLeadImportRow(row).invalidRole).toBe(true);
      expect(row.role).toBe('USER');
    });

    it('keeps numeric cells (e.g. phone numbers parsed as numbers)', () => {
      const row: Record<string, any> = { mobileNo: 9876543210, pincode: 0 };
      normalizeLeadImportRow(row);
      expect(row).toEqual({ mobileNo: 9876543210, pincode: 0 });
    });
  });

  describe('resolveImportStageName', () => {
    const stages = [
      { name: 'Qualified', order: 2 },
      { name: 'New', order: 1 },
      { name: 'Won', order: 3 },
    ];
    it('uses the matching stage case-insensitively', () => {
      expect(resolveImportStageName(stages, ' qualified ')).toBe('Qualified');
    });
    it('falls back to the first stage by order', () => {
      expect(resolveImportStageName(stages, 'Nope')).toBe('New');
      expect(resolveImportStageName(stages, '')).toBe('New');
      expect(resolveImportStageName(stages, undefined)).toBe('New');
    });
    it('returns undefined when the pipeline has no stages', () => {
      expect(resolveImportStageName([], 'New')).toBeUndefined();
      expect(resolveImportStageName(undefined, 'New')).toBeUndefined();
    });
  });
});

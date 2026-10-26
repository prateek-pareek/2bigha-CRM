import { ClientDuplicateIndex, clientNameKey } from './crm-client-duplicate.util';

describe('crm-client-duplicate.util', () => {
  it('normalizes names and strips role suffixes', () => {
    expect(clientNameKey('Vipin Choudhary (owner)')).toBe('vipin choudhary');
    expect(clientNameKey('  vipin   CHOUDHARY ')).toBe('vipin choudhary');
    expect(clientNameKey('Vipin Choudhary - Owner')).toBe('vipin choudhary');
    expect(clientNameKey('Vipin Choudhary [Agent]')).toBe('vipin choudhary');
  });

  it('groups name / email / phone duplicates transitively', () => {
    const index = new ClientDuplicateIndex([
      { _id: 'a', name: 'Vipin Choudhary', phone: '+91 98765 43210' },
      { _id: 'b', name: 'Vipin Choudhary', email: 'vipin@example.com' },
      { _id: 'c', name: 'vipin choudhary' },
      { _id: 'd', name: 'Vipin Choudhary (owner)' },
      { _id: 'e', name: 'V. C.', phone: '9876543210' },
      { _id: 'f', name: 'Someone Else', email: 'other@example.com' },
    ]);
    expect(index.duplicateGroupCount).toBe(1);
    expect(index.duplicateRecordCount).toBe(5);
    expect(index.infoFor('f')).toBeNull();

    const d = index.infoFor('d')!;
    expect(d.groupSize).toBe(5);
    expect(d.matches.map((m) => m._id).sort()).toEqual(['a', 'b', 'c']);

    const e = index.infoFor('e')!;
    expect(e.reasons).toEqual(['phone']);
    expect(e.matches.map((m) => m._id)).toEqual(['a']);
  });

  it('matches unsaved payloads on email case-insensitively', () => {
    const index = new ClientDuplicateIndex([
      { _id: 'b', name: 'Vipin Choudhary', email: 'Vipin@Example.com' },
    ]);
    const hits = index.findMatches({ name: 'New Person', email: 'vipin@example.com' }, '');
    expect(hits).toHaveLength(1);
    expect(hits[0].reasons).toEqual(['email']);
    expect(index.findMatches({ name: 'Unrelated', phone: '12' }, '')).toHaveLength(0);
  });
});

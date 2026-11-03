import { ContactDuplicateIndex } from './crm-contact-duplicate.util';

const c = (id: string, o: Record<string, unknown> = {}) => ({
  _id: id,
  firstName: 'Rahul',
  lastName: 'Sharma',
  createdAt: new Date(2026, 0, Number(id.replace(/\D/g, '')) || 1),
  ...o,
});

describe('ContactDuplicateIndex', () => {
  it('groups contacts sharing an email, case-insensitively and via additional emails', () => {
    const idx = new ContactDuplicateIndex([
      c('1', { firstName: 'A', lastName: 'One', email: 'X@Mail.com' }),
      c('2', { firstName: 'B', lastName: 'Two', email: 'y@mail.com', additionalEmails: ['x@mail.com'] }),
      c('3', { firstName: 'C', lastName: 'Three', email: 'z@mail.com' }),
    ]);
    const groups = idx.groups();
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m._id).sort()).toEqual(['1', '2']);
    expect(groups[0].reasons).toEqual(['email']);
    expect(groups[0].nameOnly).toBe(false);
  });

  it('matches phones across formats using phone and mobileNo', () => {
    const idx = new ContactDuplicateIndex([
      c('1', { firstName: 'A', lastName: 'One', phone: '+91 98765 43210' }),
      c('2', { firstName: 'B', lastName: 'Two', mobileNo: '9876543210' }),
    ]);
    expect(idx.groups()[0].reasons).toEqual(['phone']);
  });

  it('merges same-name contacts when contact info does not contradict', () => {
    const idx = new ContactDuplicateIndex([
      c('1', { email: 'rahul@x.com' }),
      c('2', { firstName: 'rahul ', lastName: 'SHARMA' }),
    ]);
    const [g] = idx.groups();
    expect(g.members).toHaveLength(2);
    expect(g.nameOnly).toBe(true);
    expect(g.reasons).toEqual(['name']);
    expect(g.masterId).toBe('1'); // the one with an email is richer
  });

  it('keeps same-name contacts apart when both have different emails or phones', () => {
    expect(
      new ContactDuplicateIndex([
        c('1', { email: 'a@x.com' }),
        c('2', { email: 'b@x.com' }),
      ]).groups(),
    ).toHaveLength(0);
    expect(
      new ContactDuplicateIndex([
        c('1', { phone: '9876543210' }),
        c('2', { phone: '9123456780' }),
      ]).groups(),
    ).toHaveLength(0);
  });

  it('never chains two contradicting contacts through a contact-less same-name record', () => {
    const idx = new ContactDuplicateIndex([
      c('1', { email: 'a@x.com' }),
      c('2', { email: 'b@x.com' }),
      c('3'),
    ]);
    const groups = idx.groups();
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it('does not name-match contacts from different companies without shared contact info', () => {
    const idx = new ContactDuplicateIndex([
      c('1', { organization: 'Acme' }),
      c('2', { organization: 'Globex' }),
    ]);
    expect(idx.groups()).toHaveLength(0);
  });

  it('ignores single-word names', () => {
    const idx = new ContactDuplicateIndex([
      c('1', { lastName: '' }),
      c('2', { lastName: '' }),
    ]);
    expect(idx.groups()).toHaveLength(0);
  });

  it('findMatches checks an unsaved payload and honours excludeId', () => {
    const idx = new ContactDuplicateIndex([c('1', { email: 'a@x.com', phone: '9876543210' })]);
    const hit = idx.findMatches({ firstName: 'Rahul', lastName: 'Sharma', email: 'A@x.com' });
    expect(hit).toHaveLength(1);
    expect(hit[0].reasons).toEqual(['email', 'name']);
    expect(idx.findMatches({ firstName: 'Rahul', lastName: 'Sharma', email: 'other@x.com' })).toHaveLength(0);
    expect(idx.findMatches({ email: 'a@x.com' }, '1')).toHaveLength(0);
  });

  it('infoById exposes cluster size for highlighted rows', () => {
    const idx = new ContactDuplicateIndex([
      c('1', { email: 'a@x.com' }),
      c('2', { email: 'a@x.com' }),
      c('3', { email: 'a@x.com' }),
    ]);
    expect(idx.infoById()['2']).toMatchObject({ groupSize: 3 });
    expect(idx.duplicateRecordCount).toBe(3);
    expect(idx.duplicateGroupCount).toBe(1);
  });
});

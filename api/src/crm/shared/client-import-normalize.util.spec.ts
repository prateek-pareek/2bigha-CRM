import { validateClientImportMapped } from './client-import-normalize.util';

describe('validateClientImportMapped', () => {
  const ok = {
    name: 'Amit Kumar',
    phone: '9876543210',
    email: 'amit@example.com',
  };

  it('accepts a normal client and formats the phone', () => {
    const verdict = validateClientImportMapped(ok);
    expect(verdict.errors).toEqual([]);
    expect(verdict.normalized.name).toBe('Amit Kumar');
    expect(verdict.normalized.phone).toBe('+919876543210');
    expect(verdict.normalized.email).toBe('amit@example.com');
  });

  it.each([
    ['+91 98765 43210', '+919876543210'],
    ['0919876543210', '+919876543210'],
    ['00919876543210', '+919876543210'],
    ['9876543210.0', '+919876543210'],
    [9876543210, '+919876543210'],
    ["'9876543210", '+919876543210'],
  ])('normalizes phone %p', (phone, want) => {
    const verdict = validateClientImportMapped({ ...ok, phone });
    expect(verdict.errors).toEqual([]);
    expect(verdict.normalized.phone).toBe(want);
  });

  it('requires a name', () => {
    expect(validateClientImportMapped({ ...ok, name: '   ' }).errors).toContain('Name is required');
  });

  it.each(['Unknown', 'N/A', 'null', '-', 'client name', 'xxx'])(
    'rejects placeholder name %p',
    (name) => {
      expect(validateClientImportMapped({ ...ok, name }).errors).toContain(
        'Name is missing or not a real name',
      );
    },
  );

  it('rejects a name that is an email or a phone', () => {
    expect(validateClientImportMapped({ ...ok, name: 'amit@example.com' }).errors[0]).toMatch(/email/i);
    expect(validateClientImportMapped({ ...ok, name: '9876543210' }).errors[0]).toMatch(/phone number/i);
  });

  it('rejects a one-letter name', () => {
    expect(validateClientImportMapped({ ...ok, name: 'A' }).errors).toContain('Name is too short');
  });

  it('requires a phone even when email is present', () => {
    expect(validateClientImportMapped({ name: 'Amit Kumar', email: 'a@b.com', phone: '' }).errors).toContain(
      'Phone number is required',
    );
  });

  it('rejects a short phone, a landline, scientific notation, and two numbers', () => {
    expect(validateClientImportMapped({ ...ok, phone: '98765' }).errors).toContain(
      'Phone number must be 10 digits',
    );
    expect(validateClientImportMapped({ ...ok, phone: '1234567890' }).errors).toContain(
      'Phone number must start with 6, 7, 8, or 9',
    );
    expect(validateClientImportMapped({ ...ok, phone: '9.87654e+9' }).errors[0]).toMatch(/corrupted/i);
    expect(
      validateClientImportMapped({ ...ok, phone: '9876543210 / 9123456789' }).errors[0],
    ).toMatch(/more than one number/i);
  });

  it('rejects a date stored in the phone cell', () => {
    expect(validateClientImportMapped({ ...ok, phone: new Date('2020-01-01') }).errors).toContain(
      'Phone number is not a phone number',
    );
  });

  it('rejects a bad email and more than one email in the email cell', () => {
    expect(validateClientImportMapped({ ...ok, email: 'not-an-email' }).errors).toContain(
      'Invalid email format',
    );
    expect(
      validateClientImportMapped({ ...ok, email: 'a@b.com; c@d.com' }).errors[0],
    ).toMatch(/more than one address/i);
  });

  it('splits additional emails and flags a bad one', () => {
    const good = validateClientImportMapped({
      ...ok,
      additionalEmails: 'alt@example.com; amit@example.com, second@example.com',
    });
    expect(good.errors).toEqual([]);
    expect(good.normalized.additionalEmails).toEqual(['alt@example.com', 'second@example.com']);

    const bad = validateClientImportMapped({ ...ok, additionalEmails: 'ok@example.com, nope' });
    expect(bad.errors).toContain('Invalid additional email "nope"');
  });

  it('checks WhatsApp only when the cell is filled', () => {
    expect(validateClientImportMapped({ ...ok, whatsappNumber: '' }).errors).toEqual([]);
    expect(validateClientImportMapped({ ...ok, whatsappNumber: '12345' }).errors).toContain(
      'WhatsApp number must be 10 digits',
    );
    const same = validateClientImportMapped({ ...ok, whatsappNumber: '+919876543210' });
    expect(same.errors).toEqual([]);
    expect(same.normalized.whatsappNumber).toBe('+919876543210');
  });

  it('maps known roles and statuses, and rejects unknown ones', () => {
    const mapped = validateClientImportMapped({
      ...ok,
      role: 'Real Estate Agent',
      status: 'Enabled',
    });
    expect(mapped.errors).toEqual([]);
    expect(mapped.normalized.role).toBe('AGENT');
    expect(mapped.normalized.status).toBe('active');

    const bad = validateClientImportMapped({ ...ok, role: 'ADMIN', status: 'archived' });
    expect(bad.errors.some((e) => e.startsWith('Invalid role'))).toBe(true);
    expect(bad.errors.some((e) => e.startsWith('Invalid status'))).toBe(true);
  });

  it('rejects an address that is far too long', () => {
    expect(validateClientImportMapped({ ...ok, address: 'x'.repeat(501) }).errors).toContain(
      'Address is too long',
    );
  });
});

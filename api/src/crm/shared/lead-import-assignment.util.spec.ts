import {
  createRoundRobin,
  LeadImportAssignmentError,
  LEAD_IMPORT_MAX_ASSIGNEES,
  parseLeadImportAssignment,
} from './lead-import-assignment.util';

describe('parseLeadImportAssignment', () => {
  it.each([undefined, null, '', '  '])('returns undefined (legacy behaviour) for %p', (v) => {
    expect(parseLeadImportAssignment(v)).toBeUndefined();
  });

  it('defaults to self and drops assignees', () => {
    expect(parseLeadImportAssignment('{"assignees":["a"]}')).toEqual({
      mode: 'self',
      assignees: [],
      reassignExisting: false,
      fallbackToSelf: false,
    });
  });

  it('single needs exactly one assignee', () => {
    expect(() => parseLeadImportAssignment({ mode: 'single', assignees: [] })).toThrow(
      LeadImportAssignmentError,
    );
    expect(() => parseLeadImportAssignment({ mode: 'single', assignees: ['a', 'b'] })).toThrow(
      LeadImportAssignmentError,
    );
    expect(parseLeadImportAssignment({ mode: 'single', assignees: [' a '] })?.assignees).toEqual(['a']);
  });

  it('round_robin needs two distinct assignees (case-insensitive dedupe)', () => {
    expect(() =>
      parseLeadImportAssignment({ mode: 'round_robin', assignees: ['A@x.com', 'a@x.com'] }),
    ).toThrow('at least two');
    expect(
      parseLeadImportAssignment({ mode: 'round_robin', assignees: ['a', 'b', '', null] })?.assignees,
    ).toEqual(['a', 'b']);
  });

  it('file mode ignores assignees and keeps flags', () => {
    expect(
      parseLeadImportAssignment({
        mode: 'file',
        assignees: ['a'],
        reassignExisting: true,
        fallbackToSelf: true,
      }),
    ).toEqual({ mode: 'file', assignees: [], reassignExisting: true, fallbackToSelf: true });
  });

  it('rejects bad JSON, unknown modes and too many assignees', () => {
    expect(() => parseLeadImportAssignment('{nope')).toThrow('Invalid assignment');
    expect(() => parseLeadImportAssignment('"x"')).toThrow('Invalid assignment');
    expect(() => parseLeadImportAssignment({ mode: 'everyone' })).toThrow('Unknown assignment mode');
    const many = Array.from({ length: LEAD_IMPORT_MAX_ASSIGNEES + 1 }, (_, i) => `u${i}`);
    expect(() => parseLeadImportAssignment({ mode: 'round_robin', assignees: many })).toThrow('at most');
  });
});

describe('createRoundRobin', () => {
  it('cycles in order', () => {
    const next = createRoundRobin(['a', 'b', 'c']);
    expect([1, 2, 3, 4, 5].map(() => next())).toEqual(['a', 'b', 'c', 'a', 'b']);
  });
  it('throws on empty input', () => {
    expect(() => createRoundRobin([])).toThrow();
  });
});

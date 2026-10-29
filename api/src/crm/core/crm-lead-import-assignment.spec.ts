/**
 * Lead bulk import: owner assignment + duplicate edge cases, exercised through the real
 * `CRMService.startImportFromExcel` / `importFromExcel` / `previewLeadImport` with the
 * persistence layer stubbed. The team-scope rules run through the real
 * `CrmAssignmentPolicyService` (only its user lookups are stubbed).
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

// ts-jest uses isolatedModules, so union-typed @Prop fields crash schema registration on import.
jest.mock('@nestjs/mongoose', () => {
  const actual = jest.requireActual('@nestjs/mongoose');
  const { Schema } = jest.requireActual('mongoose');
  return {
    ...actual,
    Prop: () => () => undefined,
    SchemaFactory: { createForClass: () => new Schema({}) },
  };
});

import { CRMService } from './crm.service';
import { CrmAssignmentPolicyService } from '../shared/crm-assignment-policy.service';

const oid = () => new Types.ObjectId();

// Team: Tina (lead) manages Tom and Tara. Outsider Olga is on another team.
const PEOPLE: Record<string, { id: Types.ObjectId; label: string; email: string }> = {
  tina: { id: oid(), label: 'Tina Lead', email: 'tina@x.com' },
  tom: { id: oid(), label: 'Tom Member', email: 'tom@x.com' },
  tara: { id: oid(), label: 'Tara Member', email: 'tara@x.com' },
  olga: { id: oid(), label: 'Olga Outsider', email: 'olga@x.com' },
};
const byRef = (ref: string) =>
  Object.values(PEOPLE).find(
    (p) => String(p.id) === ref || p.email === ref.toLowerCase() || p.label.toLowerCase() === ref.toLowerCase(),
  );

const teamLead = {
  userId: String(PEOPLE.tina.id),
  firstName: 'Tina',
  lastName: 'Lead',
  email: 'tina@x.com',
  crmPermissions: ['leads:import', 'leads:assign', 'leads:read:team'],
};
const agent = {
  userId: String(oid()),
  firstName: 'Ann',
  lastName: 'Agent',
  email: 'ann@x.com',
  crmPermissions: ['leads:import'],
};
const admin = { ...teamLead, crmPermissions: ['leads:import', 'leads:assign', 'leads:read:all'] };

const csv = (rows: string[][], header = ['First', 'Phone', 'Owner']) =>
  Buffer.from([header, ...rows].map((r) => r.join(',')).join('\n'));
const MAPPING = { firstName: 'First', mobileNo: 'Phone', leadOwner: 'Owner' };

function makeService(existing: Record<string, any> = {}, visibleIds: Set<string> | 'all' = 'all') {
  const svc: any = Object.create(CRMService.prototype);
  const created: any[] = [];
  const updates: any[] = [];

  const policy = new CrmAssignmentPolicyService({} as any, {} as any);
  jest.spyOn(policy, 'resolveAssignee').mockImplementation(async (ref: string) => {
    const p = byRef(ref);
    return p ? { hrmsId: p.id, label: p.label, email: p.email } : null;
  });
  jest.spyOn(policy, 'teamOf').mockResolvedValue({
    ids: [String(PEOPLE.tina.id), String(PEOPLE.tom.id), String(PEOPLE.tara.id)],
    labels: [],
  });

  svc.importJobs = new Map();
  svc.assignmentPolicy = policy;
  svc.leadModel = {
    create: jest.fn(async (d: any) => {
      const doc = { _id: oid(), ...d, toObject() { return this; } };
      created.push(doc);
      return doc;
    }),
    exists: jest.fn(async (f: any) => {
      if (visibleIds === 'all') return { _id: 1 };
      const id = String(f.$and[0]._id);
      return visibleIds.has(id) ? { _id: 1 } : null;
    }),
    updateOne: jest.fn(async (...a: any[]) => {
      updates.push(a);
      return {};
    }),
    findById: jest.fn(() => ({ lean: () => ({ exec: async () => ({}) }) })),
  };
  svc.pipelinesService = {
    findAll: jest.fn(async () => [{ _id: oid(), isDefault: true, stages: [{ name: 'New', order: 0 }] }]),
    findOne: jest.fn(),
  };
  svc.crmNotify = { notify: jest.fn(async () => undefined) };
  svc.roleAuditLog = { log: jest.fn(async () => undefined) };
  svc.bustCrmCache = jest.fn(async () => undefined);
  svc.resolveImportOrganizationId = jest.fn(async () => null);
  svc.resolveImportClientId = jest.fn(async () => null);
  svc.assertPersonContactIdentifiersValid = jest.fn(async () => undefined);
  svc.nextRecordId = jest.fn(async () => 'L-1');
  svc.syncContactFromLeadSafe = jest.fn(async () => undefined);
  // The import normalises phones (+91…), so match the stub on the last 10 digits.
  svc.findExistingLeadForImport = jest.fn(
    async (m: any) => existing[String(m.mobileNo ?? '').replace(/\D/g, '').slice(-10)] ?? null,
  );
  return { svc: svc as CRMService & Record<string, any>, created, updates };
}

async function runImport(svc: any, buf: Buffer, user: any, opts: any = {}, strategy = 'skip') {
  const { jobId } = await svc.startImportFromExcel('leads', buf, MAPPING, user, strategy, opts);
  // startImport fires the job without awaiting; wait for it to finish.
  for (let i = 0; i < 200 && svc.importJobs.get(jobId).status === 'processing'; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  return svc.getImportJobStatus(jobId);
}

const PH = (n: number) => `98765${String(n).padStart(5, '0')}`;

describe('lead import — ownership', () => {
  it('team lead can assign every row to one team member', async () => {
    const { svc, created } = makeService();
    const job = await runImport(svc, csv([['A', PH(1), ''], ['B', PH(2), '']]), teamLead, {
      assignment: { mode: 'single', assignees: ['tom@x.com'], reassignExisting: false, fallbackToSelf: false },
    });
    expect(job.status).toBe('completed');
    expect(created.map((c) => c.leadOwner)).toEqual(['Tom Member', 'Tom Member']);
    expect(created.every((c) => c.importBatchId === job.jobId)).toBe(true);
    expect(job.assignedCounts).toEqual({ 'Tom Member': 2 });
  });

  it('team lead cannot assign to someone outside the team — rejected before any row is written', async () => {
    const { svc, created } = makeService();
    await expect(
      svc.startImportFromExcel('leads', csv([['A', PH(1), '']]), MAPPING, teamLead, 'skip', {
        assignment: { mode: 'single', assignees: ['olga@x.com'], reassignExisting: false, fallbackToSelf: false },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(created).toHaveLength(0);
  });

  it('round robin splits evenly across the team and rejects any outsider in the list', async () => {
    const { svc, created } = makeService();
    const rr = (assignees: string[]) => ({ mode: 'round_robin' as const, assignees, reassignExisting: false, fallbackToSelf: false });
    const rows = [1, 2, 3, 4, 5].map((n) => ['L' + n, PH(n), '']);
    const job = await runImport(svc, csv(rows), teamLead, { assignment: rr(['tom@x.com', 'tara@x.com']) });
    expect(created.map((c) => c.leadOwner)).toEqual(['Tom Member', 'Tara Member', 'Tom Member', 'Tara Member', 'Tom Member']);
    expect(job.assignedCounts).toEqual({ 'Tom Member': 3, 'Tara Member': 2 });

    await expect(
      svc.startImportFromExcel('leads', csv(rows), MAPPING, teamLead, 'skip', {
        assignment: rr(['tom@x.com', 'olga@x.com']),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('"use owner column": team members pass, outsiders/blank rows fail with a reason (or fall back to me)', async () => {
    const file = csv([['A', PH(1), 'tom@x.com'], ['B', PH(2), 'Olga Outsider'], ['C', PH(3), '']]);
    const strict = makeService();
    const job = await runImport(strict.svc, file, teamLead, {
      assignment: { mode: 'file', assignees: [], reassignExisting: false, fallbackToSelf: false },
    });
    expect(strict.created.map((c) => c.leadOwner)).toEqual(['Tom Member']);
    expect(job.failedRows.map((r: any) => r.rowNumber)).toEqual([2, 3]);
    expect(job.failedRows[0].reason).toMatch(/not in your team/);
    expect(job.failedRows[1].reason).toMatch(/blank/);

    const lenient = makeService();
    await runImport(lenient.svc, file, teamLead, {
      assignment: { mode: 'file', assignees: [], reassignExisting: false, fallbackToSelf: true },
    });
    expect(lenient.created.map((c) => c.leadOwner)).toEqual(['Tom Member', 'Tina Lead', 'Tina Lead']);
  });

  it('a user without leads:assign cannot use any assignment mode other than "me"', async () => {
    const { svc } = makeService();
    await expect(
      svc.startImportFromExcel('leads', csv([['A', PH(1), '']]), MAPPING, agent, 'skip', {
        assignment: { mode: 'single', assignees: ['tom@x.com'], reassignExisting: false, fallbackToSelf: false },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const me = await runImport(svc, csv([['A', PH(1), 'tom@x.com']]), agent, {
      assignment: { mode: 'self', assignees: [], reassignExisting: false, fallbackToSelf: false },
    });
    expect(me.assignedCounts).toEqual({ 'Ann Agent': 1 });
  });

  it('legacy (no assignment options): agents own their rows, admins may use the file owner', async () => {
    const a = makeService();
    await runImport(a.svc, csv([['A', PH(1), 'tom@x.com']]), agent);
    expect(a.created[0].leadOwner).toBe('Ann Agent');
    const b = makeService();
    await runImport(b.svc, csv([['A', PH(1), 'Some Owner']]), admin);
    expect(b.created[0].leadOwner).toBe('Some Owner');
  });
});

describe('lead import — duplicates', () => {
  const existingLead = { _id: oid(), leadOwner: 'Olga Outsider', customFields: {}, associatedOrganizations: [], toObject() { return this; } };

  it('skip strategy reports skipped rows with a reason', async () => {
    const { svc, created } = makeService({ [PH(1)]: existingLead });
    const job = await runImport(svc, csv([['A', PH(1), ''], ['B', PH(2), '']]), admin, {}, 'skip');
    expect(created).toHaveLength(1);
    expect(job.skippedCount).toBe(1);
    expect(job.skippedRows[0].rowNumber).toBe(1);
  });

  it('merge/replace never overwrite an existing lead\'s owner from the file', async () => {
    for (const strategy of ['merge', 'replace']) {
      const { svc, updates } = makeService({ [PH(1)]: existingLead });
      await runImport(svc, csv([['A', PH(1), 'tom@x.com']]), admin, {}, strategy);
      const set = updates[0][1].$set;
      expect(set).not.toHaveProperty('leadOwner');
    }
  });

  it('a duplicate the importer cannot see is skipped, not merged into', async () => {
    const { svc, updates, created } = makeService({ [PH(1)]: existingLead }, new Set());
    const job = await runImport(svc, csv([['A', PH(1), '']]), agent, {}, 'merge');
    expect(updates).toHaveLength(0);
    expect(created).toHaveLength(0);
    expect(job.skippedRows[0].reason).toMatch(/outside your access/);
  });

  it('reassignExisting moves a visible merged duplicate to the chosen team member (and checks the team)', async () => {
    const { svc, updates } = makeService({ [PH(1)]: existingLead });
    const job = await runImport(svc, csv([['A', PH(1), '']]), teamLead, {
      assignment: { mode: 'single', assignees: ['tara@x.com'], reassignExisting: true, fallbackToSelf: false },
    }, 'merge');
    expect(updates[0][1].$set.leadOwner).toBe('Tara Member');
    expect(job.reassignedCount).toBe(1);
    expect(job.assignedCounts).toEqual({ 'Tara Member': 1 });
  });

  it('create strategy still adds a second lead for a duplicate', async () => {
    const { svc, created } = makeService({ [PH(1)]: existingLead });
    await runImport(svc, csv([['A', PH(1), '']]), admin, {}, 'create');
    expect(created).toHaveLength(1);
  });
});

describe('lead import — file guards and dry-run', () => {
  it('rejects an empty file and one over the row cap', async () => {
    const { svc } = makeService();
    await expect(
      svc.startImportFromExcel('leads', csv([]), MAPPING, admin, 'skip'),
    ).rejects.toBeInstanceOf(BadRequestException);
    const big = csv(Array.from({ length: 10_001 }, (_, i) => ['L' + i, PH(i), '']));
    await expect(svc.startImportFromExcel('leads', big, MAPPING, admin, 'skip')).rejects.toThrow(/at most 10000/);
  });

  it('dry-run classifies rows, flags in-file duplicates and writes nothing', async () => {
    const existing = { _id: oid(), leadOwner: 'Tom Member', customFields: {} };
    const { svc, created } = makeService({ [PH(9)]: existing });
    const out = await svc.previewLeadImport(
      csv([
        ['A', PH(1), 'tom@x.com'],
        ['A again', PH(1), 'tom@x.com'],
        ['B', PH(9), 'tom@x.com'],
        ['C', PH(3), 'olga@x.com'],
        ['D', '', ''],
      ]),
      MAPPING,
      teamLead,
      { duplicateStrategy: 'skip', assignment: { mode: 'file', assignees: [], reassignExisting: false, fallbackToSelf: false } },
    );
    expect(out.summary).toMatchObject({ new: 1, duplicate_skip: 2, owner_error: 1, invalid: 1 });
    expect(out.inFileDuplicates).toBe(1);
    expect(out.plannedByOwner).toEqual({ 'Tom Member': 1 });
    expect(created).toHaveLength(0);
  });
});

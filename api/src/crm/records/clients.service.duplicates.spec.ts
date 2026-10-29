import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

// ts-jest (isolatedModules) emits no design:type for union-typed @Prop fields, which crashes
// schema registration on import. These tests mock every model, so stub @Prop out.
jest.mock('@nestjs/mongoose', () => {
  const actual = jest.requireActual('@nestjs/mongoose');
  const { Schema } = jest.requireActual('mongoose');
  return {
    ...actual,
    Prop: () => () => undefined,
    SchemaFactory: { createForClass: () => new Schema({}) },
  };
});

import { ClientsService } from './clients.service';

const oid = () => new Types.ObjectId();

/** Chainable stand-in for a Mongoose query whose `.exec()` resolves to `value`. */
function q(value: unknown) {
  const o: any = {};
  for (const m of ['select', 'limit', 'lean', 'populate', 'sort', 'skip']) o[m] = () => o;
  o.exec = () => Promise.resolve(value);
  return o;
}

const ADMIN = { permissions: ['admin:manage'], userId: String(oid()) };

function build(opts: { existing?: any; all?: any[]; byIds?: any[]; master?: any; edges?: any[] } = {}) {
  const clientModel: any = {
    findById: jest.fn(() => q(opts.master ?? opts.existing ?? null)),
    find: jest.fn((filter: any) => q(filter?._id?.$in ? opts.byIds ?? [] : opts.all ?? [])),
    findByIdAndUpdate: jest.fn(() => q({ _id: 'x' })),
    updateMany: jest.fn(() => q({})),
    updateOne: jest.fn(() => q({})),
  };
  const activityModel: any = Object.assign(
    jest.fn(() => ({ save: jest.fn() })),
    { updateMany: jest.fn(() => q({})) },
  );
  const associationModel: any = {
    find: jest.fn(() => q(opts.edges ?? [])),
    findOne: jest.fn(() => q(null)),
    deleteOne: jest.fn(() => q({})),
    updateOne: jest.fn(() => q({})),
  };
  const crmService: any = { syncContactFromClientSafe: jest.fn() };
  const svc = new ClientsService(
    clientModel,
    activityModel,
    associationModel,
    crmService,
    { mirrorArrayDiff: jest.fn() } as any,
    {} as any,
  );
  return { svc, clientModel, activityModel, associationModel };
}

describe('ClientsService update duplicate guard', () => {
  const id = String(oid());
  const existing = { name: 'Vipin Choudhary', email: 'vipin@x.com', phone: '9876543210', additionalEmails: [] };
  const other = { _id: oid(), name: 'Asha Rao', email: 'asha@x.com', phone: '9123456780' };
  const all = [{ _id: id, ...existing }, other];

  it('rejects an edit that takes another client\'s email, with no override', async () => {
    const { svc, clientModel } = build({ existing, all });
    const err: any = await svc.update(id, { email: 'ASHA@x.com', confirmDuplicate: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'CLIENT_DUPLICATE', canOverride: false });
    expect(clientModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a name clash (role suffix ignored) unless confirmed', async () => {
    const { svc, clientModel } = build({ existing, all });
    const err: any = await svc.update(id, { name: 'asha rao (owner)' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ canOverride: true });

    await svc.update(id, { name: 'asha rao (owner)', confirmDuplicate: true });
    expect(clientModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    // confirmDuplicate is a request flag, never persisted
    expect(clientModel.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty('confirmDuplicate');
  });

  it('ignores clashes the edit did not introduce', async () => {
    // Record is already a duplicate of `twin` by name; changing only status must still save.
    const twin = { _id: oid(), name: 'Vipin Choudhary (owner)', email: 'v2@x.com', phone: '1' };
    const { svc, clientModel } = build({ existing, all: [{ _id: id, ...existing }, twin] });
    await svc.update(id, { status: 'inactive' });
    await svc.update(id, { phone: '+91 98765 43210' }); // same digits as before
    expect(clientModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('allows an edit that matches nobody', async () => {
    const { svc, clientModel } = build({ existing, all });
    await svc.update(id, { name: 'Vipin C', email: 'new@x.com', phone: '9000000001' });
    expect(clientModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('ClientsService.mergeClients', () => {
  const masterId = String(oid());
  const dupA = { _id: oid(), name: 'Vipin Choudhary (owner)', email: 'a@x.com', additionalEmails: ['b@x.com'], phone: '999', assignedTo: [oid()], customFields: { k: 'dup', only: 1 } };
  const dupB = { _id: oid(), name: 'vipin choudhary', email: 'MASTER@x.com', twobighaUserId: 'tb-1', twobighaSyncStatus: 'synced' };
  const master = { _id: masterId, name: 'Vipin Choudhary', email: 'master@x.com', additionalEmails: [], customFields: { k: 'master' } };
  const dupIds = [String(dupA._id), String(dupB._id)];

  it('is admin-only and validates input', async () => {
    const { svc } = build({ master, byIds: [dupA, dupB] });
    await expect(svc.mergeClients(masterId, dupIds, { role: 'AGENT' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.mergeClients('bad', dupIds, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.mergeClients(masterId, [masterId], ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.mergeClients(masterId, [...dupIds, String(oid())], ADMIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('soft-deletes duplicates (freeing email) and folds their data into the master', async () => {
    const { svc, clientModel, activityModel, associationModel } = build({ master, byIds: [dupA, dupB] });
    const res = await svc.mergeClients(masterId, [...dupIds, dupIds[0], masterId], ADMIN);
    expect(res).toEqual({ ok: true, masterId, removedIds: dupIds });

    const [delFilter, delUpdate] = clientModel.updateMany.mock.calls[0];
    expect(delFilter._id.$in.map(String).sort()).toEqual([...dupIds].sort());
    expect(delUpdate.$set.isDeleted).toBe(true);
    expect(delUpdate.$unset).toEqual({ email: '' });

    const patch = clientModel.updateOne.mock.calls[0][1].$set;
    expect(patch.phone).toBe('999');
    expect(patch.twobighaUserId).toBe('tb-1');
    expect(patch.email).toBeUndefined(); // master keeps its own primary email
    // dup emails survive as additional emails; master's own address (dupB, any case) is not repeated
    expect([...patch.additionalEmails].sort()).toEqual(['a@x.com', 'b@x.com']);
    expect(patch.assignedTo.map(String)).toEqual(dupA.assignedTo.map(String));
    expect(patch.customFields).toEqual({ k: 'master', only: 1 }); // master wins conflicts

    expect(activityModel.updateMany.mock.calls[0][0]).toMatchObject({ relatedType: 'Client' });
    expect(associationModel.find).toHaveBeenCalled();
  });

  it('adopts a duplicate\'s email when the master has none', async () => {
    const bare = { _id: masterId, name: 'Vipin', additionalEmails: [] };
    const { svc, clientModel } = build({ master: bare, byIds: [dupA] });
    await svc.mergeClients(masterId, [String(dupA._id)], ADMIN);
    const patch = clientModel.updateOne.mock.calls[0][1].$set;
    expect(patch.email).toBe('a@x.com');
    expect(patch.additionalEmails).toEqual(['b@x.com']);
  });

  it('re-points association edges, dropping ones the master already has or that would self-link', async () => {
    const fromEdge = { _id: oid(), fromType: 'clients', fromId: dupA._id, toType: 'leads', toId: oid(), associationType: 'client_lead' };
    const selfEdge = { _id: oid(), fromType: 'clients', fromId: dupA._id, toType: 'clients', toId: new Types.ObjectId(masterId), associationType: 'x' };
    const { svc, associationModel } = build({ master, byIds: [dupA], edges: [fromEdge, selfEdge] });
    // first lookup for the "from" side finds both edges; "to" side re-uses the same stub but is harmless
    await svc.mergeClients(masterId, [String(dupA._id)], ADMIN);
    expect(associationModel.updateOne).toHaveBeenCalledWith(
      { _id: fromEdge._id },
      { $set: { fromId: new Types.ObjectId(masterId) } },
    );
    expect(associationModel.deleteOne).toHaveBeenCalledWith({ _id: selfEdge._id });
  });
});

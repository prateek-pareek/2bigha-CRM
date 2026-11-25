/**
 * Leads filter bar → value picker (`GET /crm/distinct-values`). "State equals …" used to
 * return no values (state wasn't allow-listed), so the filter could never get a value and
 * silently showed every lead.
 */
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
import { INDIAN_STATES } from '../shared/indian-states';

function makeService(values: string[]) {
  const svc: any = Object.create(CRMService.prototype);
  const aggregate = jest.fn(() => ({
    option: () => ({ exec: async () => values.map((v) => ({ v })) }),
  }));
  svc.leadModel = { aggregate };
  svc.pipelinesService = { findAll: jest.fn(async () => []) };
  svc.customFieldModel = {
    findOne: () => ({
      select: () => ({ lean: () => ({ exec: async () => null }) }),
    }),
  };
  return { svc: svc as CRMService, aggregate };
}

describe('getDistinctValues (filter value picker)', () => {
  it('State: every state from the lead form, plus values found on leads', async () => {
    const { svc, aggregate } = makeService(['Rajasthan', 'Some Custom Region']);
    const out = await svc.getDistinctValues('leads', 'state');
    expect(aggregate).toHaveBeenCalled(); // reads real values now, not an empty catalog
    for (const s of INDIAN_STATES) expect(out).toContain(s);
    expect(out).toContain('Some Custom Region');
    expect(out.filter((v) => v === 'Rajasthan')).toHaveLength(1); // de-duplicated
  });

  it('other lead filter fields are served from the data too', async () => {
    for (const field of [
      'pincode',
      'whatsappNumber',
      'role',
      'leadCategory',
      'group',
    ]) {
      const { svc, aggregate } = makeService(['X1']);
      await expect(svc.getDistinctValues('leads', field)).resolves.toContain(
        'X1',
      );
      expect(aggregate).toHaveBeenCalled();
    }
  });

  it('still refuses operator-like / unknown paths', async () => {
    const { svc, aggregate } = makeService(['x']);
    await expect(svc.getDistinctValues('leads', '$where')).resolves.toEqual([]);
    await expect(
      svc.getDistinctValues('leads', 'passwordHash'),
    ).resolves.toEqual([]);
    expect(aggregate).not.toHaveBeenCalled();
  });
});

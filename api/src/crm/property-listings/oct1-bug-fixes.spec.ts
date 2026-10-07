/**
 * Regression tests for the 1 Oct 2026 CRM bug report — the 2bigha-facing paths that a live
 * run must not exercise against staging (delete on 2bigha, the boundary sent on sync, the
 * Sold index, client-scoped property lists). 2bigha GraphQL is mocked throughout.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

// ts-jest transpiles with isolatedModules, so union-typed @Prop fields (e.g. Lead.module) get no
// design:type metadata and crash schema registration on import. These tests never touch real
// schemas — make @Prop a no-op and hand back plain schemas.
jest.mock('@nestjs/mongoose', () => {
  const actual = jest.requireActual('@nestjs/mongoose');
  const { Schema } = jest.requireActual('mongoose');
  return {
    ...actual,
    Prop: () => () => undefined,
    SchemaFactory: { createForClass: () => new Schema({}) },
  };
});

jest.mock('../shared/twobigha-graphql.util', () => ({
  getTwoBighaConfig: jest.fn(() => ({ apiHost: 'https://2bigha.test', apiKey: 'k', apiSecret: 's' })),
  getTwoBighaUploadConfig: jest.fn(() => null),
  twoBighaGraphqlRequest: jest.fn(),
}));

import { twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';
import { PropertyListingsService } from './property-listings.service';
import { TwoBighaPropertyService } from './twobigha-property.service';
import { TwoBighaClientService } from '../records/twobigha-client.service';
import { ClientsService } from '../records/clients.service';

const gql = twoBighaGraphqlRequest as jest.Mock;

/** Chainable stand-in for a Mongoose query whose `.exec()` resolves to `value`. */
const q = (value: unknown) => ({ exec: jest.fn().mockResolvedValue(value) });

function makeListingsService(listingModel: any, twoBigha: Partial<TwoBighaPropertyService>) {
  const none = {} as any;
  return new PropertyListingsService(
    listingModel, none, none, none, none,
    twoBigha as TwoBighaPropertyService,
    none, none, none, none, none, none, none, none, none, none, none,
  );
}

describe('Lucky · Delete property listing (3-dot menu → Delete)', () => {
  let listingModel: any;
  let twoBigha: { deleteProperty: jest.Mock; getPropertyDetailBySlug: jest.Mock };

  beforeEach(() => {
    listingModel = {
      findById: jest.fn(() => q(null)),
      findOne: jest.fn(() => q(null)),
      findByIdAndUpdate: jest.fn(() => q({})),
    };
    twoBigha = {
      deleteProperty: jest.fn().mockResolvedValue({ success: true }),
      getPropertyDetailBySlug: jest.fn().mockResolvedValue(null),
    };
  });

  it('live 2bigha row (slug id, no CRM copy) is deleted on 2bigha by its property id', async () => {
    twoBigha.getPropertyDetailBySlug.mockResolvedValue({ property: { id: 'tb-123' } });
    const svc = makeListingsService(listingModel, twoBigha);

    await expect(svc.remove('agricultural-land-in-baradari-patiala', 'u1')).resolves.toEqual({ success: true });
    expect(twoBigha.getPropertyDetailBySlug).toHaveBeenCalledWith('agricultural-land-in-baradari-patiala');
    expect(twoBigha.deleteProperty).toHaveBeenCalledWith('tb-123');
    expect(listingModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('2bigha refusing the delete surfaces a readable 400 (no silent success)', async () => {
    twoBigha.getPropertyDetailBySlug.mockResolvedValue({ property: { id: 'tb-123' } });
    twoBigha.deleteProperty.mockResolvedValue({ success: false, error: '2bigha declined the delete' });
    const svc = makeListingsService(listingModel, twoBigha);

    await expect(svc.remove('some-slug')).rejects.toThrow(BadRequestException);
    await expect(svc.remove('some-slug')).rejects.toThrow(/2bigha declined the delete/);
  });

  it('synced CRM listing → deleted on 2bigha AND soft-deleted in CRM', async () => {
    const id = new Types.ObjectId();
    listingModel.findById = jest.fn(() =>
      q({ _id: id, listingBucket: 'properties', propertyType: 'Agricultural', twobighaPropertyId: 'tb-9' }),
    );
    const svc = makeListingsService(listingModel, twoBigha);

    await svc.remove(String(id), 'u1');
    expect(twoBigha.deleteProperty).toHaveBeenCalledWith('tb-9');
    expect(listingModel.findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) }),
    );
  });

  it('Farm listing is only soft-deleted (2bigha Farm API has no property delete)', async () => {
    const id = new Types.ObjectId();
    listingModel.findById = jest.fn(() =>
      q({ _id: id, listingBucket: 'farm', propertyType: 'Farm', twobighaPropertyId: 'farm-1' }),
    );
    const svc = makeListingsService(listingModel, twoBigha);

    await svc.remove(String(id));
    expect(twoBigha.deleteProperty).not.toHaveBeenCalled();
    expect(listingModel.findByIdAndUpdate).toHaveBeenCalled();
  });

  it('id unknown to both CRM and 2bigha → 404', async () => {
    const svc = makeListingsService(listingModel, twoBigha);
    await expect(svc.remove('no-such-slug')).rejects.toThrow(NotFoundException);
    expect(twoBigha.deleteProperty).not.toHaveBeenCalled();
  });
});

describe('Manisha · Boundary retained — geometry sent to 2bigha on sync', () => {
  const svc = makeListingsService({}, {});
  const geometry = (listing: any) => (svc as any).toTwoBighaGeometry(listing);

  it('all 4 drawn corners go out as one polygon, in order, with their index', () => {
    const corners = [
      { lat: 30.3398, lng: 76.3869 },
      { lat: 30.3401, lng: 76.3875 },
      { lat: 30.3395, lng: 76.3879 },
      { lat: 30.3392, lng: 76.3872 },
    ];
    const g = geometry({ mapCoordinates: corners, mapLocation: { lat: 30.33965, lng: 76.387375 } });
    expect(g.boundaries).toEqual([
      { type: 'Polygon', coordinates: corners.map((c, index) => ({ ...c, index })) },
    ]);
    expect(g.coordinates).toHaveLength(4);
    expect(g.markers).toEqual([{ lat: 30.33965, lng: 76.387375 }]);
  });

  it('fewer than 3 points is not a boundary', () => {
    const g = geometry({ mapCoordinates: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] });
    expect(g.boundaries).toBeUndefined();
    expect(g.coordinates).toBeUndefined();
  });

  it('string coordinates from older drafts are coerced; garbage points dropped', () => {
    const g = geometry({
      mapCoordinates: [{ lat: '30.1', lng: '76.1' }, { lat: 'x', lng: 1 }, { lat: 30.2, lng: 76.2 }, { lat: 30.3, lng: 76.15 }],
    });
    expect(g.coordinates.map((p: any) => [p.lat, p.lng])).toEqual([[30.1, 76.1], [30.2, 76.2], [30.3, 76.15]]);
  });
});

describe('CRM-only rows merged into Properties / Approval lists look like 2bigha rows', () => {
  const svc = makeListingsService({}, {});
  const envelope = (l: any) => (svc as any).localListingEnvelope({ _id: new Types.ObjectId(), ...l });

  it('Agricultural land type goes out as 2bigha code AGRICULTURAL (portal shows "Agricultural", not "Other"/"Farm")', () => {
    expect(envelope({ landType: 'Agricultural', propertyType: 'Agricultural' }).property.propertyType).toBe('AGRICULTURAL');
    expect(envelope({ propertyType: 'Independent House' }).property.propertyType).toBe('RESIDENTIAL');
  });

  it('a CRM listing marked Sold carries the sold flag the Sold view filters on', () => {
    const p = envelope({ status: 'Sold' }).property;
    expect(p.propertySold).toBe(true);
    expect(p.availablilityStatus).toBe('SOLD');
    expect(envelope({ status: 'Available' }).property.propertySold).toBe(false);
    expect(envelope({ status: 'Under Offer' }).property.availablilityStatus).toBe('MANAGED');
  });

  it('keeps the drawn boundary and the exact pin', () => {
    const boundary = [{ type: 'Polygon', coordinates: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }, { lat: 2, lng: 1 }] }];
    const p = envelope({ mapBoundaries: boundary, mapLocation: { lat: 30.1, lng: 76.2, name: 'X' } }).property;
    expect(p.boundary).toEqual(boundary);
    expect(p.location.coordinates).toEqual({ lat: 30.1, lng: 76.2 });
  });
});

describe('Lucky · Sold filter shows sold properties', () => {
  let svc: TwoBighaPropertyService;

  const indexRows = [
    { property: { id: 'p1', propertySold: true, availablilityStatus: 'AVAILABLE' }, seo: { slug: 's-sold-flag' } },
    { property: { id: 'p2', propertySold: false, availablilityStatus: 'AVAILABLE' }, seo: { slug: 's-available' } },
    { property: { id: 'p3', propertySold: false, availablilityStatus: 'SOLD' }, seo: { slug: 's-sold-enum' } },
    { property: { id: 'p4', propertySold: false, availablilityStatus: 'MANAGED' }, seo: { slug: 's-managed' } },
  ];

  beforeEach(() => {
    gql.mockReset();
    gql.mockImplementation(async (_cfg: unknown, query: string) => {
      if (query.includes('AvailabilityIndex')) {
        return { properties: { data: indexRows, meta: { total: indexRows.length, totalPages: 1 } } };
      }
      if (query.includes('DeleteProperty')) return { deleteProperty: true };
      return {};
    });
    svc = new TwoBighaPropertyService();
    jest.spyOn(svc, 'getPropertyDetailBySlug').mockImplementation(async (slug: string) => ({
      property: { id: slug, propertySold: slug.startsWith('s-sold') },
      seo: { slug },
    }));
  });

  it('status=Sold returns only sold rows — by propertySold flag or SOLD enum', async () => {
    const res = await svc.listProperties({ page: 1, limit: 20, status: 'Sold' } as any);
    expect(res?.data.map((r: any) => r.seo.slug)).toEqual(['s-sold-flag', 's-sold-enum']);
    expect(res?.meta).toMatchObject({ total: 2, page: 1, totalPages: 1 });
  });

  it('status=Under Offer returns the MANAGED rows', async () => {
    const res = await svc.listProperties({ page: 1, limit: 20, status: 'Under Offer' } as any);
    expect(res?.data.map((r: any) => r.seo.slug)).toEqual(['s-managed']);
  });

  it('paginates within the sold set', async () => {
    const res = await svc.listProperties({ page: 2, limit: 1, status: 'Sold' } as any);
    expect(res?.data.map((r: any) => r.seo.slug)).toEqual(['s-sold-enum']);
    expect(res?.meta).toMatchObject({ total: 2, totalPages: 2 });
  });

  it('marking a property sold invalidates the cached index (next Sold view is fresh)', async () => {
    await svc.listProperties({ page: 1, limit: 20, status: 'Sold' } as any);
    const callsBefore = gql.mock.calls.filter(([, qy]) => String(qy).includes('AvailabilityIndex')).length;
    await svc.deleteProperty('p1');
    await svc.listProperties({ page: 1, limit: 20, status: 'Sold' } as any);
    const callsAfter = gql.mock.calls.filter(([, qy]) => String(qy).includes('AvailabilityIndex')).length;
    expect(callsAfter).toBe(callsBefore + 1);
  });

  it('deleteProperty reports a 2bigha refusal', async () => {
    gql.mockImplementationOnce(async () => ({ deleteProperty: false }));
    await expect(svc.deleteProperty('p9')).resolves.toEqual({ success: false, error: '2bigha declined the delete' });
  });
});

describe('Disha · Client tab — only the selected client\'s properties + Agricultural Land', () => {
  it('unlinked client returns nothing instead of every platform property', async () => {
    const twoBighaClient = { getPropertiesByClientId: jest.fn() };
    const clientModel = { findById: jest.fn(() => q({ _id: 'c1', twobighaUserId: undefined })) };
    const svc = new ClientsService(clientModel as any, {} as any, {} as any, {} as any, twoBighaClient as any);

    const res = await svc.getClientProperties('6a96958b7541df7314520e84');
    expect(res).toMatchObject({ result: [], totalCount: 0, clientLinked: false });
    expect(twoBighaClient.getPropertiesByClientId).not.toHaveBeenCalled();
  });

  it('linked client always queries with its own 2bigha clientId', async () => {
    const twoBighaClient = { getPropertiesByClientId: jest.fn().mockResolvedValue({ result: [] }) };
    const clientModel = { findById: jest.fn(() => q({ _id: 'c1', twobighaUserId: 'tb-user-7' })) };
    const svc = new ClientsService(clientModel as any, {} as any, {} as any, {} as any, twoBighaClient as any);

    await svc.getClientProperties('6a96958b7541df7314520e84', { propertyCategory: 'AGRICULTURAL' });
    expect(twoBighaClient.getPropertiesByClientId).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'tb-user-7' }),
    );
  });

  it('"Agricultural Land" category keeps only AGRICULTURAL rows from both buckets, with counts', async () => {
    const svc = new TwoBighaClientService();
    const original = svc.getPropertiesByClientId.bind(svc);
    const buckets: Record<string, any[]> = {
      PROPERTY: [
        { id: 'a1', propertyType: 'AGRICULTURAL', approvalStatus: 'APPROVED' },
        { id: 'c1', propertyType: 'COMMERCIAL', approvalStatus: 'APPROVED' },
      ],
      FARM: [
        { id: 'a2', propertyType: 'agricultural', approvalStatus: 'PENDING' },
        { id: 'f1', propertyType: 'FARMHOUSE', approvalStatus: 'PENDING' },
        { id: 'a1', propertyType: 'AGRICULTURAL', approvalStatus: 'APPROVED' }, // duplicate across buckets
      ],
    };
    const spy = jest.spyOn(svc, 'getPropertiesByClientId').mockImplementation(async (p: any) =>
      p.propertyCategory === 'AGRICULTURAL' ? original(p) : { result: buckets[p.propertyCategory], STATUS_CODES: 200 },
    );

    const res = await svc.getPropertiesByClientId({ clientId: 'tb-user-7', propertyCategory: 'AGRICULTURAL', page: 1, limit: 10 } as any);
    expect(res.result.map((p: any) => p.id)).toEqual(['a1', 'a2']);
    expect(res.counts).toEqual({ all: 2, pending: 1, approved: 1, rejected: 0, flagged: 0 });
    // every upstream call stays scoped to the client
    for (const [args] of spy.mock.calls) expect((args as any).clientId).toBe('tb-user-7');

    const approvedOnly = await svc.getPropertiesByClientId({ clientId: 'tb-user-7', propertyCategory: 'AGRICULTURAL', approvalStatus: 'APPROVED' } as any);
    expect(approvedOnly.result.map((p: any) => p.id)).toEqual(['a1']);
  });
});

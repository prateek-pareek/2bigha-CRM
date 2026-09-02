/**
 * Third-party listings API facade.
 *
 * - No NEXT_PUBLIC_2BIGHA_LISTINGS_API_URL → local mock (localStorage)
 * - URL set → HTTP calls to that host (same /v1/... paths)
 *
 * UI should import from this module only — never from mock/http directly —
 * so going live is a config change, not a code rewrite.
 */

export type {
  CreateThirdPartyPropertyInput,
  UpdateThirdPartyPropertyInput,
  ThirdPartyListQuery,
} from "./mock-third-party";

export { LEGAL_REVIEWER_POOL, MOCK_THIRD_PARTY_LISTINGS } from "./mock-third-party";

export {
  THIRD_PARTY_LISTINGS_API_URL,
  useThirdPartyListingsMock,
} from "./third-party-config";

import type { PropertyLegalStatus } from "./types";
import { useThirdPartyListingsMock } from "./third-party-config";
import * as mock from "./mock-third-party";
import * as http from "./third-party-http";
import type {
  CreateThirdPartyPropertyInput,
  ThirdPartyListQuery,
  UpdateThirdPartyPropertyInput,
} from "./mock-third-party";

import api from "@/lib/crm/api";
import { mapTwoBighaFarmToRecord, mapTwoBighaPropertyToRecord, type TwoBighaFarmRaw } from "./backend-api";

const mockMode = () => useThirdPartyListingsMock();

export async function fetchThirdPartyPropertyListings(query: ThirdPartyListQuery = {}) {
  return mockMode() ? mock.fetchThirdPartyPropertyListings(query) : http.httpFetchListings(query);
}

export async function fetchThirdPartyPropertyById(id: string) {
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
  const isMockId = id.startsWith("tp_listing_") || id.startsWith("mock_");
  const isLivePmId = id.startsWith("pm_");

  if (isLivePmId) {
    return http.httpFetchById(id);
  }

  if (!isMongoId && !isMockId) {
    try {
      const { data } = await api.get<any>(`/crm/property-listings/twobigha/by-slug/${id}`);
      if (data) {
        return mapTwoBighaPropertyToRecord(data);
      }
    } catch {
      try {
        const { data } = await api.get<TwoBighaFarmRaw>(`/crm/property-listings/twobigha/farms/by-slug/${id}`);
        if (data) {
          return mapTwoBighaFarmToRecord(data);
        }
      } catch {}
    }
    return null;
  }
  return mockMode() ? mock.fetchThirdPartyPropertyById(id) : http.httpFetchById(id);
}

export async function fetchThirdPartyPropertyStats(
  listingBucket?: Parameters<typeof mock.fetchThirdPartyPropertyStats>[0],
) {
  return mockMode()
    ? mock.fetchThirdPartyPropertyStats(listingBucket)
    : http.httpFetchStats(listingBucket);
}

export async function createThirdPartyProperty(input: CreateThirdPartyPropertyInput) {
  return mockMode() ? mock.createThirdPartyProperty(input) : http.httpCreate(input);
}

export async function updateThirdPartyProperty(
  id: string,
  input: UpdateThirdPartyPropertyInput,
) {
  return mockMode() ? mock.updateThirdPartyProperty(id, input) : http.httpUpdate(id, input);
}

export async function deleteThirdPartyProperty(id: string) {
  return mockMode() ? mock.deleteThirdPartyProperty(id) : http.httpDelete(id);
}

export async function fetchLeadSubscriptionMock(leadId: string) {
  return mockMode()
    ? mock.fetchLeadSubscriptionMock(leadId)
    : http.httpLeadSubscription(leadId);
}

export async function fetchLegalVerificationQueue(query: mock.ThirdPartyListQuery = {}) {
  return mockMode()
    ? mock.fetchLegalVerificationQueue(query)
    : http.httpFetchLegalVerificationQueue(query);
}

export async function requestPropertyLegalVerification(propertyId: string) {
  return mockMode()
    ? mock.requestPropertyLegalVerification(propertyId)
    : http.httpRequestPropertyLegalVerification(propertyId);
}

export async function requestPropertyLegalVerificationBatch(propertyIds: string[]) {
  return mockMode()
    ? mock.requestPropertyLegalVerificationBatch(propertyIds)
    : http.httpRequestPropertyLegalVerificationBatch(propertyIds);
}

export async function assignPropertyLegalReviewer(propertyId: string, assignedTo: string) {
  return mockMode()
    ? mock.assignPropertyLegalReviewer(propertyId, assignedTo)
    : http.httpAssignPropertyLegalReviewer(propertyId, assignedTo);
}

export async function decidePropertyLegalVerification(
  propertyId: string,
  input: {
    status: PropertyLegalStatus;
    reviewedBy?: string;
    notes?: string;
    rejectionReason?: string;
  },
) {
  return mockMode()
    ? mock.decidePropertyLegalVerification(propertyId, input)
    : http.httpDecidePropertyLegalVerification(propertyId, input);
}

export async function addPropertyLegalNote(propertyId: string, text: string, by?: string) {
  return mockMode()
    ? mock.addPropertyLegalNote(propertyId, text, by)
    : http.httpAddPropertyLegalNote(propertyId, text, by);
}

export async function attachPropertyLegalReport(
  propertyId: string,
  fileName: string,
  url?: string,
) {
  return mockMode()
    ? mock.attachPropertyLegalReport(propertyId, fileName, url)
    : http.httpAttachPropertyLegalReport(propertyId, fileName, url);
}

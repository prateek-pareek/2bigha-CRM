import { Model, Types } from 'mongoose';
import { Lead } from '../schemas/lead.schema';
import { Client } from '../schemas/client.schema';
import { Contact } from '../schemas/contact.schema';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from './twobigha-graphql.util';

const ADMIN_CREATE_USER_MUTATION = `
  mutation AdminCreateUser($input: PlatformUserInput!) {
    adminCreateUser(input: $input) {
      success
      message
      user {
        id
      }
    }
  }
`;

/**
 * Ensures a client has a real 2bigha platform user ID (created via 2bigha `adminCreateUser` mutation).
 * If 2bigha GraphQL is configured, creates the platform user on 2bigha so Postgres platform_users matches.
 */
async function ensureRealTwobighaUserId(
  client: { _id: Types.ObjectId; name?: string; email?: string; phone?: string; twobighaUserId?: string },
  lead: Record<string, unknown>,
  deps: { clientModel: Model<Client> },
): Promise<string> {
  const currentId = client.twobighaUserId?.trim();

  // If currentId is valid and not synthetic '2b_user_', use it directly
  if (currentId && !currentId.startsWith('2b_user_')) {
    return currentId;
  }

  const config = getTwoBighaConfig();
  if (!config) {
    const mockId = currentId || `mock-2b-user-${client._id}`;
    if (mockId !== currentId) {
      await deps.clientModel.updateOne({ _id: client._id }, { $set: { twobighaUserId: mockId } }).exec();
    }
    return mockId;
  }

  // Attempt adminCreateUser on 2bigha to generate a real platform user ID in 2bigha database
  const rawEmail = client.email?.trim() || (lead.email as string)?.trim() || `client-${client._id}@twobigha-crm.internal`;
  const rawName = (client.name || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'CRM Client').trim();
  const nameParts = rawName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || 'CRM';
  const lastName = nameParts.slice(1).join(' ') || 'Client';
  const phone = client.phone || (lead.mobileNo as string) || (lead.phone as string) || undefined;

  try {
    const data = await twoBighaGraphqlRequest<{
      adminCreateUser?: { success?: boolean; message?: string; user?: { id?: string } | null };
    }>(config, ADMIN_CREATE_USER_MUTATION, {
      input: {
        email: rawEmail,
        firstName,
        lastName,
        role: 'USER',
        profile: {
          phone,
        },
      },
    });

    const realId = data?.adminCreateUser?.user?.id;
    if (realId) {
      const realIdStr = String(realId);
      await deps.clientModel.updateOne({ _id: client._id }, { $set: { twobighaUserId: realIdStr } }).exec();
      return realIdStr;
    }
  } catch (e: any) {
    // If adminCreateUser failed (e.g. email already registered on 2bigha), log warning
    console.warn(`[ensureRealTwobighaUserId] adminCreateUser notice for client ${client._id}: ${e?.message}`);
  }

  // Fallback to current synthetic ID or new synthetic ID if 2bigha user creation wasn't possible
  const fallbackId = currentId || `2b_user_${client._id}`;
  if (fallbackId !== currentId) {
    await deps.clientModel.updateOne({ _id: client._id }, { $set: { twobighaUserId: fallbackId } }).exec();
  }
  return fallbackId;
}

/** Resolve 2bigha platform user id for a lead; auto-links lead.clientId when matched via contact/email/phone. */
export async function resolveTwobighaUserIdForLeadId(
  leadId: string,
  deps: {
    leadModel: Model<Lead>;
    clientModel: Model<Client>;
    contactModel: Model<Contact>;
  },
): Promise<string | null> {
  const lead = await deps.leadModel
    .findById(leadId)
    .select('_id clientId email mobileNo phone firstName lastName associatedContacts')
    .lean()
    .exec();
  if (!lead) return null;

  const resolved = await resolveTwobighaUserIdForLead(lead as unknown as Record<string, unknown>, deps);
  return resolved?.twobighaUserId || null;
}

export async function resolveTwobighaUserIdForLead(
  lead: Record<string, unknown>,
  deps: {
    leadModel: Model<Lead>;
    clientModel: Model<Client>;
    contactModel: Model<Contact>;
  },
): Promise<{ clientId: Types.ObjectId; twobighaUserId: string } | null> {
  const leadId = lead._id as Types.ObjectId | undefined;

  // 1. Check direct linked client on lead
  if (lead.clientId) {
    const client = await deps.clientModel
      .findById(lead.clientId)
      .select('_id twobighaUserId name email phone')
      .lean()
      .exec();
    if (client) {
      const twobighaUserId = await ensureRealTwobighaUserId(client, lead, deps);
      return { clientId: client._id as Types.ObjectId, twobighaUserId };
    }
  }

  // 2. Search for existing client matching email or phone
  const client = await findSyncedClientForLead(lead, deps);
  if (client?._id) {
    const twobighaUserId = await ensureRealTwobighaUserId(client, lead, deps);
    if (leadId && !lead.clientId) {
      await deps.leadModel
        .updateOne(
          { _id: leadId, $or: [{ clientId: { $exists: false } }, { clientId: null }] },
          { $set: { clientId: client._id } },
        )
        .exec();
    }
    return {
      clientId: client._id as Types.ObjectId,
      twobighaUserId,
    };
  }

  // 3. Auto-create a synced Client for lead if no client exists yet
  if (leadId) {
    const firstName = String(lead.firstName || '').trim();
    const lastName = String(lead.lastName || '').trim();
    const name =
      [firstName, lastName].filter(Boolean).join(' ') ||
      (lead.email as string) ||
      (lead.mobileNo as string) ||
      'Lead Customer';
    const email = (lead.email as string)?.trim() || undefined;
    const phone = (lead.mobileNo || lead.phone) as string || undefined;

    const newClientId = new Types.ObjectId();

    const newClient = await deps.clientModel.create({
      _id: newClientId,
      name,
      email,
      phone,
      sourceLead: leadId,
    });

    const twobighaUserId = await ensureRealTwobighaUserId(
      { _id: newClientId, name, email, phone },
      lead,
      deps,
    );

    await deps.leadModel
      .updateOne({ _id: leadId }, { $set: { clientId: newClient._id } })
      .exec();

    return {
      clientId: newClient._id as Types.ObjectId,
      twobighaUserId,
    };
  }

  return null;
}

async function findSyncedClientForLead(
  lead: Record<string, unknown>,
  deps: { clientModel: Model<Client>; contactModel: Model<Contact> },
): Promise<{ _id: Types.ObjectId; name?: string; email?: string; phone?: string; twobighaUserId?: string } | null> {
  const emails = new Set<string>();
  const normalizeEmail = (v?: string) => v?.trim().toLowerCase();
  const addEmail = (v?: string) => {
    const e = normalizeEmail(v);
    if (e) emails.add(e);
  };

  addEmail(lead.email as string | undefined);
  const contactIds = (lead.associatedContacts as Types.ObjectId[] | undefined) || [];
  if (contactIds.length) {
    const contacts = await deps.contactModel
      .find({ _id: { $in: contactIds } })
      .select('email additionalEmails')
      .lean()
      .exec();
    for (const c of contacts) {
      addEmail((c as { email?: string }).email);
      for (const extra of (c as { additionalEmails?: string[] }).additionalEmails || []) {
        addEmail(extra);
      }
    }
  }

  if (emails.size) {
    const byEmail = await deps.clientModel
      .findOne({
        email: { $in: [...emails] },
      })
      .select('_id name email phone twobighaUserId')
      .lean()
      .exec();
    if (byEmail?._id) {
      return byEmail as { _id: Types.ObjectId; name?: string; email?: string; phone?: string; twobighaUserId?: string };
    }
  }

  const phones = [lead.mobileNo, lead.phone]
    .map((p) => String(p || '').replace(/\D/g, ''))
    .filter((p) => p.length >= 10);
  if (phones.length) {
    const byPhone = await deps.clientModel
      .findOne({
        $or: phones.flatMap((digits) => [
          { phone: { $regex: digits.slice(-10) } },
          { mobileNo: { $regex: digits.slice(-10) } },
        ]),
      })
      .select('_id name email phone twobighaUserId')
      .lean()
      .exec();
    if (byPhone?._id) {
      return byPhone as { _id: Types.ObjectId; name?: string; email?: string; phone?: string; twobighaUserId?: string };
    }
  }

  return null;
}

import { Model, Types } from 'mongoose';
import { Lead } from '../schemas/lead.schema';
import { Client } from '../schemas/client.schema';
import { Contact } from '../schemas/contact.schema';

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
    .select('clientId email mobileNo phone associatedContacts')
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

  if (lead.clientId) {
    const client = await deps.clientModel
      .findById(lead.clientId)
      .select('twobighaUserId')
      .lean()
      .exec();
    const userId = (client as { twobighaUserId?: string } | null)?.twobighaUserId?.trim();
    if (userId) {
      return { clientId: lead.clientId as Types.ObjectId, twobighaUserId: userId };
    }
  }

  const client = await findSyncedClientForLead(lead, deps);
  if (!client?._id || !client.twobighaUserId?.trim()) return null;

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
    twobighaUserId: client.twobighaUserId.trim(),
  };
}

async function findSyncedClientForLead(
  lead: Record<string, unknown>,
  deps: { clientModel: Model<Client>; contactModel: Model<Contact> },
): Promise<{ _id: Types.ObjectId; twobighaUserId?: string } | null> {
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
        twobighaUserId: { $exists: true, $nin: [null, ''] },
      })
      .select('_id twobighaUserId')
      .lean()
      .exec();
    if (byEmail?.twobighaUserId?.trim()) {
      return byEmail as { _id: Types.ObjectId; twobighaUserId?: string };
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
        twobighaUserId: { $exists: true, $nin: [null, ''] },
      })
      .select('_id twobighaUserId')
      .lean()
      .exec();
    if (byPhone?.twobighaUserId?.trim()) {
      return byPhone as { _id: Types.ObjectId; twobighaUserId?: string };
    }
  }

  return null;
}

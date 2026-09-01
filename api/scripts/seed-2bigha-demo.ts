/**
 * Seeds local CRM clients + leads and syncs them to 2bigha staging (adminCreateUser + createLead).
 * Run: npm run seed:2bigha-demo
 *
 * Search in the CRM UI only finds LOCAL Mongo records — not live 2bigha users/leads.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as mongoose from 'mongoose';
import {
  getTwoBighaConfig,
  twoBighaGraphqlRequest,
} from '../src/crm/shared/twobigha-graphql.util';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI_CRM || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mathionix-crm';

const ADMIN_CREATE_USER = `
  mutation AdminCreateUser($input: PlatformUserInput!) {
    adminCreateUser(input: $input) {
      success
      message
      user { id }
    }
  }
`;

const CREATE_LEAD = `
  mutation CreateLead($input: CreateLeadInput!) {
    createLead(input: $input) {
      result { Id }
      message
    }
  }
`;

async function syncClientTo2bigha(doc: {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  role?: string;
}) {
  const config = getTwoBighaConfig();
  if (!config) {
    return { status: 'mock' as const, twobighaUserId: `mock-2b-user-${doc._id}`, error: undefined };
  }
  const parts = doc.name.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ') || undefined;
  try {
    const data = await twoBighaGraphqlRequest<{
      adminCreateUser?: { success?: boolean; message?: string; user?: { id?: string } };
    }>(config, ADMIN_CREATE_USER, {
      input: {
        email: doc.email,
        firstName,
        lastName,
        role: doc.role || 'USER',
        profile: { phone: doc.phone || undefined },
      },
    });
    const id = data?.adminCreateUser?.user?.id;
    if (!data?.adminCreateUser?.success || !id) {
      throw new Error(data?.adminCreateUser?.message || 'No platform user id returned');
    }
    return { status: 'synced' as const, twobighaUserId: String(id), error: undefined };
  } catch (e: any) {
    const msg = e?.message || 'Unknown error';
    if (/already exists/i.test(msg)) {
      return { status: 'failed' as const, twobighaUserId: undefined, error: msg };
    }
    return { status: 'failed' as const, twobighaUserId: undefined, error: msg };
  }
}

async function syncLeadTo2bigha(twobighaClientId: string, note?: string) {
  const config = getTwoBighaConfig();
  if (!config) {
    return { status: 'mock' as const, twobighaLeadId: `mock-2b-lead-${Date.now()}`, error: undefined };
  }
  try {
    const data = await twoBighaGraphqlRequest<{
      createLead?: { result?: { Id?: string | number }; message?: string };
    }>(config, CREATE_LEAD, {
      input: {
        clientId: twobighaClientId,
        leadSource: 'CRM Demo Seed',
        note: note || 'Seeded from CRM for integration testing',
      },
    });
    const id = data?.createLead?.result?.Id;
    if (id == null) throw new Error(data?.createLead?.message || 'No lead id returned');
    return { status: 'synced' as const, twobighaLeadId: String(id), error: undefined };
  } catch (e: any) {
    return { status: 'failed' as const, twobighaLeadId: undefined, error: e?.message || 'Unknown error' };
  }
}

async function main() {
  const ts = Date.now();
  console.log(`Connecting to ${MONGO_URI} ...`);
  const conn = mongoose.createConnection(MONGO_URI);
  await conn.asPromise();

  const clientCol = conn.collection('clients');
  const leadCol = conn.collection('leads');

  const demoClients = [
    {
      name: 'Demo Owner Alpha',
      email: `demo.owner.alpha.${ts}@crm-seed.test`,
      phone: '+919876543210',
      role: 'OWNER',
    },
    {
      name: 'Demo Buyer Beta',
      email: `demo.buyer.beta.${ts}@crm-seed.test`,
      phone: '+919876543211',
      role: 'USER',
    },
  ];

  const createdClients: Array<{ _id: mongoose.Types.ObjectId; email: string; twobighaUserId?: string }> = [];

  for (const c of demoClients) {
    const now = new Date();
    const insert = await clientCol.insertOne({
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      status: 'active',
      additionalEmails: [],
      invalidEmails: [],
      associatedLeads: [],
      associatedOrganizations: [],
      associatedContacts: [],
      isDeleted: false,
      twobighaSyncStatus: 'not_synced',
      createdAt: now,
      updatedAt: now,
    });
    const _id = insert.insertedId;
    console.log(`\nClient created: ${c.name} (${_id})`);

    const sync = await syncClientTo2bigha({ _id, ...c });
    await clientCol.updateOne(
      { _id },
      {
        $set: {
          twobighaUserId: sync.twobighaUserId,
          twobighaSyncStatus: sync.status,
          twobighaSyncError: sync.error,
          twobighaSyncedAt: now,
          updatedAt: now,
        },
      },
    );
    console.log(`  2bigha client sync: ${sync.status}${sync.twobighaUserId ? ` → ${sync.twobighaUserId}` : ''}`);
    if (sync.error) console.log(`  Error: ${sync.error}`);
    createdClients.push({ _id, email: c.email, twobighaUserId: sync.twobighaUserId });
  }

  const linkedClient = createdClients.find((c) => c.twobighaUserId);
  if (linkedClient) {
    const now = new Date();
    const leadInsert = await leadCol.insertOne({
      firstName: 'Demo',
      lastName: `Lead ${ts}`,
      email: `demo.lead.${ts}@crm-seed.test`,
      mobileNo: '+919123456789',
      status: 'New',
      stage: 'New',
      callStatus: 'Not Called',
      module: '2Bigha',
      leadType: 'standard',
      leadVertical: 'property_listing',
      leadCategory: 'Buyer lead',
      clientId: linkedClient._id,
      converted: false,
      additionalEmails: [],
      invalidEmails: [],
      isDeleted: false,
      twobighaSyncStatus: 'not_synced',
      notes: 'Demo lead linked to seeded client — for 2bigha createLead test',
      createdAt: now,
      updatedAt: now,
    });
    const leadId = leadInsert.insertedId;
    console.log(`\nLead created: Demo Lead ${ts} (${leadId}) → linked to client ${linkedClient._id}`);

    const leadSync = await syncLeadTo2bigha(
      linkedClient.twobighaUserId!,
      'Seeded from CRM for integration testing',
    );
    await leadCol.updateOne(
      { _id: leadId },
      {
        $set: {
          twobighaLeadId: leadSync.twobighaLeadId,
          twobighaSyncStatus: leadSync.status,
          twobighaSyncError: leadSync.error,
          twobighaSyncedAt: now,
          updatedAt: now,
        },
      },
    );
  await clientCol.updateOne({ _id: linkedClient._id }, { $addToSet: { associatedLeads: leadId } });
    console.log(`  2bigha lead sync: ${leadSync.status}${leadSync.twobighaLeadId ? ` → ${leadSync.twobighaLeadId}` : ''}`);
    if (leadSync.error) console.log(`  Error: ${leadSync.error}`);
  }

  const unlinkedNow = new Date();
  const unlinkedLead = await leadCol.insertOne({
    firstName: 'Unlinked',
    lastName: `Lead ${ts}`,
    email: `unlinked.lead.${ts}@crm-seed.test`,
    mobileNo: '+919111222333',
    status: 'New',
    stage: 'New',
    callStatus: 'Not Called',
    module: '2Bigha',
    leadType: 'standard',
    leadVertical: 'property_listing',
    converted: false,
    additionalEmails: [],
    invalidEmails: [],
    isDeleted: false,
    twobighaSyncStatus: 'skipped',
    twobighaSyncError: 'No 2bigha-synced client linked to this lead yet — createLead needs a clientId.',
    createdAt: unlinkedNow,
    updatedAt: unlinkedNow,
  });
  console.log(`\nLead created (no client link): Unlinked Lead ${ts} (${unlinkedLead.insertedId})`);

  console.log('\n--- Done ---');
  console.log('Search in CRM (Add Lead → Search existing people) finds LOCAL records only.');
  console.log('Try searching: "Demo Owner" or "demo.owner"');
  console.log('Settings → 2bigha platform sync → Clients tab should show seeded clients.');
  console.log('Open linked lead detail → right sidebar → Linked client (2bigha).');

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Seeds local Mongo with data to exercise Task board + PM→task flows.
 *
 * Run from api/:
 *   npm run seed:pm-tasks-test
 *
 * Creates (idempotent by seedTag):
 * - HRMS + CRM users for RM / Legal / Field (linked via twobighaAdminId)
 * - Client + Lead with twobighaUserId (ready for Create PM)
 * - Sample Task activities: Open / In Progress / Done / Overdue + checklist
 *
 * Does NOT create live Razorpay payments or call 2bigha PM mutations.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import {
  getTwoBighaConfig,
  twoBighaGraphqlRequest,
} from '../src/crm/shared/twobigha-graphql.util';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI =
  process.env.MONGO_URI_CRM || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mathionix-crm';

const SEED_TAG = 'pm-tasks-test-v1';
/** Default password for newly created staff logins (HRMS/CRM). */
const STAFF_PASSWORD = 'Test@12345';

const ADMIN_CREATE_USER = `
  mutation AdminCreateUser($input: PlatformUserInput!) {
    adminCreateUser(input: $input) {
      success
      message
      user { id }
    }
  }
`;

type StaffDef = {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  twobighaAdminId: string;
  reportsToAdmin?: boolean;
};

const STAFF: StaffDef[] = [
  {
    key: 'rm',
    email: 'seed.rm@crm-seed.test',
    firstName: 'Seed',
    lastName: 'RM',
    role: 'Manager',
    twobighaAdminId: 'seed-tb-admin-rm-0001',
    reportsToAdmin: false,
  },
  {
    key: 'legal',
    email: 'seed.legal@crm-seed.test',
    firstName: 'Seed',
    lastName: 'Legal',
    role: 'Employee',
    twobighaAdminId: 'seed-tb-admin-legal-0001',
    reportsToAdmin: true,
  },
  {
    key: 'field',
    email: 'seed.field@crm-seed.test',
    firstName: 'Seed',
    lastName: 'Field',
    role: 'Employee',
    twobighaAdminId: 'seed-tb-admin-field-0001',
    reportsToAdmin: true,
  },
];

const CRM_PERMS = [
  'dashboard:read',
  'workspace:read',
  'activities:read',
  'activities:write',
  'leads:read',
  'leads:write',
  'property_listings:read',
  'property_listings:write',
  'clients:read',
  'clients:write',
];

async function syncClientTo2bigha(doc: {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  role?: string;
}) {
  const config = getTwoBighaConfig();
  if (!config) {
    return {
      status: 'mock' as const,
      twobighaUserId: `mock-2b-user-${doc._id}`,
      error: undefined as string | undefined,
    };
  }
  const parts = doc.name.trim().split(/\s+/);
  try {
    const data = await twoBighaGraphqlRequest<{
      adminCreateUser?: { success?: boolean; message?: string; user?: { id?: string } };
    }>(config, ADMIN_CREATE_USER, {
      input: {
        email: doc.email,
        firstName: parts[0],
        lastName: parts.slice(1).join(' ') || undefined,
        role: doc.role || 'OWNER',
        profile: { phone: doc.phone || undefined },
      },
    });
    const id = data?.adminCreateUser?.user?.id;
    if (!data?.adminCreateUser?.success || !id) {
      throw new Error(data?.adminCreateUser?.message || 'No platform user id returned');
    }
    return { status: 'synced' as const, twobighaUserId: String(id), error: undefined };
  } catch (e: any) {
    const msg = String(e?.message || 'Unknown error');
    // Reuse a stable mock id so PM create can still be attempted against staging with a known client.
    return {
      status: 'mock' as const,
      twobighaUserId: `mock-2b-user-${doc._id}`,
      error: msg,
    };
  }
}

async function main() {
  const ts = Date.now();
  console.log(`Connecting to ${MONGO_URI} ...`);
  const conn = mongoose.createConnection(MONGO_URI);
  await conn.asPromise();

  const users = conn.collection('users');
  const crmusers = conn.collection('crmusers');
  const clients = conn.collection('clients');
  const leads = conn.collection('leads');
  const activities = conn.collection('activities');

  const passwordHash = await bcrypt.hash(STAFF_PASSWORD, 10);
  const now = new Date();

  const admin =
    (await users.findOne({ email: 'admin@2bigha.com' })) ||
    (await users.findOne({ email: 'admin@mathionix.com' })) ||
    (await users.findOne({}));

  if (!admin?._id) {
    throw new Error('No admin user found in `users`. Log in once or seed an admin first.');
  }
  const adminId = admin._id as mongoose.Types.ObjectId;
  console.log(`Using admin author/assignee base: ${admin.email} (${adminId})`);

  // Ensure admin can exercise task + PM APIs when permissions are checked granularly.
  await users.updateOne(
    { _id: adminId },
    {
      $addToSet: {
        crmPermissions: { $each: CRM_PERMS },
        permittedTools: 'CRM',
      },
    },
  );

  const staffIds: Record<string, mongoose.Types.ObjectId> = {};

  for (const s of STAFF) {
    const existingHrms = await users.findOne({ email: s.email });
    let hrmsId: mongoose.Types.ObjectId;
    if (existingHrms?._id) {
      hrmsId = existingHrms._id as mongoose.Types.ObjectId;
      await users.updateOne(
        { _id: hrmsId },
        {
          $set: {
            firstName: s.firstName,
            lastName: s.lastName,
            role: s.role,
            reportsTo: s.reportsToAdmin ? adminId : undefined,
            updatedAt: now,
          },
          $addToSet: {
            crmPermissions: { $each: CRM_PERMS },
            permittedTools: 'CRM',
          },
        },
      );
    } else {
      const insert = await users.insertOne({
        email: s.email,
        password: passwordHash,
        firstName: s.firstName,
        lastName: s.lastName,
        role: s.role,
        useRoleOverrides: true,
        permissions: [],
        permittedTools: ['CRM'],
        crmPermissions: CRM_PERMS,
        pmProjects: [],
        pmSpaces: [],
        pmPermissions: [],
        tokenVersion: 0,
        accessVersion: 1,
        accessibleEmailAccounts: [],
        salesWorkspaceAccessibleEmployees: [],
        reportsTo: s.reportsToAdmin ? adminId : undefined,
        createdAt: now,
        updatedAt: now,
      });
      hrmsId = insert.insertedId;
    }
    staffIds[s.key] = hrmsId;

    const existingCrm = await crmusers.findOne({ email: s.email });
    if (existingCrm?._id) {
      await crmusers.updateOne(
        { _id: existingCrm._id },
        {
          $set: {
            firstName: s.firstName,
            lastName: s.lastName,
            role: s.role,
            isActive: true,
            twobighaAdminId: s.twobighaAdminId,
            twobighaSyncStatus: 'mock',
            updatedAt: now,
          },
        },
      );
    } else {
      await crmusers.insertOne({
        email: s.email,
        password: passwordHash,
        firstName: s.firstName,
        lastName: s.lastName,
        role: s.role,
        permissions: CRM_PERMS,
        isActive: true,
        accessibleEmailAccounts: [],
        twobighaAdminId: s.twobighaAdminId,
        twobighaSyncStatus: 'mock',
        createdAt: now,
        updatedAt: now,
      });
    }
    console.log(`Staff ready: ${s.firstName} ${s.lastName} <${s.email}> hrms=${hrmsId}`);
  }

  // Also promote existing staff@2bigha.com into HRMS portal list if present.
  const existingStaffCrm = await crmusers.findOne({ email: 'staff@2bigha.com' });
  if (existingStaffCrm) {
    const hrmsStaff = await users.findOne({ email: 'staff@2bigha.com' });
    if (!hrmsStaff) {
      await users.insertOne({
        email: 'staff@2bigha.com',
        password: passwordHash,
        firstName: existingStaffCrm.firstName || 'staff',
        lastName: existingStaffCrm.lastName || 'testing',
        role: 'Manager',
        useRoleOverrides: true,
        permissions: [],
        permittedTools: ['CRM'],
        crmPermissions: CRM_PERMS,
        pmProjects: [],
        pmSpaces: [],
        pmPermissions: [],
        tokenVersion: 0,
        accessVersion: 1,
        accessibleEmailAccounts: [],
        salesWorkspaceAccessibleEmployees: [],
        reportsTo: adminId,
        createdAt: now,
        updatedAt: now,
      });
      console.log('Promoted staff@2bigha.com into HRMS users (CRM portal + assignee).');
    }
  }

  // --- Client + Lead ready for PM create ---
  const clientEmail = `pm.ready.owner.${SEED_TAG}@crm-seed.test`;
  let client = await clients.findOne({ email: clientEmail });
  let clientId: mongoose.Types.ObjectId;
  if (client?._id) {
    clientId = client._id as mongoose.Types.ObjectId;
  } else {
    const inserted = await clients.insertOne({
      name: 'PM Ready Owner (Seed)',
      email: clientEmail,
      phone: '+919700001111',
      role: 'OWNER',
      status: 'active',
      additionalEmails: [],
      invalidEmails: [],
      associatedLeads: [],
      associatedOrganizations: [],
      associatedContacts: [],
      isDeleted: false,
      twobighaSyncStatus: 'not_synced',
      customFields: { seedTag: SEED_TAG },
      createdAt: now,
      updatedAt: now,
    });
    clientId = inserted.insertedId;
  }

  const sync = await syncClientTo2bigha({
    _id: clientId,
    name: 'PM Ready Owner Seed',
    email: clientEmail,
    phone: '+919700001111',
    role: 'OWNER',
  });
  await clients.updateOne(
    { _id: clientId },
    {
      $set: {
        twobighaUserId: sync.twobighaUserId,
        twobighaSyncStatus: sync.status,
        twobighaSyncError: sync.error,
        twobighaSyncedAt: now,
        updatedAt: now,
        'customFields.seedTag': SEED_TAG,
      },
    },
  );
  console.log(
    `Client: PM Ready Owner (${clientId}) twobighaUserId=${sync.twobighaUserId} status=${sync.status}`,
  );
  if (sync.error) console.log(`  sync note: ${sync.error}`);

  const leadEmail = `pm.ready.lead.${SEED_TAG}@crm-seed.test`;
  let lead = await leads.findOne({ email: leadEmail });
  let leadId: mongoose.Types.ObjectId;
  if (lead?._id) {
    leadId = lead._id as mongoose.Types.ObjectId;
    await leads.updateOne(
      { _id: leadId },
      {
        $set: {
          clientId,
          notes: `Seed lead for PM + Tasks live test (${SEED_TAG}). Prefer this lead for Create PM.`,
          updatedAt: now,
        },
      },
    );
  } else {
    const inserted = await leads.insertOne({
      firstName: 'PM',
      lastName: `Ready ${ts}`,
      email: leadEmail,
      mobileNo: '+919700001112',
      status: 'New',
      stage: 'New',
      callStatus: 'Not Called',
      module: '2Bigha',
      leadType: 'standard',
      leadVertical: 'property_listing',
      leadCategory: 'Owner lead',
      clientId,
      converted: false,
      additionalEmails: [],
      invalidEmails: [],
      isDeleted: false,
      twobighaSyncStatus: 'skipped',
      notes: `Seed lead for PM + Tasks live test (${SEED_TAG}). Prefer this lead for Create PM.`,
      customFields: { seedTag: SEED_TAG },
      createdAt: now,
      updatedAt: now,
    });
    leadId = inserted.insertedId;
  }
  await clients.updateOne({ _id: clientId }, { $addToSet: { associatedLeads: leadId } });
  console.log(`Lead: PM Ready (${leadId}) → /crm/leads/${leadId}`);

  // Prefer existing PM listing if present
  const listings = conn.collection('propertylistings');
  const pmListing =
    (await listings.findOne({ listingBucket: 'pm', isDeleted: { $ne: true } })) ||
    (await listings.findOne({ listingBucket: 'pm' }));
  const pmListingId = pmListing?._id ? String(pmListing._id) : undefined;
  if (pmListingId) {
    console.log(`Existing PM listing: ${pmListing?.title || pmListingId} (${pmListingId})`);
  }

  // --- Sample tasks (wipe previous seed tasks with same tag) ---
  await activities.deleteMany({ 'metadata.seedTag': SEED_TAG, type: 'Task' });

  const day = 24 * 60 * 60 * 1000;
  const taskSpecs: Array<{
    title: string;
    status: string;
    priority: string;
    dueOffsetDays: number | null;
    assignee: mongoose.Types.ObjectId;
    relatedType?: string;
    relatedTo?: mongoose.Types.ObjectId;
    checklistDone?: number;
  }> = [
    {
      title: '[Seed] Call owner — confirm documents',
      status: 'Open',
      priority: 'High',
      dueOffsetDays: 2,
      assignee: staffIds.rm,
      relatedType: 'Lead',
      relatedTo: leadId,
      checklistDone: 0,
    },
    {
      title: '[Seed] Prepare legal packet',
      status: 'In Progress',
      priority: 'Medium',
      dueOffsetDays: 1,
      assignee: staffIds.legal,
      relatedType: 'Lead',
      relatedTo: leadId,
      checklistDone: 1,
    },
    {
      title: '[Seed] Site photos follow-up',
      status: 'Done',
      priority: 'Low',
      dueOffsetDays: -1,
      assignee: staffIds.field,
      relatedType: 'Lead',
      relatedTo: leadId,
      checklistDone: 3,
    },
    {
      title: '[Seed] Overdue — confirm visit slot',
      status: 'Open',
      priority: 'Urgent',
      dueOffsetDays: -3,
      assignee: staffIds.field,
      relatedType: pmListingId ? 'PropertyListing' : 'Lead',
      relatedTo: pmListingId
        ? new mongoose.Types.ObjectId(pmListingId)
        : leadId,
      checklistDone: 0,
    },
    {
      title: '[Seed] Standalone board task (no related)',
      status: 'Open',
      priority: 'Medium',
      dueOffsetDays: 5,
      assignee: adminId,
      checklistDone: 0,
    },
  ];

  const checklistBase = [
    'Gather owner KYC',
    'Confirm maps pin',
    'Upload docs to listing',
  ];

  for (const t of taskSpecs) {
    const due =
      t.dueOffsetDays == null ? undefined : new Date(Date.now() + t.dueOffsetDays * day);
    const checklist = checklistBase.map((title, i) => ({
      id: `seed-${i + 1}`,
      title,
      done: i < (t.checklistDone || 0),
    }));
    await activities.insertOne({
      type: 'Task',
      title: t.title,
      content: `${t.title} — seeded for live QA (${SEED_TAG})`,
      relatedTo: t.relatedTo,
      relatedType: t.relatedType,
      author: adminId,
      assignee: t.assignee,
      status: t.status,
      metadata: {
        seedTag: SEED_TAG,
        priority: t.priority,
        dueDate: due ? due.toISOString() : undefined,
        checklist,
        comments: [
          {
            id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            body: 'Seed comment — open detail to add more.',
            authorName: 'Seed script',
            createdAt: now.toISOString(),
          },
        ],
        activityLog: [
          {
            at: now.toISOString(),
            action: 'created',
            detail: 'Seeded by seed-pm-tasks-test',
            byName: 'Seed script',
          },
        ],
        assigneeSource: 'crm',
        assigneeName: (() => {
          if (t.assignee.equals(adminId)) return 'System Admin';
          const key = Object.entries(staffIds).find(([, id]) => id.equals(t.assignee))?.[0];
          const def = STAFF.find((s) => s.key === key);
          return def ? `${def.firstName} ${def.lastName}` : 'Seed assignee';
        })(),
      },
      involvedEntities: t.relatedTo
        ? [{ id: t.relatedTo, type: t.relatedType || 'Lead' }]
        : [],
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`Inserted ${taskSpecs.length} sample Task activities (tag=${SEED_TAG}).`);

  console.log('\n========== LIVE TEST CHEAT SHEET ==========');
  console.log('Restart API + portal, then log in as:');
  console.log(`  admin@2bigha.com  (or admin@mathionix.com)`);
  console.log(`Staff logins (optional): password = ${STAFF_PASSWORD}`);
  for (const s of STAFF) {
    console.log(`  ${s.email}  (${s.firstName} ${s.lastName} · ${s.role})`);
  }
  console.log('\nA) Task board only');
  console.log('  Open: /crm/tasks');
  console.log('  Expect seeded tasks titled [Seed] … in List / Board / Calendar.');
  console.log('  Create Task → Assignee should list Seed RM/Legal/Field + 2bigha group.');
  console.log('\nB) PM → Tasks (full flow)');
  console.log(`  Open lead: /crm/leads/${leadId}`);
  console.log('  Right panel → Property Management → Create PM (pay first if no credit).');
  console.log('  Assign RM (prefer staging Arjun Mehta) → then Legal → Field.');
  console.log('  Confirm auto tasks on /crm/tasks.');
  if (pmListingId) {
    console.log(`  Existing PM listing already available: /crm/listings/${pmListingId} (or open from lead panel)`);
    console.log(`  Listing id: ${pmListingId}`);
  }
  console.log('\nAlso usable linked leads already in DB:');
  console.log('  Demo Lead 1788257584144 (client has twobighaUserId)');
  console.log('  test lead / testlead012@gmail.com → listing "residentail jaipur land"');
  console.log('===========================================\n');

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

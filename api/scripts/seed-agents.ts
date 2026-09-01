import * as mongoose from 'mongoose';

const TARGET_URI =
  process.env.TARGET_MONGO_URI ||
  process.env.MONGO_URI_CRM ||
  process.env.MONGO_URI ||
  'mongodb+srv://crm_admin:password%40123@cluster0.bmiprft.mongodb.net/mathionix-crm?retryWrites=true&w=majority&appName=Cluster0';

const AGENTS = [
  {
    name: 'Agent X',
    email: 'agent.x@mathionix.com',
    firstName: 'Agent',
    lastName: 'X',
    crmUserId: '6a8fff612d872ee7ba7d8e22',
    suiteUserId: '6a8fff612d872ee7ba7d8e23',
    passwordHash: '$2b$10$2kyCJ7hdcDLuWhyy7zPATusEZDsy6WERbo0JpuZ7L8gXXkYoTHnLi',
    role: 'Employee',
    crmPermissions: [
      'dashboard:read',
      'workspace:read',
      'workspace-work:read',
      'workspace-summary:read',
      'workspace-prospecting:read',
      'workspace-growth:read',
      'workspace-calls:read',
      'workspace-calendar:read',
      'inbox:read',
      'inbox:write',
      'leads:read',
      'contacts:read',
    ],
    suitePermissions: [
      'dashboard:read',
      'workspace:read',
      'workspace-work:read',
      'workspace-summary:read',
      'workspace-prospecting:read',
      'workspace-growth:read',
      'workspace-calls:read',
      'workspace-calendar:read',
      'inbox:read',
      'inbox:write',
      'leads:read',
      'contacts:read',
      'leaves:read',
      'leaves:create',
      'leaves:edit',
      'announcements:read',
      'holidays:read',
      'timesheets:read',
      'expenses:read',
      'sops:read',
    ],
    permittedTools: ['CRM'],
    accessVersion: 2,
  },
  {
    name: 'Agent Y',
    email: 'agent.y@mathionix.com',
    firstName: 'Agent',
    lastName: 'Y',
    crmUserId: '6a8fff612d872ee7ba7d8e24',
    suiteUserId: '6a8fff612d872ee7ba7d8e25',
    passwordHash: '$2b$10$2kyCJ7hdcDLuWhyy7zPATusEZDsy6WERbo0JpuZ7L8gXXkYoTHnLi',
    role: 'Employee',
    crmPermissions: [
      'dashboard:read',
      'workspace:read',
      'workspace-work:read',
      'workspace-summary:read',
      'workspace-prospecting:read',
      'workspace-growth:read',
      'workspace-calls:read',
      'workspace-calendar:read',
      'inbox:read',
      'inbox:write',
      'leads:read',
      'contacts:read',
    ],
    suitePermissions: [
      'dashboard:read',
      'workspace:read',
      'workspace-work:read',
      'workspace-summary:read',
      'workspace-prospecting:read',
      'workspace-growth:read',
      'workspace-calls:read',
      'workspace-calendar:read',
      'inbox:read',
      'inbox:write',
      'leads:read',
      'contacts:read',
      'leaves:read',
      'leaves:create',
      'leaves:edit',
      'announcements:read',
      'holidays:read',
      'timesheets:read',
      'expenses:read',
      'sops:read',
    ],
    permittedTools: ['CRM'],
    accessVersion: 1,
  },
];

async function seedAgents() {
  console.log(`Connecting to target MongoDB at ${TARGET_URI.replace(/:([^@]+)@/, ':****@')} ...`);
  const conn = mongoose.createConnection(TARGET_URI);
  await conn.asPromise();

  try {
    const db = conn.db;
    if (!db) throw new Error('Database connection failed');

    const usersCol = db.collection('users');
    const crmUsersCol = db.collection('crmusers');

    for (const agent of AGENTS) {
      console.log(`\n--- Seeding ${agent.name} (${agent.email}) ---`);

      // 1. Seed into crmusers collection
      const crmUserDoc = {
        _id: new mongoose.Types.ObjectId(agent.crmUserId),
        email: agent.email,
        password: agent.passwordHash,
        firstName: agent.firstName,
        lastName: agent.lastName,
        role: agent.role,
        permissions: agent.crmPermissions,
        isActive: true,
        accessibleEmailAccounts: [],
        updatedAt: new Date(),
      };

      const crmRes = await crmUsersCol.updateOne(
        { email: agent.email },
        {
          $set: crmUserDoc,
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
      console.log(
        `[crmusers] Upserted ${agent.email}: matched=${crmRes.matchedCount}, modified=${crmRes.modifiedCount}, upsertedId=${crmRes.upsertedId || 'none'}`,
      );

      // 2. Seed into users collection (Suite authentication)
      const suiteUserDoc = {
        _id: new mongoose.Types.ObjectId(agent.suiteUserId),
        email: agent.email,
        password: agent.passwordHash,
        firstName: agent.firstName,
        lastName: agent.lastName,
        role: agent.role,
        permittedTools: agent.permittedTools,
        crmPermissions: agent.crmPermissions,
        permissions: agent.suitePermissions,
        useRoleOverrides: true,
        isActive: true,
        accessVersion: agent.accessVersion,
        tokenVersion: 0,
        updatedAt: new Date(),
      };

      const suiteRes = await usersCol.updateOne(
        { email: agent.email },
        {
          $set: suiteUserDoc,
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
      console.log(
        `[users] Upserted ${agent.email}: matched=${suiteRes.matchedCount}, modified=${suiteRes.modifiedCount}, upsertedId=${suiteRes.upsertedId || 'none'}`,
      );
    }

    console.log('\n✅ Successfully seeded Agent X and Agent Y into the database!');
  } finally {
    await conn.close();
  }
}

seedAgents()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  });

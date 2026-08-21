/**
 * Seeds the 9 roles from the RBAC/workspace-isolation requirement doc:
 *   2Bigha: Super Admin, Team Lead/Manager, Calling Agent, Social Media Executive, Property Approval Team
 *   Property Management: Team Lead, Calling Agent
 *   Legal: Legal Executive, Legal Team Lead
 *
 * Idempotent — upserts by `name`, safe to re-run after adjusting permission sets below.
 * Run with: npx ts-node --transpile-only scripts/seed-workspace-roles.ts
 */
import * as mongoose from 'mongoose';

const LOCAL_MONGO_URI_HRMS = 'mongodb://127.0.0.1:27017/hrms';

type SeedRole = {
  name: string;
  description: string;
  module: '2Bigha' | 'PROPERTY_MGMT' | 'LEGAL' | 'ALL';
  crmPermissions: string[];
};

const ROLES: SeedRole[] = [
  {
    name: 'Super Admin',
    description: 'Unrestricted access across every workspace.',
    module: 'ALL',
    crmPermissions: ['admin:manage'],
  },
  {
    name: 'Team Lead/Manager',
    description: '2Bigha workspace — sees and manages only their own team, not the whole workspace.',
    module: '2Bigha',
    crmPermissions: [
      'leads:read', 'leads:read:team', 'leads:write', 'leads:delete', 'leads:move_pipeline',
      'deals:read', 'deals:read:team', 'deals:write', 'deals:move_pipeline',
      'contacts:read', 'contacts:read:team', 'contacts:write',
    ],
  },
  {
    name: 'Calling Agent',
    description: '2Bigha workspace — sees only their own assigned leads/deals/contacts.',
    module: '2Bigha',
    crmPermissions: [
      'leads:read', 'leads:write', 'leads:move_pipeline',
      'deals:read', 'deals:write',
      'contacts:read', 'contacts:write',
    ],
  },
  {
    name: 'Social Media Executive',
    description: '2Bigha workspace — uploads/assigns social-sourced leads to BDM/BDE.',
    module: '2Bigha',
    crmPermissions: ['leads:read', 'leads:write'],
  },
  {
    name: 'Property Approval Team',
    description: '2Bigha workspace — reviews and approves/rejects listed properties.',
    module: '2Bigha',
    crmPermissions: ['leads:read', 'property_listings:read', 'property_listings:write'],
  },
  {
    name: 'Team Lead (PM)',
    description: 'Property Management workspace — sees and manages only their own team.',
    module: 'PROPERTY_MGMT',
    crmPermissions: ['leads:read', 'leads:read:team', 'leads:write', 'leads:delete'],
  },
  {
    name: 'Calling Agent (PM)',
    description: 'Property Management workspace — sees only their own assigned leads.',
    module: 'PROPERTY_MGMT',
    crmPermissions: ['leads:read', 'leads:write'],
  },
  {
    name: 'Legal Executive',
    description: 'Legal workspace — handles their own assigned cases.',
    module: 'LEGAL',
    crmPermissions: ['legal:read', 'legal:write'],
  },
  {
    name: 'Legal Team Lead',
    description: 'Legal workspace — sees and manages only their own team.',
    module: 'LEGAL',
    crmPermissions: ['legal:read', 'legal:write', 'legal:delete', 'legal:move_pipeline'],
  },
];

async function seed() {
  console.log('Connecting to MongoDB (HRMS — where UserRole lives)...');
  const conn = mongoose.createConnection(process.env.MONGO_URI_HRMS || LOCAL_MONGO_URI_HRMS);
  await conn.asPromise();

  const UserRoleModel = conn.model(
    'UserRole',
    new mongoose.Schema({}, { strict: false, collection: 'userroles' }),
  );

  try {
    for (const role of ROLES) {
      const existing = await UserRoleModel.findOne({ name: role.name }).lean().exec();
      if (existing) {
        await UserRoleModel.updateOne(
          { name: role.name },
          {
            $set: {
              description: role.description,
              module: role.module,
              crmPermissions: role.crmPermissions,
              isActive: true,
            },
          },
        ).exec();
        console.log(`Updated role: ${role.name}`);
      } else {
        await UserRoleModel.create({
          name: role.name,
          description: role.description,
          module: role.module,
          isActive: true,
          permissions: [],
          crmPermissions: role.crmPermissions,
          pmPermissions: [],
          permittedTools: [],
          dataScopes: [],
          fieldPermissions: [],
        });
        console.log(`Created role: ${role.name}`);
      }
    }
    console.log(`Done — ${ROLES.length} roles seeded.`);
  } finally {
    await conn.close();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });

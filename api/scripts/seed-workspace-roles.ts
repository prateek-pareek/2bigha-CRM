/**
 * Seeds the 9 roles from the RBAC/workspace-isolation requirement doc into the
 * system that actually drives login/`RbacGuard` enforcement — `Role`/`Permission`
 * (crmConnection, `api/src/crm/crm-users/`) — NOT the `UserRole` collection (that one
 * only feeds permission *strings* into the JWT; it has no workspace concept `RbacGuard`
 * reads). See `api/src/crm/crm-users/schemas/role.schema.ts`'s `workspaceModule` field.
 *
 *   2Bigha: Super Admin, Team Lead/Manager, Calling Agent, Social Media Executive, Property Approval Team
 *   Property Management: Team Lead (PM), Calling Agent (PM)
 *   Legal: Legal Executive, Legal Team Lead
 *
 * Idempotent — upserts Permissions by `name` and Roles by `name`.
 * Run with: npx ts-node --transpile-only scripts/seed-workspace-roles.ts
 */
import * as mongoose from 'mongoose';

const LOCAL_MONGO_URI_CRM = 'mongodb://127.0.0.1:27017/crm';

type SeedRole = {
  name: string;
  description: string;
  workspaceModule: '2Bigha' | 'PROPERTY_MGMT' | 'LEGAL' | 'ALL';
  permissionNames: string[];
};

const PERMISSIONS: Array<{ name: string; description: string }> = [
  { name: 'admin:manage', description: 'Full unrestricted CRM access (Super Admin bypass)' },
  { name: 'leads:read', description: 'View leads' },
  { name: 'leads:read:team', description: "View leads owned by your team (self + direct reports)" },
  { name: 'leads:read:all', description: 'View every lead in the workspace' },
  { name: 'leads:write', description: 'Create and edit leads' },
  { name: 'leads:delete', description: 'Remove leads' },
  { name: 'leads:move_pipeline', description: 'Move leads between pipelines' },
  { name: 'contacts:read', description: 'View contacts' },
  { name: 'contacts:read:team', description: 'View contacts owned by your team' },
  { name: 'contacts:write', description: 'Create and edit contacts' },
  { name: 'legal:read', description: 'View legal cases' },
  { name: 'legal:write', description: 'Create and edit legal cases' },
  { name: 'legal:delete', description: 'Remove legal cases' },
  { name: 'legal:move_pipeline', description: 'Move legal cases between pipelines' },
  { name: 'property_listings:read', description: 'View property listings' },
  { name: 'property_listings:write', description: 'Create, edit, approve, or reject property listings' },
];

const ROLES: SeedRole[] = [
  {
    name: 'Super Admin',
    description: 'Unrestricted access across every workspace.',
    workspaceModule: 'ALL',
    permissionNames: ['admin:manage'],
  },
  {
    name: 'Team Lead/Manager',
    description: '2Bigha workspace — sees and manages only their own team, not the whole workspace.',
    workspaceModule: '2Bigha',
    permissionNames: [
      'leads:read', 'leads:read:team', 'leads:write', 'leads:delete', 'leads:move_pipeline',
      'contacts:read', 'contacts:read:team', 'contacts:write',
    ],
  },
  {
    name: 'Calling Agent',
    description: '2Bigha workspace — sees only their own assigned leads/contacts.',
    workspaceModule: '2Bigha',
    permissionNames: [
      'leads:read', 'leads:write', 'leads:move_pipeline',
      'contacts:read', 'contacts:write',
    ],
  },
  {
    name: 'Social Media Executive',
    description: '2Bigha workspace — uploads/assigns social-sourced leads to BDM/BDE.',
    workspaceModule: '2Bigha',
    permissionNames: ['leads:read', 'leads:write'],
  },
  {
    name: 'Property Approval Team',
    description: '2Bigha workspace — reviews and approves/rejects listed properties.',
    workspaceModule: '2Bigha',
    permissionNames: ['leads:read', 'property_listings:read', 'property_listings:write'],
  },
  {
    name: 'Team Lead (PM)',
    description: 'Property Management workspace — sees and manages only their own team.',
    workspaceModule: 'PROPERTY_MGMT',
    permissionNames: ['leads:read', 'leads:read:team', 'leads:write', 'leads:delete'],
  },
  {
    name: 'Calling Agent (PM)',
    description: 'Property Management workspace — sees only their own assigned leads.',
    workspaceModule: 'PROPERTY_MGMT',
    permissionNames: ['leads:read', 'leads:write'],
  },
  {
    name: 'Legal Executive',
    description: 'Legal workspace — handles their own assigned cases.',
    workspaceModule: 'LEGAL',
    permissionNames: ['legal:read', 'legal:write'],
  },
  {
    name: 'Legal Team Lead',
    description: 'Legal workspace — sees and manages only their own team.',
    workspaceModule: 'LEGAL',
    permissionNames: ['legal:read', 'legal:write', 'legal:delete', 'legal:move_pipeline'],
  },
];

async function seed() {
  console.log('Connecting to MongoDB (crmConnection — where Role/Permission live)...');
  const conn = mongoose.createConnection(process.env.MONGO_URI_CRM || LOCAL_MONGO_URI_CRM);
  await conn.asPromise();

  const PermissionModel = conn.model(
    'Permission',
    new mongoose.Schema({}, { strict: false, collection: 'permissions' }),
  );
  const RoleModel = conn.model('Role', new mongoose.Schema({}, { strict: false, collection: 'roles' }));

  try {
    const permissionIdByName = new Map<string, mongoose.Types.ObjectId>();
    for (const p of PERMISSIONS) {
      const doc = await PermissionModel.findOneAndUpdate(
        { name: p.name },
        { $setOnInsert: { name: p.name, description: p.description, module: 'crm' } },
        { upsert: true, new: true },
      ).exec();
      permissionIdByName.set(p.name, doc._id as mongoose.Types.ObjectId);
    }
    console.log(`Ensured ${PERMISSIONS.length} permissions exist.`);

    for (const role of ROLES) {
      const permissionIds = role.permissionNames
        .map((n) => permissionIdByName.get(n))
        .filter((id): id is mongoose.Types.ObjectId => !!id);

      const existing = await RoleModel.findOne({ name: role.name }).lean().exec();
      if (existing) {
        await RoleModel.updateOne(
          { name: role.name },
          {
            $set: {
              description: role.description,
              workspaceModule: role.workspaceModule,
              permissions: permissionIds,
            },
          },
        ).exec();
        console.log(`Updated role: ${role.name}`);
      } else {
        await RoleModel.create({
          name: role.name,
          description: role.description,
          workspaceModule: role.workspaceModule,
          permissions: permissionIds,
          isSystem: false,
        });
        console.log(`Created role: ${role.name}`);
      }
    }
    console.log(`Done — ${ROLES.length} roles seeded into the live (Role/Permission) system.`);
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

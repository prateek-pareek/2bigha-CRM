/**
 * Seed company CRM roles + permissions for 2bigha.
 * Safe to re-run (upsert by role/permission name).
 *
 * Usage (from api/):
 *   npx ts-node --transpile-only src/seed-crm-roles.ts
 */
import * as mongoose from 'mongoose';

const LOCAL_MONGO_URI_CRM = 'mongodb://127.0.0.1:27017/mathionix-crm';

const ACTIONS = ['read', 'write', 'edit', 'delete'] as const;

/** Core CRM modules used by portal RBAC / team management. */
const MODULES = [
  'dashboard',
  'workspace',
  'workspace-admin',
  'workspace-team',
  'workspace-agent',
  'workspace-work',
  'workspace-summary',
  'workspace-prospecting',
  'workspace-growth',
  'workspace-calls',
  'workspace-calendar',
  'reports',
  'reports-overview',
  'reports-leads',
  'leads',
  'legal',
  'clients',
  'contacts',
  'organizations',
  'activities',
  'inbox',
  'outreach',
  'workflows',
  'proposals',
  'services',
  'settings',
] as const;

const EXTRA_PERMS: Array<{ name: string; module: string; description: string }> = [
  { name: 'settings:admin', module: 'settings', description: 'CRM admin settings / user grants' },
  { name: 'admin:manage', module: 'Users', description: 'Full administrative RBAC bypass' },
  { name: 'leads:move_pipeline', module: 'crm', description: 'Move leads across pipelines' },
  { name: 'legal:move_pipeline', module: 'crm', description: 'Move legal cases across pipelines' },
  { name: 'leads:read:team', module: 'leads', description: 'View team leads' },
  { name: 'leads:read:all', module: 'leads', description: 'View all leads' },
  { name: 'clients:read:team', module: 'clients', description: 'View team clients' },
  { name: 'clients:read:all', module: 'clients', description: 'View all clients' },
  { name: 'contacts:read:team', module: 'contacts', description: 'View team contacts' },
  { name: 'contacts:read:all', module: 'contacts', description: 'View all contacts' },
  { name: 'legal:read', module: 'crm', description: 'View legal cases' },
  { name: 'legal:write', module: 'crm', description: 'Create/update legal cases' },
  { name: 'legal:delete', module: 'crm', description: 'Delete legal cases' },
];

function modulePerms(
  modules: string[],
  actions: readonly string[] = ACTIONS,
): string[] {
  const out: string[] = [];
  for (const m of modules) {
    for (const a of actions) out.push(`${m}:${a}`);
  }
  return out;
}

type RoleSeed = {
  name: string;
  description: string;
  isSystem?: boolean;
  workspaceModule?: '2Bigha' | 'PROPERTY_MGMT' | 'LEGAL' | 'ALL';
  permissions: string[];
};

const SALES_CORE = [
  'dashboard',
  'workspace',
  'workspace-work',
  'workspace-summary',
  'workspace-prospecting',
  'workspace-calls',
  'workspace-calendar',
  'leads',
  'contacts',
  'clients',
  'organizations',
  'activities',
  'inbox',
  'proposals',
];

/** Agent / Team Lead must NOT get `dashboard:read` — that key routes them to the Admin dashboard. */
const SALES_CORE_NO_DASH = SALES_CORE.filter((m) => m !== 'dashboard');

const COMPANY_ROLES: RoleSeed[] = [
  {
    name: 'Admin',
    description: 'Full CRM access — settings, users, all records',
    isSystem: true,
    workspaceModule: 'ALL',
    permissions: [
      ...modulePerms([...MODULES]),
      ...EXTRA_PERMS.map((p) => p.name),
    ],
  },
  {
    name: 'Manager',
    description: 'Sales manager — all-team visibility, pipeline moves, no user admin',
    workspaceModule: '2Bigha',
    permissions: [
      ...modulePerms(SALES_CORE),
      ...modulePerms(['reports', 'reports-overview', 'reports-leads', 'outreach', 'workflows'], [
        'read',
        'write',
        'edit',
      ]),
      'leads:read:all',
      'clients:read:all',
      'contacts:read:all',
      'leads:move_pipeline',
      'settings:read',
    ],
  },
  {
    name: 'Team Lead',
    description: 'Team lead — own + direct reports scope',
    workspaceModule: '2Bigha',
    permissions: [
      ...modulePerms(SALES_CORE_NO_DASH),
      'workspace-team:read',
      ...modulePerms(['reports', 'reports-overview', 'reports-leads'], ['read']),
      'leads:read:team',
      'clients:read:team',
      'contacts:read:team',
      'leads:move_pipeline',
    ],
  },
  {
    name: 'Agent',
    description: 'Sales agent — own leads, tasks, calls, inbox',
    workspaceModule: '2Bigha',
    permissions: [
      ...modulePerms(
        [
          'workspace',
          'workspace-work',
          'workspace-prospecting',
          'workspace-calls',
          'workspace-calendar',
          'leads',
          'contacts',
          'clients',
          'activities',
          'inbox',
          'proposals',
        ],
        ['read', 'write', 'edit'],
      ),
      'workspace-agent:read',
      'organizations:read',
    ],
  },
  {
    name: 'BDM',
    description: 'Business Development Manager — broad sales + reports',
    workspaceModule: '2Bigha',
    permissions: [
      ...modulePerms(SALES_CORE),
      ...modulePerms(['reports', 'reports-overview', 'reports-leads', 'outreach'], [
        'read',
        'write',
        'edit',
      ]),
      'leads:read:all',
      'clients:read:all',
      'contacts:read:all',
      'leads:move_pipeline',
    ],
  },
  {
    name: 'BDE',
    description: 'Business Development Executive — field / acquisition focus',
    workspaceModule: '2Bigha',
    permissions: [
      ...modulePerms(
        [
          'dashboard',
          'workspace',
          'workspace-prospecting',
          'workspace-calls',
          'workspace-calendar',
          'leads',
          'contacts',
          'clients',
          'activities',
          'inbox',
        ],
        ['read', 'write', 'edit'],
      ),
      'leads:read:team',
      'organizations:read',
      'proposals:read',
      'proposals:write',
    ],
  },
  {
    name: 'Social Media',
    description: 'Social / outreach — campaigns, inbox, light lead access',
    workspaceModule: '2Bigha',
    permissions: [
      ...modulePerms(
        ['dashboard', 'workspace', 'outreach', 'inbox', 'activities', 'contacts'],
        ['read', 'write', 'edit'],
      ),
      'leads:read',
      'leads:write',
      'leads:edit',
      'clients:read',
      'organizations:read',
    ],
  },
  {
    name: 'Legal',
    description: 'Legal workspace — cases and related records',
    workspaceModule: 'LEGAL',
    permissions: [
      ...modulePerms(['dashboard', 'workspace', 'legal', 'activities', 'contacts'], [
        'read',
        'write',
        'edit',
      ]),
      'legal:read',
      'legal:write',
      'legal:move_pipeline',
      'clients:read',
      'leads:read',
      'organizations:read',
      'inbox:read',
    ],
  },
  {
    name: 'Property Management',
    description: 'Property / PM-facing CRM access',
    workspaceModule: 'PROPERTY_MGMT',
    permissions: [
      ...modulePerms(
        ['dashboard', 'workspace', 'clients', 'contacts', 'organizations', 'activities', 'inbox'],
        ['read', 'write', 'edit'],
      ),
      'leads:read',
      'leads:edit',
      'proposals:read',
    ],
  },
];

async function seed() {
  const uri = process.env.MONGO_URI_CRM || process.env.MONGO_URI || LOCAL_MONGO_URI_CRM;
  console.log(`Connecting to ${uri} ...`);
  const conn = mongoose.createConnection(uri);
  await conn.asPromise();

  try {
    const permissionSchema = new mongoose.Schema(
      {
        name: { type: String, required: true, unique: true },
        description: String,
        module: { type: String, required: true },
      },
      { timestamps: true },
    );
    const roleSchema = new mongoose.Schema(
      {
        name: { type: String, required: true, unique: true },
        description: String,
        permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
        isSystem: { type: Boolean, default: false },
        workspaceModule: { type: String, default: 'ALL' },
      },
      { timestamps: true },
    );

    const PermissionModel = conn.model('Permission', permissionSchema);
    const RoleModel = conn.model('Role', roleSchema);

    const permNameToId = new Map<string, mongoose.Types.ObjectId>();

    const ensurePerm = async (name: string, module: string, description: string) => {
      const doc = await PermissionModel.findOneAndUpdate(
        { name },
        {
          $set: { module, description },
          $setOnInsert: { name },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!doc) throw new Error(`Failed to upsert permission ${name}`);
      permNameToId.set(name, doc._id as mongoose.Types.ObjectId);
      return doc._id as mongoose.Types.ObjectId;
    };

    console.log('Seeding permissions...');
    for (const m of MODULES) {
      for (const a of ACTIONS) {
        await ensurePerm(`${m}:${a}`, m, `${m} ${a}`);
      }
    }
    for (const p of EXTRA_PERMS) {
      await ensurePerm(p.name, p.module, p.description);
    }

    console.log('Seeding company roles...');
    for (const role of COMPANY_ROLES) {
      const uniquePerms = Array.from(new Set(role.permissions));
      const ids: mongoose.Types.ObjectId[] = [];
      for (const name of uniquePerms) {
        let id = permNameToId.get(name);
        if (!id) {
          const [mod] = name.split(':');
          id = await ensurePerm(name, mod || 'crm', name);
        }
        ids.push(id);
      }

      await RoleModel.findOneAndUpdate(
        { name: role.name },
        {
          $set: {
            description: role.description,
            permissions: ids,
            isSystem: !!role.isSystem,
            workspaceModule: role.workspaceModule || 'ALL',
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      console.log(`  ✓ ${role.name} (${ids.length} permissions)`);
    }

    const roles = await RoleModel.find({}, { name: 1, description: 1 }).sort({ name: 1 }).lean();
    console.log('\n✅ CRM roles ready:');
    for (const r of roles) {
      console.log(`  - ${r.name}: ${r.description || ''}`);
    }
  } finally {
    await conn.close();
  }
}

export async function seedCrmRoles(): Promise<void> {
  await seed();
}

const invokedDirectly = /seed-crm-roles/.test(process.argv[1] || '');
if (invokedDirectly) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Role seed failed:', err);
      process.exit(1);
    });
}

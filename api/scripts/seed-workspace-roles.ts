/**
 * Seeds the functional CRM roles from the requirement doc ("Roles Overview") — the same
 * upsert the API runs on boot in `CRMUsersService.seedFunctionalRoles`
 * (api/src/crm/crm-users/crm-users.service.ts). Definitions: src/crm/shared/crm-role-catalog.ts.
 *
 *   2Bigha: Super Admin, Team Lead / Manager, Calling Agent, Social Media Executive, Property Approval Team
 *   PM:     Team Lead / Manager (PM), Calling Agent (PM)
 *   Legal:  Legal Executive, Legal Team Lead
 *
 * Grants are stored as `Permission` refs (this codebase's role model, see src/seed-crm-roles.ts).
 * Idempotent: matches by `seedKey` then `name`; rewrites a role only when its stored
 * `seedVersion` is behind CRM_ROLE_SEED_VERSION.
 *
 * Run with: npm run seed:workspace-roles   (reads MONGO_URI_CRM from api/.env — no fallback,
 * so it can never silently write to the wrong database)
 */
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  CRM_FUNCTIONAL_PERMISSIONS,
  CRM_ROLE_SEED_VERSION,
  CRM_ROLE_SEEDS,
} from '../src/crm/shared/crm-role-catalog';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function seed() {
  const uri = process.env.MONGO_URI_CRM;
  if (!uri) throw new Error('MONGO_URI_CRM is not set — see api/.env');
  console.log(`Connecting to ${uri.replace(/\/\/[^@]*@/, '//***@')} ...`);
  const conn = mongoose.createConnection(uri);
  await conn.asPromise();

  const Permission = conn.model('Permission', new mongoose.Schema({}, { strict: false, collection: 'permissions' }));
  const Role = conn.model('Role', new mongoose.Schema({}, { strict: false, collection: 'roles', timestamps: true }));

  const permId = async (name: string, description?: string) => {
    const doc: any = await Permission.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, module: name.split(':')[0] || 'crm', description: description || name } },
      { upsert: true, returnDocument: 'after' },
    ).lean().exec();
    return doc._id as mongoose.Types.ObjectId;
  };

  try {
    for (const p of CRM_FUNCTIONAL_PERMISSIONS) await permId(p.name, p.description);

    for (const s of CRM_ROLE_SEEDS) {
      const existing: any = await Role.findOne({ $or: [{ seedKey: s.key }, { name: s.name }] }).lean().exec();
      if (existing && (existing.seedVersion || 0) >= CRM_ROLE_SEED_VERSION) {
        console.log(`Kept     ${s.name}  (seed v${existing.seedVersion})`);
        continue;
      }
      const permissions: mongoose.Types.ObjectId[] = [];
      for (const name of s.crmPermissions) permissions.push(await permId(name));
      const doc = {
        description: s.description,
        workspaceModule: s.workspaceModule,
        permissions,
        crmPermissions: [],
        isActive: true,
        isSystem: true,
        seedKey: s.key,
        seedVersion: CRM_ROLE_SEED_VERSION,
      };
      if (existing) {
        await Role.updateOne({ _id: existing._id }, { $set: doc }).exec();
        console.log(`Upgraded ${s.name}  [${s.workspaceModule}]  ${permissions.length} perms`);
      } else {
        await Role.create({ name: s.name, ...doc });
        console.log(`Created  ${s.name}  [${s.workspaceModule}]  ${permissions.length} perms`);
      }
    }
    console.log(`Done — ${CRM_ROLE_SEEDS.length} roles.`);
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

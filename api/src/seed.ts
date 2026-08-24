import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

// Matches the 'crmConnection' Mongoose connection wired up in app.module.ts,
// which is where the CRMUser / Role / Permission collections live.
const LOCAL_MONGO_URI_CRM = 'mongodb://127.0.0.1:27017/mathionix-crm';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@mathionix.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
const ADMIN_FIRST_NAME = process.env.SEED_ADMIN_FIRST_NAME || 'System';
const ADMIN_LAST_NAME = process.env.SEED_ADMIN_LAST_NAME || 'Admin';

// Canonical CRM permissions (kept in sync with CANONICAL_CRM_PERMISSIONS in
// crm-users.service.ts) so the seeded Admin role owns every permission.
const CANONICAL_CRM_PERMISSIONS: Array<{ name: string; module: string; description: string }> = [
  { name: 'leads:delete', module: 'CRM', description: 'Delete leads' },
  { name: 'leads:move_pipeline', module: 'CRM', description: 'Move leads across pipeline stages' },
  { name: 'contacts:delete', module: 'CRM', description: 'Delete contacts' },
  { name: 'organizations:delete', module: 'CRM', description: 'Delete organizations' },
  { name: 'clients:delete', module: 'CRM', description: 'Delete clients' },
  { name: 'workflows:delete', module: 'CRM', description: 'Delete workflows' },
  { name: 'inbox:delete', module: 'CRM', description: 'Delete inbox items' },
  { name: 'legal:read', module: 'Legal', description: 'Read legal records' },
  { name: 'legal:write', module: 'Legal', description: 'Create/update legal records' },
  { name: 'legal:delete', module: 'Legal', description: 'Delete legal records' },
  { name: 'legal:move_pipeline', module: 'Legal', description: 'Move legal records across pipeline stages' },
  { name: 'admin:manage', module: 'Users', description: 'Full administrative access (RBAC bypass)' },
];

async function seed() {
  const uri = process.env.MONGO_URI_CRM || process.env.MONGO_URI || LOCAL_MONGO_URI_CRM;
  console.log(`Connecting to MongoDB at ${uri} ...`);
  const conn = mongoose.createConnection(uri);
  await conn.asPromise();

  try {
    const permissionSchema = new mongoose.Schema(
      { name: { type: String, required: true, unique: true }, description: String, module: { type: String, required: true } },
      { timestamps: true },
    );
    const roleSchema = new mongoose.Schema(
      {
        name: { type: String, required: true, unique: true },
        description: String,
        permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
        isSystem: { type: Boolean, default: false },
      },
      { timestamps: true },
    );
    const userSchema = new mongoose.Schema(
      {
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        firstName: String,
        lastName: String,
        roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
        role: { type: String, default: 'user' },
        permissions: { type: [String], default: [] },
        isActive: { type: Boolean, default: true },
        accessibleEmailAccounts: { type: [String], default: [] },
      },
      { timestamps: true },
    );

    const PermissionModel = conn.model('Permission', permissionSchema);
    const RoleModel = conn.model('Role', roleSchema);
    const UserModel = conn.model('CRMUser', userSchema);

    // 1. Ensure every canonical permission exists.
    console.log('Seeding permissions...');
    const permissionIds: mongoose.Types.ObjectId[] = [];
    for (const perm of CANONICAL_CRM_PERMISSIONS) {
      const doc = await PermissionModel.findOneAndUpdate(
        { name: perm.name },
        { $setOnInsert: perm },
        { upsert: true, new: true },
      );
      permissionIds.push(doc._id as mongoose.Types.ObjectId);
    }

    // 2. Ensure the system 'Admin' role exists and owns every permission.
    console.log('Seeding Admin role...');
    const adminRole = await RoleModel.findOneAndUpdate(
      { name: 'Admin' },
      {
        $set: { description: 'Full system access', isSystem: true, permissions: permissionIds },
      },
      { upsert: true, new: true },
    );

    // 3. Ensure the admin user exists with a freshly hashed password.
    console.log(`Seeding admin user (${ADMIN_EMAIL})...`);
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await UserModel.findOneAndUpdate(
      { email: ADMIN_EMAIL },
      {
        $set: {
          password: hashedPassword,
          firstName: ADMIN_FIRST_NAME,
          lastName: ADMIN_LAST_NAME,
          roleId: adminRole._id,
          role: 'Admin',
          permissions: ['admin:manage'],
          isActive: true,
        },
      },
      { upsert: true, new: true },
    );

    console.log('\n✅ Seed complete.');
    console.log('----------------------------------------');
    console.log(`Admin email:    ${ADMIN_EMAIL}`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
    console.log('----------------------------------------');
    console.log('Change this password after first login. Override defaults via');
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars.');
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

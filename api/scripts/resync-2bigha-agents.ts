/**
 * Re-sync CRM team members to 2bigha (createAdmin).
 * Run after setting TWOBIGHA_DEFAULT_AGENT_ROLE_ID in api/.env
 *
 *   npm run resync:2bigha-agents
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as mongoose from 'mongoose';
import { randomBytes } from 'crypto';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../src/crm/shared/twobigha-graphql.util';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI_CRM || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mathionix-crm';
const CRM_USERS_COLLECTION = 'crmusers';

const CREATE_ADMIN = `
  mutation CreateAdmin($input: CreateAdminInput!) {
    createAdmin(input: $input) { id }
  }
`;

const GET_ALL_ROLES = `
  query GetAllRoles {
    getAllRoles { roles { id slug } }
  }
`;

const GET_ALL_ADMINS = `
  query GetAllAdmins($filter: AdminFilterInput, $limit: Int) {
    getAllAdmins(filter: $filter, limit: $limit, offset: 0) {
      admins { id email }
    }
  }
`;

async function resolveRoleId(config: NonNullable<ReturnType<typeof getTwoBighaConfig>>): Promise<string> {
  const direct = process.env.TWOBIGHA_DEFAULT_AGENT_ROLE_ID?.trim();
  if (direct) return direct;

  const slug = (process.env.TWOBIGHA_DEFAULT_AGENT_ROLE_SLUG || 'bdm').trim().toLowerCase();
  const data = await twoBighaGraphqlRequest<{
    getAllRoles?: { roles?: Array<{ id: string; slug?: string }> };
  }>(config, GET_ALL_ROLES, {});
  const roles = data?.getAllRoles?.roles ?? [];
  const match = roles.find((r) => (r.slug || '').trim().toLowerCase() === slug);
  if (!match?.id) throw new Error(`No 2bigha role for slug "${slug}"`);
  return String(match.id);
}

async function findAdminByEmail(
  config: NonNullable<ReturnType<typeof getTwoBighaConfig>>,
  email: string,
): Promise<string | null> {
  const data = await twoBighaGraphqlRequest<{
    getAllAdmins?: { admins?: Array<{ id: string; email: string }> };
  }>(config, GET_ALL_ADMINS, { filter: { search: email }, limit: 25 });
  const needle = email.trim().toLowerCase();
  const hit = (data?.getAllAdmins?.admins ?? []).find((a) => a.email?.trim().toLowerCase() === needle);
  return hit?.id ? String(hit.id) : null;
}

async function syncUser(
  config: NonNullable<ReturnType<typeof getTwoBighaConfig>>,
  roleId: string,
  user: { _id: mongoose.Types.ObjectId; email: string; firstName?: string; lastName?: string },
) {
  try {
    const data = await twoBighaGraphqlRequest<{ createAdmin?: { id?: string } }>(config, CREATE_ADMIN, {
      input: {
        email: user.email,
        firstName: user.firstName || user.email.split('@')[0],
        lastName: user.lastName || '—',
        password: randomBytes(24).toString('base64url'),
        roleId,
      },
    });
    const id = data?.createAdmin?.id;
    if (!id) throw new Error('No admin id returned');
    return { status: 'synced' as const, twobighaAdminId: String(id), error: undefined };
  } catch (e: any) {
    const msg = e?.message || 'Unknown error';
    const existing = await findAdminByEmail(config, user.email);
    if (existing) return { status: 'synced' as const, twobighaAdminId: existing, error: undefined };
    return { status: 'failed' as const, twobighaAdminId: undefined, error: msg };
  }
}

async function main() {
  const config = getTwoBighaConfig();
  if (!config) {
    console.error('2bigha config missing — check TWOBIGHA_API_* in .env');
    process.exit(1);
  }

  const roleId = await resolveRoleId(config);
  console.log(`Using 2bigha roleId: ${roleId}`);

  const conn = await mongoose.createConnection(MONGO_URI).asPromise();
  const User = conn.collection(CRM_USERS_COLLECTION);

  const users = await User.find({
    $or: [
      { twobighaSyncStatus: { $in: ['skipped', 'failed', 'not_synced'] } },
      { twobighaSyncStatus: { $exists: false } },
      { twobighaSyncStatus: null },
    ],
  }).toArray();

  console.log(`Found ${users.length} CRM user(s) in ${CRM_USERS_COLLECTION} to sync`);

  for (const user of users) {
    const email = String(user.email || '');
    console.log(`\n→ ${email}`);
    const result = await syncUser(config, roleId, {
      _id: user._id as mongoose.Types.ObjectId,
      email,
      firstName: user.firstName as string | undefined,
      lastName: user.lastName as string | undefined,
    });
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          twobighaAdminId: result.twobighaAdminId,
          twobighaSyncStatus: result.status,
          twobighaSyncError: result.error,
          twobighaSyncedAt: new Date(),
        },
      },
    );
    console.log(`  ${result.status}${result.twobighaAdminId ? ` → ${result.twobighaAdminId}` : ''}`);
    if (result.error) console.log(`  error: ${result.error}`);
  }

  await conn.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

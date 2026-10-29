/**
 * LOCAL DEV ONLY — adds one complete 2Bigha team for testing import / assignment scope:
 * a Team Lead plus five calling agents who all `reportsTo` that lead. The lead can then
 * assign imported leads to these five (and nobody else); the agents see only their own leads.
 *
 * Needs the roles from `npm run seed:workspace-roles`. Idempotent: re-running keeps the same
 * accounts and regenerates passwords. Everything is flagged `isRoleTestUser: true`
 * (same clean-up as seed-role-test-users). Credentials go to TEAM_TEST_LOGINS.local.md
 * at the repo root (git-ignored).
 *
 * Run with: npm run seed:test-team   (refuses anything but a localhost Mongo)
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DOMAIN = '2bigha.test';
const LEAD = { local: 'team.lead', first: 'Rohan', last: 'Teamlead', roleKey: '2bigha_team_lead' };
const MEMBERS = [
  { local: 'team.member1', first: 'Aarav', last: 'Sharma' },
  { local: 'team.member2', first: 'Diya', last: 'Verma' },
  { local: 'team.member3', first: 'Kabir', last: 'Singh' },
  { local: 'team.member4', first: 'Isha', last: 'Gupta' },
  { local: 'team.member5', first: 'Vihaan', last: 'Mehta' },
].map((m) => ({ ...m, roleKey: '2bigha_calling_agent' }));

function assertLocal(uri: string) {
  const host = uri.replace(/^mongodb(\+srv)?:\/\//, '').replace(/^[^@]*@/, '').split(/[/:?]/)[0];
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
    throw new Error(`Refusing to create test logins on non-local Mongo host "${host}".`);
  }
}

const password = () => `Rt${crypto.randomBytes(9).toString('base64url')}7!`;

async function run() {
  const uri = process.env.MONGO_URI;
  const crmUri = process.env.MONGO_URI_CRM;
  if (!uri || !crmUri) throw new Error('MONGO_URI and MONGO_URI_CRM must be set in api/.env');
  assertLocal(uri);
  assertLocal(crmUri);

  const hrms = mongoose.createConnection(uri);
  const crm = crmUri === uri ? hrms : mongoose.createConnection(crmUri);
  await hrms.asPromise();
  await crm.asPromise();
  const loose = (c: string) => new mongoose.Schema({}, { strict: false, collection: c, timestamps: true });
  const User = hrms.model('User', loose('users'));
  const CrmUser = crm.model('CRMUser', loose('crmusers'));
  const Role = crm.model('Role', loose('roles'));

  const rows: string[] = [];
  const upsert = async (spec: (typeof MEMBERS)[number], reportsTo?: mongoose.Types.ObjectId) => {
    const role: any = await Role.findOne({ seedKey: spec.roleKey }).lean().exec();
    if (!role) throw new Error(`Role "${spec.roleKey}" not found — run npm run seed:workspace-roles first.`);
    const email = `${spec.local}@${DOMAIN}`;
    const pw = password();
    const hash = await bcrypt.hash(pw, 10);
    const existing: any = await User.findOne({ email }).lean().exec();
    const _id: mongoose.Types.ObjectId = existing?._id ?? new mongoose.Types.ObjectId();

    await User.updateOne(
      { _id },
      {
        $set: {
          email,
          password: hash,
          firstName: spec.first,
          lastName: spec.last,
          role: 'Employee',
          permittedTools: ['CRM'],
          useRoleOverrides: true,
          isRoleTestUser: true,
          ...(reportsTo ? { reportsTo } : {}),
        },
        $setOnInsert: {
          permissions: [],
          crmPermissions: [],
          pmProjects: [],
          pmSpaces: [],
          pmPermissions: [],
          tokenVersion: 0,
          accessVersion: 0,
          accessibleEmailAccounts: [],
          salesWorkspaceAccessibleEmployees: [],
        },
      },
      { upsert: true },
    ).exec();
    await CrmUser.updateOne(
      { email },
      {
        $set: {
          firstName: spec.first,
          lastName: spec.last,
          roleId: role._id,
          role: 'user',
          permissions: [],
          isActive: true,
          isRoleTestUser: true,
          password: hash,
        },
        $setOnInsert: { _id, email, authProvider: 'local' },
      },
      { upsert: true },
    ).exec();
    rows.push(`| ${role.name} | ${spec.first} ${spec.last} | \`${email}\` | \`${pw}\` | ${reportsTo ? `${LEAD.first} ${LEAD.last}` : '—'} |`);
    console.log(`ok  ${role.name.padEnd(24)} ${email}`);
    return _id;
  };

  try {
    const leadId = await upsert(LEAD);
    for (const m of MEMBERS) await upsert(m, leadId);
  } finally {
    await hrms.close();
    if (crm !== hrms) await crm.close();
  }

  const file = path.join(__dirname, '..', '..', 'TEAM_TEST_LOGINS.local.md');
  fs.writeFileSync(
    file,
    [
      '# 2Bigha test team logins (local dev only)',
      '',
      `Generated ${new Date().toISOString()} by \`api/scripts/seed-test-team.ts\`. Passwords change on every run. Git-ignored.`,
      '',
      'Portal: http://localhost:3001/auth/login',
      '',
      '| Role | Name | Email | Password | Reports to |',
      '|---|---|---|---|---|',
      ...rows,
      '',
      'Clean-up: delete docs with `isRoleTestUser: true` and email `team.*@2bigha.test` from `users` and `crmusers`.',
      '',
    ].join('\n'),
  );
  console.log(`\nCredentials written to ${file}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message || err);
    process.exit(1);
  });

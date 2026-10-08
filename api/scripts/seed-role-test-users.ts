/**
 * LOCAL DEV ONLY — creates one login per functional CRM role (crm-role-catalog.ts) so each
 * role's view can be checked end to end.
 *
 * For every role it upserts:
 *   - an HRMS `users` doc (the login identity; bcrypt password, CRM tool enabled)
 *   - a `crmusers` doc with the same _id, `roleId` → the seeded role
 * and wires `reportsTo` so team scope is testable:
 *   2Bigha agent + Social Media → 2Bigha Team Lead, PM agent → PM Team Lead,
 *   Legal Executive → Legal Team Lead.
 *
 * Passwords are random and regenerated on every run; they are written to
 * ROLE_TEST_LOGINS.local.md at the repo root (git-ignored). All docs carry
 * `isRoleTestUser: true` for clean-up.
 *
 * Run with: npm run seed:role-test-users   (refuses anything but a localhost Mongo)
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { CRM_ROLE_SEEDS } from '../src/crm/shared/crm-role-catalog';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DOMAIN = '2bigha.test';

/** seedKey → login local-part, display name, and the seedKey of the lead they report to. */
const USERS: Record<string, { local: string; first: string; last: string; reportsTo?: string }> = {
  super_admin: { local: 'superadmin', first: 'Super', last: 'Admin' },
  '2bigha_team_lead': { local: 'tl.2bigha', first: 'Tara', last: 'Lead2Bigha' },
  '2bigha_calling_agent': { local: 'agent.2bigha', first: 'Arjun', last: 'Agent2Bigha', reportsTo: '2bigha_team_lead' },
  '2bigha_social_media': { local: 'social', first: 'Sana', last: 'Social', reportsTo: '2bigha_team_lead' },
  '2bigha_property_approval': { local: 'approval', first: 'Pranav', last: 'Approval' },
  pm_team_lead: { local: 'tl.pm', first: 'Meera', last: 'LeadPM' },
  pm_calling_agent: { local: 'agent.pm', first: 'Kabir', last: 'AgentPM', reportsTo: 'pm_team_lead' },
  legal_executive: { local: 'legal.exec', first: 'Lata', last: 'LegalExec', reportsTo: 'legal_team_lead' },
  legal_team_lead: { local: 'legal.tl', first: 'Vikram', last: 'LegalLead' },
};

function assertLocal(uri: string) {
  const host = uri.replace(/^mongodb(\+srv)?:\/\//, '').replace(/^[^@]*@/, '').split(/[/:?]/)[0];
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
    throw new Error(`Refusing to create test logins on non-local Mongo host "${host}".`);
  }
}

function password(): string {
  // 16 chars, guaranteed upper/lower/digit/symbol.
  return `Rt${crypto.randomBytes(9).toString('base64url')}7!`;
}

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
  const idBySeed = new Map<string, mongoose.Types.ObjectId>();
  try {
    for (const seed of CRM_ROLE_SEEDS) {
      const spec = USERS[seed.key];
      if (!spec) continue;
      const role: any = await Role.findOne({ seedKey: seed.key }).lean().exec();
      if (!role) throw new Error(`Role "${seed.name}" not found — run npm run seed:workspace-roles first.`);

      const email = `${spec.local}@${DOMAIN}`;
      const pw = password();
      const hash = await bcrypt.hash(pw, 10);
      const existing: any = await User.findOne({ email }).lean().exec();
      const _id = existing?._id ?? new mongoose.Types.ObjectId();
      idBySeed.set(seed.key, _id);

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
          },
          $setOnInsert: { _id, email, password: hash, authProvider: 'local' },
        },
        { upsert: true },
      ).exec();

      rows.push(`| ${seed.name} | ${seed.workspaceModule} | \`${email}\` | \`${pw}\` | ${spec.reportsTo ? USERS[spec.reportsTo].first + ' ' + USERS[spec.reportsTo].last : '—'} |`);
      console.log(`ok  ${seed.name.padEnd(30)} ${email}`);
    }

    for (const [key, spec] of Object.entries(USERS)) {
      const reportsTo = spec.reportsTo ? idBySeed.get(spec.reportsTo) : undefined;
      await User.updateOne(
        { _id: idBySeed.get(key) },
        reportsTo ? { $set: { reportsTo } } : { $unset: { reportsTo: 1 } },
      ).exec();
    }
  } finally {
    await hrms.close();
    if (crm !== hrms) await crm.close();
  }

  const file = path.join(__dirname, '..', '..', 'ROLE_TEST_LOGINS.local.md');
  fs.writeFileSync(
    file,
    [
      '# CRM role test logins (local dev only)',
      '',
      `Generated ${new Date().toISOString()} by \`api/scripts/seed-role-test-users.ts\` against the local database.`,
      'Passwords are regenerated every run. This file is git-ignored — do not commit or share it.',
      '',
      'Portal: http://localhost:3000 → log in with the email + password below.',
      '',
      '| Role | Workspace | Email | Password | Reports to |',
      '|---|---|---|---|---|',
      ...rows,
      '',
      'Clean-up: delete docs with `isRoleTestUser: true` from `users` and `crmusers`.',
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

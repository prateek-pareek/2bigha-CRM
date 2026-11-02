/**
 * Backfill missing email / phone on CRM clients from their source / associated leads.
 * Clients converted from leads used to copy only `lead.phone`, but leads usually keep
 * the number in `mobileNo`, so many clients ended up with no phone on file.
 *
 * Also repairs client names saved as "First undefined" / "First null" — lead conversion
 * used to build the name with a template string, which printed a missing last name.
 *
 * Dry run (default, writes nothing):
 *   npm run backfill:client-contact
 * Apply:
 *   npm run backfill:client-contact -- --apply
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as mongoose from 'mongoose';
import { formatIndianPhoneWithCountryCode } from '../src/crm/shared/crm-person-identifiers.util';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI_CRM || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mathionix-crm';
const APPLY = process.argv.includes('--apply');

const isBlank = (v: unknown) => v == null || String(v).trim() === '';
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanPhone = (v: unknown) => {
  const s = isBlank(v) ? '' : String(v).trim();
  return s ? formatIndianPhoneWithCountryCode(s) || undefined : undefined;
};
/** Whole-word, lowercase "undefined"/"null" left behind by `${first} ${last}` with a missing part. */
const BROKEN_NAME_TOKEN = /(^|\s)(undefined|null)(?=\s|$)/;
const stripBrokenNameTokens = (name: string) =>
  name
    .split(/\s+/)
    .filter((part) => part !== 'undefined' && part !== 'null')
    .join(' ')
    .trim();
const personName = (l: any) =>
  [l?.firstName, l?.lastName]
    .map((p) => String(p ?? '').trim())
    .filter((p) => p && p !== 'undefined' && p !== 'null')
    .join(' ');

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  const clients = db.collection('clients');
  const leads = db.collection('leads');

  const cursor = clients.find({
    isDeleted: { $ne: true },
    $or: [
      { email: { $in: [null, ''] } },
      { email: { $exists: false } },
      { phone: { $in: [null, ''] } },
      { phone: { $exists: false } },
      { name: { $regex: BROKEN_NAME_TOKEN.source } },
    ],
  });

  let scanned = 0;
  let updated = 0;
  let emailFilled = 0;
  let phoneFilled = 0;
  let nameFixed = 0;

  for await (const c of cursor) {
    scanned++;
    const leadIds = [c.sourceLead, ...(c.associatedLeads || [])].filter(Boolean);
    const linked = leadIds.length
      ? await leads.find({ $or: [{ _id: { $in: leadIds } }, { clientId: c._id }] }).toArray()
      : await leads.find({ clientId: c._id }).toArray();

    const set: Record<string, string> = {};

    // Name repair needs no linked lead: dropping the stray token is enough on its own.
    const currentName = String(c.name || '');
    if (BROKEN_NAME_TOKEN.test(currentName)) {
      const repaired =
        stripBrokenNameTokens(currentName) ||
        linked.map(personName).find(Boolean) ||
        String(c.email || '').trim() ||
        'Unknown';
      if (repaired !== currentName) set.name = repaired;
    }

    if (!linked.length && !Object.keys(set).length) continue;

    if (isBlank(c.email)) {
      for (const l of linked) {
        const email = String(l.email || '').trim();
        if (!email.includes('@')) continue;
        // `clients.email` has a unique index — never take an address another client owns.
        const taken = await clients.findOne({
          _id: { $ne: c._id },
          email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' },
        });
        if (!taken) {
          set.email = email;
          break;
        }
      }
    }

    if (isBlank(c.phone)) {
      for (const l of linked) {
        const phone = cleanPhone(l.mobileNo) || cleanPhone(l.phone);
        if (phone) {
          set.phone = phone;
          break;
        }
      }
    }

    if (!Object.keys(set).length) continue;
    updated++;
    if (set.email) emailFilled++;
    if (set.phone) phoneFilled++;
    if (set.name) nameFixed++;
    console.log(`${APPLY ? 'UPDATE' : 'WOULD UPDATE'} client ${c._id} (${c.name}):`, set);
    if (APPLY) await clients.updateOne({ _id: c._id }, { $set: set });
  }

  console.log(
    `\nScanned ${scanned} clients missing email/phone or with a broken name; ` +
      `${APPLY ? 'updated' : 'would update'} ${updated} ` +
      `(email: ${emailFilled}, phone: ${phoneFilled}, name: ${nameFixed}).` +
      `${APPLY ? '' : ' Re-run with --apply to write.'}`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});

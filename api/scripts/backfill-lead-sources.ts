/**
 * Standardise `Lead.source` on existing leads (see src/crm/shared/lead-source.util.ts):
 *   "Meta Lead Ads — Jaipur plots"  → source "Meta Ads",  sourceDetail "Jaipur plots"
 *   "Form — Contact us"             → source "CRM Form",  sourceDetail "Contact us"
 *   "facebook" / "WEBSITE" / "walk-in" → "Meta Ads" / "Website" / "Walk In"
 * Unknown labels are left exactly as they are, and an existing sourceDetail is never overwritten.
 *
 * Dry run (default, writes nothing — prints what would change):
 *   npm run backfill:lead-sources
 * Apply:
 *   npm run backfill:lead-sources -- --apply
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as mongoose from 'mongoose';
import { normalizeLeadSource } from '../src/crm/shared/lead-source.util';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI =
  process.env.MONGO_URI_CRM ||
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27017/mathionix-crm';
const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(MONGO_URI);
  const leads = mongoose.connection.db!.collection('leads');

  // One pass per distinct label (cheap) instead of per lead.
  const labels = (await leads.distinct('source', {
    source: { $type: 'string', $ne: '' },
  })) as string[];
  const changes: Array<{
    from: string;
    to: string;
    detail?: string;
    count: number;
  }> = [];
  const unknown: Array<{ label: string; count: number }> = [];

  for (const from of labels) {
    const n = normalizeLeadSource(from);
    const count = await leads.countDocuments({ source: from });
    if (!n.known) {
      unknown.push({ label: from, count });
      continue;
    }
    if (n.source === from && !n.detail) continue; // already standard
    changes.push({ from, to: n.source!, detail: n.detail, count });
  }

  console.log(
    `\n${APPLY ? 'APPLYING' : 'DRY RUN'} — ${changes.length} label(s) to standardise\n`,
  );
  for (const c of changes.sort((a, b) => b.count - a.count)) {
    console.log(
      `  ${String(c.count).padStart(6)}  "${c.from}" → "${c.to}"${c.detail ? `  (detail: "${c.detail}")` : ''}`,
    );
  }
  if (unknown.length) {
    console.log(
      `\n  Left as-is (not a standard source) — ${unknown.length} label(s):`,
    );
    for (const u of unknown.sort((a, b) => b.count - a.count)) {
      console.log(`  ${String(u.count).padStart(6)}  "${u.label}"`);
    }
  }

  if (APPLY) {
    let modified = 0;
    for (const c of changes) {
      // Keep any sourceDetail already set; fill it only where empty.
      if (c.detail) {
        const r1 = await leads.updateMany(
          {
            source: c.from,
            $or: [
              { sourceDetail: { $exists: false } },
              { sourceDetail: null },
              { sourceDetail: '' },
            ],
          },
          { $set: { source: c.to, sourceDetail: c.detail } },
        );
        modified += r1.modifiedCount;
      }
      const r2 = await leads.updateMany(
        { source: c.from },
        { $set: { source: c.to } },
      );
      modified += r2.modifiedCount;
    }
    console.log(`\nUpdated ${modified} lead(s).`);
  } else {
    console.log('\nNothing written. Re-run with --apply to update.');
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

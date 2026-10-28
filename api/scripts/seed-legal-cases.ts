/**
 * Seed demo Legal Cases (module LEGAL) so /crm/legal isn't empty.
 *
 *   npm run seed:legal-cases
 *
 * Idempotent: rows are keyed by `recordId` (LC-SEED-xxx) and upserted, so a
 * re-run never duplicates. Uses the existing "Legal Case Pipeline" (type
 * `legal`); creates it if missing.
 *
 * Does NOT touch the "2bigha Verification Queue" — that is a live read-through
 * to 2bigha, whose staging queues (getPendingVerificationProperties /
 * getVerifiedProperties) currently hold 0 properties. It fills in when 2bigha
 * puts properties in those queues.
 */
import 'dotenv/config';
import * as mongoose from 'mongoose';

const MONGO_URI =
  process.env.MONGO_URI_CRM || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mathionix-crm';

const LEGAL_STAGES = ['Intake', 'Document Review', 'Drafting', 'Negotiation', 'Signed / Closed', 'Terminated'];

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const CASES = [
  { title: 'Title verification — Dakala, Patiala', caseType: 'compliance', priority: 'high', stage: 'Document Review', counterpartyName: 'Singh Family Trust', jurisdiction: 'Punjab', expiry: 20 },
  { title: 'Sale deed review — Baleta, Alwar', caseType: 'contract_review', priority: 'medium', stage: 'Intake', counterpartyName: 'R. Meena', jurisdiction: 'Rajasthan', expiry: 35 },
  { title: 'Boundary dispute — Sector 12 plot', caseType: 'dispute', priority: 'urgent', stage: 'Negotiation', counterpartyName: 'Verma & Sons', jurisdiction: 'Haryana', expiry: 10 },
  { title: 'Property management agreement NDA', caseType: 'nda', priority: 'low', stage: 'Drafting', counterpartyName: 'GreenAcre Realty', jurisdiction: 'Delhi', expiry: 60 },
  { title: 'Agricultural land mutation check', caseType: 'compliance', priority: 'medium', stage: 'Document Review', counterpartyName: 'K. Choudhary', jurisdiction: 'Rajasthan', expiry: 45 },
  { title: 'Lease contract — commercial plot', caseType: 'contract_review', priority: 'high', stage: 'Signed / Closed', counterpartyName: 'Apex Logistics Pvt Ltd', jurisdiction: 'Gujarat', expiry: 180 },
  { title: 'Encumbrance certificate follow-up', caseType: 'other', priority: 'medium', stage: 'Intake', counterpartyName: 'Sub-Registrar Office', jurisdiction: 'Punjab', expiry: 15 },
  { title: 'Seller indemnity dispute', caseType: 'dispute', priority: 'high', stage: 'Terminated', counterpartyName: 'M. Kapoor', jurisdiction: 'Haryana', expiry: -5 },
];

async function main() {
  const conn = mongoose.createConnection(MONGO_URI);
  await conn.asPromise();
  try {
    const free = (name: string, coll: string) =>
      conn.model(name, new mongoose.Schema({}, { strict: false, timestamps: false, collection: coll }), coll);
    const Pipeline = free('Pipeline', 'pipelines');
    const CRMUser = free('CRMUser', 'crmusers');
    const LegalCase = free('LegalCase', 'legalcases');

    let pipeline: any = await Pipeline.findOne({ type: 'legal' });
    if (!pipeline) {
      pipeline = await Pipeline.create({
        name: 'Legal Case Pipeline',
        type: 'legal',
        isDefault: true,
        isActive: true,
        stages: LEGAL_STAGES.map((name, i) => ({ name, probability: 0, order: i + 1, isDefault: i === 0 })),
      });
      console.log('Created pipeline: Legal Case Pipeline');
    }

    const admin: any = await CRMUser.findOne({ email: 'admin@mathionix.com' }).lean();
    const owner: any =
      (await CRMUser.findOne({ email: 'seed.legal@crm-seed.test' }).lean()) || admin;
    const ownerLabel = owner
      ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email
      : undefined;

    const now = new Date();
    let n = 0;
    for (const c of CASES) {
      n += 1;
      const recordId = `LC-SEED-${String(n).padStart(3, '0')}`;
      await LegalCase.updateOne(
        { recordId },
        {
          $set: {
            module: 'LEGAL',
            title: c.title,
            caseType: c.caseType,
            priority: c.priority,
            stage: c.stage,
            counterpartyName: c.counterpartyName,
            jurisdiction: c.jurisdiction,
            description: 'Demo legal case (seed-legal-cases).',
            startDate: daysFromNow(-14),
            expiryDate: daysFromNow(c.expiry),
            caseOwner: ownerLabel,
            pipeline: pipeline._id,
            createdBy: (admin || owner)?._id,
            isDeleted: false,
          },
          $setOnInsert: {
            recordId,
            documents: [],
            associatedContacts: [],
            associatedLeads: [],
            sharedWith: [],
            customFields: {},
            createdAt: now,
          },
          $currentDate: { updatedAt: true },
        },
        { upsert: true },
      );
    }
    console.log(`Upserted ${CASES.length} legal cases (total now ${await LegalCase.countDocuments({ isDeleted: { $ne: true } })}).`);
  } finally {
    await conn.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

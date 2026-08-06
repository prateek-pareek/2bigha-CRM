/**
 * Idempotent CRM seed for testing client portal email + password login
 * (POST /api/portal/login-by-email) and /portal/:token on the marketing site.
 *
 * Usage (from api-hrms/):
 *   MONGO_URI_CRM="mongodb://..." node ./scripts/seed-client-portal-demo.mjs
 *   npm run seed:client-portal-demo
 *
 * Loads MONGO_URI_CRM from api-hrms/.env or .env.local if not set in the environment.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..");

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(apiRoot, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

loadDotEnv();

const DEMO_EMAIL = "client.portal.demo@mathionix.local";
const DEMO_PLAIN_PASSWORD = "PortalDemo123!";
const PORTAL_TOKEN = "demo-seed-portal-2026";
const DEAL_TITLE = "[SEED] Client portal demo deal";

async function main() {
  const uri = process.env.MONGO_URI_CRM;
  if (!uri) {
    console.error("Missing MONGO_URI_CRM. Set it in api-hrms/.env or pass in the environment.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const pipelines = db.collection("pipelines");
  const contacts = db.collection("contacts");
  const deals = db.collection("deals");

  let pipeline = await pipelines.findOne({ type: "deals" });
  if (!pipeline) {
    pipeline = await pipelines.findOne({});
  }
  if (!pipeline) {
    const stages = [
      { name: "Qualification", probability: 20, order: 0, isDefault: true },
      { name: "Proposal", probability: 50, order: 1, isDefault: false },
    ];
    const ins = await pipelines.insertOne({
      name: "Seed Default Deals",
      type: "deals",
      categoryType: "it_consulting",
      stages,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    pipeline = await pipelines.findOne({ _id: ins.insertedId });
  }

  const pipelineId = pipeline._id;
  const defaultStage =
    pipeline.stages?.find((s) => s.isDefault)?.name ||
    pipeline.stages?.[0]?.name ||
    "Qualification";

  const now = new Date();
  let contact = await contacts.findOne({
    email: new RegExp(`^${DEMO_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  });

  if (!contact) {
    const ins = await contacts.insertOne({
      firstName: "Demo",
      lastName: "Client",
      email: DEMO_EMAIL,
      status: "New",
      stage: "New",
      pipeline: pipelineId,
      associatedDeals: [],
      associatedContacts: [],
      associatedOrganizations: [],
      associatedLeads: [],
      additionalEmails: [],
      invalidEmails: [],
      sharedWith: [],
      converted: false,
      customFields: {},
      createdAt: now,
      updatedAt: now,
    });
    contact = await contacts.findOne({ _id: ins.insertedId });
  }

  const contactId = contact._id;
  const passwordHash = await bcrypt.hash(DEMO_PLAIN_PASSWORD, 10);

  const existingDeal = await deals.findOne({ portalToken: PORTAL_TOKEN });

  if (existingDeal) {
    await deals.updateOne(
      { _id: existingDeal._id },
      {
        $set: {
          title: DEAL_TITLE,
          contactPerson: contactId,
          portalToken: PORTAL_TOKEN,
          portalPasswordHash: passwordHash,
          portalGoogleLoginEnabled: false,
          portalScopeSummary:
            "This is seeded demo scope text for the client portal. Replace in CRM for real projects.",
          stage: defaultStage,
          currency: "INR",
          dealValue: 250000,
          updatedAt: now,
        },
      },
    );
  } else {
    await deals.insertOne({
      title: DEAL_TITLE,
      pipeline: pipelineId,
      stage: defaultStage,
      probability: 20,
      contactPerson: contactId,
      associatedContacts: [],
      associatedCompanies: [],
      sharedWith: [],
      customFields: {},
      portalToken: PORTAL_TOKEN,
      portalPasswordHash: passwordHash,
      portalGoogleLoginEnabled: false,
      portalScopeSummary:
        "This is seeded demo scope text for the client portal. Replace in CRM for real projects.",
      currency: "INR",
      dealValue: 250000,
      portalDocuments: [],
      portalMilestones: [],
      portalDeadlines: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  await mongoose.disconnect();

  console.log("");
  console.log("Client portal demo data ready (CRM).");
  console.log("────────────────────────────────────────");
  console.log("  Contact email:     ", DEMO_EMAIL);
  console.log("  Portal password:   ", DEMO_PLAIN_PASSWORD);
  console.log("  Portal token:      ", PORTAL_TOKEN);
  console.log("  Direct link:       ", `/portal/${PORTAL_TOKEN}`);
  console.log("");
  console.log("Marketing site:");
  console.log("  1. Open /portal → Client → Email & password");
  console.log("  2. Use the email + password above");
  console.log("  3. Or open /portal/" + PORTAL_TOKEN + " and sign in with the portal password");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/*
 * Live HTTP end-to-end test for the 1 Oct 2026 CRM bug report fixes.
 * Runs against a local API (TWOBIGHA_USE_MOCK=true → nothing is written to 2bigha staging)
 * on the local dev Mongo. Seeds @e2e-oct1.test users + "[E2E-OCT1]" records, cleans them up.
 *
 *   # in api/: build, then start a throwaway instance with 2bigha mocked
 *   npx nest build && PORT=4011 TWOBIGHA_USE_MOCK=true node dist/main.js
 *   API=http://127.0.0.1:4011/api node test/e2e-oct1-bugs/live-e2e.js
 */
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://127.0.0.1:4011/api';
const MONGO = 'mongodb://127.0.0.1:27017/mathionix-crm';
const ENV = fs.readFileSync(path.join(process.env.API_DIR || path.resolve(__dirname, '../..'), '.env'), 'utf8');
const JWT_SECRET = (ENV.match(/^JWT_SECRET=(.*)$/m) || [])[1].trim();
const DOMAIN = '@e2e-oct1.test';
const TAG = '[E2E-OCT1]';

let pass = 0, fail = 0;
const results = [];
function check(bug, name, ok, detail) {
  results.push({ bug, name, ok: !!ok, detail });
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `\n          → ${detail}` : ''}`);
}

async function http(method, url, token, body, isForm) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body && !isForm) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (isForm) payload = body;
  const res = await fetch(API + url, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text };
}

async function main() {
  await mongoose.connect(MONGO);
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const crmusers = db.collection('crmusers');
  const agentRole = await db.collection('roles').findOne({ name: 'Agent' });

  // ── cleanup from any earlier aborted run ──
  const cleanup = async () => {
    const ids = (await users.find({ email: { $regex: DOMAIN.replace('.', '\\.') + '$' } }).toArray()).map((u) => u._id);
    await db.collection('leads').deleteMany({ $or: [{ email: { $regex: 'e2e-oct1' } }, { firstName: { $regex: '^E2EOct1' } }, { createdBy: { $in: ids } }] });
    await db.collection('propertylistings').deleteMany({ title: { $regex: '^\\[E2E-OCT1\\]' } });
    await db.collection('clients').deleteMany({ email: { $regex: 'e2e-oct1' } });
    // Lead create / import also upserts a Contact per lead (dedupe source) — remove those too.
    await db.collection('contacts').deleteMany({ $or: [{ email: { $regex: 'e2e-oct1\\.test$' } }, { firstName: { $regex: '^E2EOct1' } }] });
    await users.deleteMany({ email: { $regex: 'e2e-oct1\\.test$' } });
    await crmusers.deleteMany({ email: { $regex: 'e2e-oct1\\.test$' } });
  };
  await cleanup();

  const mkUser = async (key, first, last, role, crmPermissions) => {
    const email = `${key}${DOMAIN}`;
    const { insertedId } = await users.insertOne({
      email, password: 'x', firstName: first, lastName: last, role, isActive: true,
      permittedTools: ['CRM'], crmPermissions, tokenVersion: 0, createdAt: new Date(), updatedAt: new Date(),
    });
    await crmusers.insertOne({
      email, password: 'x', firstName: first, lastName: last, role,
      roleId: role === 'AGENT' ? agentRole._id : undefined,
      isActive: true, provisioningStatus: 'active', permissions: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const token = jwt.sign({ sub: String(insertedId), email, role, version: 0 }, JWT_SECRET, { expiresIn: '1h' });
    return { id: String(insertedId), email, token, name: `${first} ${last}` };
  };

  const admin = await mkUser('admin', 'Admin', 'E2E', 'ADMIN', []);
  // Diksha: "Agent X" with Create/Update Lead + (now grantable) Property Listings View/Create
  const agentA = await mkUser('agenta', 'Agent', 'Alpha', 'AGENT', ['leads:read', 'leads:write', 'property-listings:read', 'property-listings:write']);
  // Agent without any Property Listings grant
  const agentB = await mkUser('agentb', 'Agent', 'Bravo', 'AGENT', ['leads:read', 'leads:write']);
  // Agent whose grant was saved with the old underscore key
  const agentL = await mkUser('agentl', 'Agent', 'Legacy', 'AGENT', ['leads:read', 'property_listings:read', 'property_listings:write']);

  try {
    // ════════════════ Diksha — leads ════════════════
    console.log('\nDiksha · Add Lead / Import for agent, bulk import for admin');
    const created = await http('POST', '/crm/leads', agentA.token, {
      firstName: 'E2EOct1', lastName: 'AgentCreated', mobileNo: '+919812300001', email: `lead1${DOMAIN}`.replace('@', '.') + '@e2e-oct1.test',
    });
    check('Diksha', 'Agent with Create Lead permission can create a lead (POST /crm/leads)', created.status === 201 || created.status === 200, `HTTP ${created.status} ${created.text.slice(0, 200)}`);

    // Bulk import — the exact failing case: template rows with blank Call Status + Lead Vertical.
    const rows = ['First Name,Last Name,Contact Number,Email,Call Status,Lead Vertical,Role'];
    for (let i = 0; i < 150; i++) {
      const phone = `98${String(76000000 + i).padStart(8, '0')}`;
      rows.push(`E2EOct1Imp${i},Row${i},${phone},imp${i}.e2e-oct1@e2e-oct1.test,,,`);
    }
    // a few free-text values people actually type
    rows.push('E2EOct1ImpX1,Free,9876500001,impx1.e2e-oct1@e2e-oct1.test,not answered,PM,Seller');
    rows.push('E2EOct1ImpX2,Free,9876500002,impx2.e2e-oct1@e2e-oct1.test,Connected,Property Listing,owner');
    rows.push('E2EOct1ImpX3,Bad,9876500003,impx3.e2e-oct1@e2e-oct1.test,Maybe later,,');
    const csv = rows.join('\n');
    const mapping = { firstName: 'First Name', lastName: 'Last Name', mobileNo: 'Contact Number', email: 'Email', callStatus: 'Call Status', leadVertical: 'Lead Vertical', role: 'Role' };

    const runImport = async (who, extra = {}) => {
      const form = new FormData();
      form.append('file', new Blob([csv], { type: 'text/csv' }), 'leads.csv');
      form.append('mapping', JSON.stringify(mapping));
      form.append('duplicateStrategy', 'skip');
      for (const [k, v] of Object.entries(extra)) form.append(k, v);
      const start = await http('POST', '/crm/import/leads', who.token, form, true);
      if (!start.json?.jobId) return { start };
      let job;
      for (let i = 0; i < 120; i++) {
        job = await http('GET', `/crm/import/jobs/${start.json.jobId}`, who.token);
        if (job.json && job.json.status !== 'processing') break;
        await new Promise((r) => setTimeout(r, 500));
      }
      return { start, job: job.json };
    };

    const adminImp = await runImport(admin);
    const aj = adminImp.job || {};
    check('Diksha', `Admin bulk import: 152 valid rows created (got created=${aj.createdCount}, failed=${aj.failedCount})`, aj.createdCount === 152, JSON.stringify(adminImp.start?.json || aj).slice(0, 300));
    check('Diksha', 'No row fails with Mongoose "is not a valid enum value"', !(aj.failedRows || []).some((r) => /valid enum value/i.test(r.reason)), JSON.stringify(aj.failedRows?.slice(0, 2)));
    const badRow = (aj.failedRows || []).find((r) => /Maybe later/.test(r.reason));
    check('Diksha', 'Unrecognised Call Status gives a readable row error (not a crash of the whole file)', aj.failedCount === 1 && badRow, JSON.stringify(aj.failedRows));

    const leadsColl = db.collection('leads');
    const blank = await leadsColl.findOne({ firstName: 'E2EOct1Imp7' });
    check('Diksha', 'Blank Call Status → schema default "Not Called"', blank?.callStatus === 'Not Called', JSON.stringify({ callStatus: blank?.callStatus }));
    check('Diksha', 'Blank Lead Vertical → default "property_listing" + pipeline/stage set', blank?.leadVertical === 'property_listing' && blank?.pipeline && blank?.stage, JSON.stringify({ lv: blank?.leadVertical, pipeline: blank?.pipeline, stage: blank?.stage }));
    const x1 = await leadsColl.findOne({ firstName: 'E2EOct1ImpX1' });
    check('Diksha', 'Free text mapped: "not answered"→Not Answered, "PM"→property_management, "Seller"→OWNER', x1?.callStatus === 'Not Answered' && x1?.leadVertical === 'property_management' && x1?.role === 'OWNER', JSON.stringify({ cs: x1?.callStatus, lv: x1?.leadVertical, role: x1?.role }));
    const x2 = await leadsColl.findOne({ firstName: 'E2EOct1ImpX2' });
    check('Diksha', '"Connected"→Completed, "owner"→OWNER', x2?.callStatus === 'Completed' && x2?.role === 'OWNER', JSON.stringify({ cs: x2?.callStatus, role: x2?.role }));
    const pmPipe = x1?.pipeline ? await db.collection('pipelines').findOne({ _id: x1.pipeline }) : null;
    check('Diksha', 'PM row lands in the Property Management pipeline', pmPipe?.leadVertical === 'property_management', pmPipe?.name);

    // Agent import (fresh emails so dedupe doesn't skip)
    const agentCsv = csv.replace(/e2e-oct1@e2e-oct1\.test/g, 'ag.e2e-oct1@e2e-oct1.test').replace(/,98(\d{8}),/g, (m, d) => `,97${d},`).replace(/,98765000/g, ',97765000');
    const form = new FormData();
    form.append('file', new Blob([agentCsv], { type: 'text/csv' }), 'leads.csv');
    form.append('mapping', JSON.stringify(mapping));
    form.append('duplicateStrategy', 'skip');
    form.append('leadVertical', 'property_management'); // started from the PM Leads page
    const agStart = await http('POST', '/crm/import/leads', agentA.token, form, true);
    check('Diksha', 'Agent can start a lead import (POST /crm/import/leads)', !!agStart.json?.jobId, `HTTP ${agStart.status} ${agStart.text.slice(0, 200)}`);
    let agJob;
    for (let i = 0; i < 120 && agStart.json?.jobId; i++) {
      agJob = (await http('GET', `/crm/import/jobs/${agStart.json.jobId}`, agentA.token)).json;
      if (agJob && agJob.status !== 'processing') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    check('Diksha', `Agent import creates rows (created=${agJob?.createdCount})`, agJob?.createdCount === 152, JSON.stringify(agJob?.failedRows?.slice(0, 2)));
    const agBlank = await leadsColl.findOne({ firstName: 'E2EOct1Imp3', email: /ag\.e2e/ });
    check('Diksha', 'Import started from PM Leads: blank Lead Vertical defaults to property_management', agBlank?.leadVertical === 'property_management', agBlank?.leadVertical);
    const agList = await http('GET', '/crm/leads?search=E2EOct1Imp3&pageSize=50', agentA.token);
    const agRows = Array.isArray(agList.json) ? agList.json : agList.json?.data || [];
    check('Diksha', "Agent sees the leads they imported in their own list", agRows.some((l) => /ag\.e2e/.test(l.email || '')), `HTTP ${agList.status} rows=${agRows.length}`);

    // ════════════════ Lucky — notification → lead ════════════════
    console.log('\nLucky · Notification opens the lead (no "Failed to load lead")');
    const assigned = await http('POST', '/crm/leads', admin.token, {
      firstName: 'E2EOct1', lastName: 'Assigned', mobileNo: '+919812300009', email: 'assigned.e2e-oct1@e2e-oct1.test',
      leadOwner: '  agent   ALPHA ', // owner label saved with different case/spacing
    });
    const assignedId = assigned.json?._id;
    const asOwner = await http('GET', `/crm/leads/${assignedId}`, agentA.token);
    check('Lucky', 'Assigned agent opens the lead from the notification link (200 + lead body)', asOwner.status === 200 && asOwner.json?._id === assignedId, `HTTP ${asOwner.status} ${asOwner.text.slice(0, 150)}`);
    const byRecordId = assigned.json?.recordId ? await http('GET', `/crm/leads/${assigned.json.recordId}`, agentA.token) : null;
    check('Lucky', 'Link with recordId also resolves', !byRecordId || byRecordId.status === 200, byRecordId && `HTTP ${byRecordId.status}`);
    const other = await http('GET', `/crm/leads/${assignedId}`, agentB.token);
    check('Lucky', 'Out-of-scope lead → 404 JSON (was empty 200 → "Failed to load lead")', other.status === 404 && other.json?.message, `HTTP ${other.status} body="${other.text.slice(0, 80)}"`);
    const gone = await http('GET', '/crm/leads/6aa278d4d57f28593b6316d7', admin.token); // id from a real stale notification
    check('Lucky', 'Deleted lead (stale notification id) → 404, not an empty 200', gone.status === 404, `HTTP ${gone.status} body="${gone.text.slice(0, 80)}"`);
    await http('DELETE', `/crm/leads/${assignedId}`, admin.token);
    const softDeleted = await http('GET', `/crm/leads/${assignedId}`, agentA.token);
    check('Lucky', 'Soft-deleted lead → 404', softDeleted.status === 404, `HTTP ${softDeleted.status}`);

    // ════════════════ Diksha — property upload permission ════════════════
    console.log('\nDiksha · Property upload permission for agents');
    const listingBody = (over) => ({
      title: `${TAG} Agricultural Land in Patiala, Patiala`,
      address: 'Patiala, Patiala, Punjab', city: 'Patiala', district: 'Patiala', state: 'Punjab', village: 'Baradari',
      country: 'India', price: 2500000, currency: 'INR', listingBucket: 'properties',
      propertyType: 'Agricultural', landType: 'Agricultural', listedFor: 'Sale',
      areaSqft: 4, areaUnit: 'Biswa', ownersCount: 3, ownershipYes: false,
      roadAccess: true, roadAccessWidth: 20, highwayConn: true,
      mapCoordinates: [
        { lat: 30.3398, lng: 76.3869 }, { lat: 30.3401, lng: 76.3875 },
        { lat: 30.3395, lng: 76.3879 }, { lat: 30.3392, lng: 76.3872 },
      ],
      mapBoundaries: [{ type: 'Polygon', coordinates: [
        { lat: 30.3398, lng: 76.3869 }, { lat: 30.3401, lng: 76.3875 },
        { lat: 30.3395, lng: 76.3879 }, { lat: 30.3392, lng: 76.3872 },
      ] }],
      mapLocation: { name: 'Baradari', address: '30.339650, 76.387375', lat: 30.33965, lng: 76.387375 },
      status: 'Available', approvalStatus: 'Pending',
      contactName: 'E2E Owner', contactPhone: '+91 9812300077', whatsappNumber: '+91 9812300077',
      ...over,
    });
    const agentCreate = await http('POST', '/crm/property-listings', agentA.token, listingBody());
    check('Diksha', 'Agent granted Property Listings View/Create can add a property', agentCreate.status === 201, `HTTP ${agentCreate.status} ${agentCreate.text.slice(0, 250)}`);
    const listingId = agentCreate.json?._id;
    const noGrant = await http('POST', '/crm/property-listings', agentB.token, listingBody({ title: `${TAG} no grant` }));
    check('Diksha', 'Agent WITHOUT the grant is still refused (403)', noGrant.status === 403, `HTTP ${noGrant.status}`);
    const legacy = await http('POST', '/crm/property-listings', agentL.token, listingBody({ title: `${TAG} legacy grant`, city: 'Ludhiana', village: '', district: 'Ludhiana' }));
    check('Diksha', 'Agent with old "property_listings:*" grant is accepted', legacy.status === 201, `HTTP ${legacy.status} ${legacy.text.slice(0, 200)}`);

    // ════════════════ Manisha / Sneha — what the wizard saves ════════════════
    console.log('\nManisha / Sneha · Listing fields saved and returned');
    const one = await http('GET', `/crm/property-listings/${listingId}`, agentA.token);
    const L = one.json || {};
    check('Manisha', 'Land Type kept as "Agricultural" (not Farm)', L.landType === 'Agricultural' && L.propertyType === 'Agricultural', JSON.stringify({ landType: L.landType, propertyType: L.propertyType }));
    check('Manisha', 'Biswa area unit saved', L.areaUnit === 'Biswa', L.areaUnit);
    check('Manisha', 'No. of Owners saved', L.ownersCount === 3, L.ownersCount);
    check('Manisha', 'Price saved in rupees (25 Lakh → 2500000)', L.price === 2500000, L.price);
    check('Manisha', 'Road access + width + highway connectivity saved', L.roadAccess === true && L.roadAccessWidth === 20 && L.highwayConn === true, JSON.stringify({ ra: L.roadAccess, w: L.roadAccessWidth, d: L.roadAccessDistance, h: L.highwayConn }));
    check('Manisha', 'All 4 boundary coordinates retained after listing', Array.isArray(L.mapCoordinates) && L.mapCoordinates.length === 4 && L.mapBoundaries?.[0]?.coordinates?.length === 4, JSON.stringify(L.mapCoordinates));
    check('Manisha/Sneha', 'Exact entered location coordinates saved', L.mapLocation?.lat === 30.33965 && L.mapLocation?.lng === 76.387375, JSON.stringify(L.mapLocation));
    const zeroOwners = await http('POST', '/crm/property-listings', agentA.token, listingBody({ title: `${TAG} zero owners`, ownersCount: 0 }));
    check('Manisha', 'No. of Owners < 1 rejected (400)', zeroOwners.status === 400, `HTTP ${zeroOwners.status}`);
    const noLandType = await http('POST', '/crm/property-listings', agentA.token, listingBody({ title: `${TAG} no land type`, landType: undefined, propertyType: 'Plot' }));
    check('Manisha', 'Land Type left as None → no landType stored', noLandType.status === 201 && !noLandType.json?.landType, JSON.stringify({ status: noLandType.status, landType: noLandType.json?.landType }));

    // ════════════════ Manisha — approval queue ════════════════
    console.log('\nManisha · New listing appears in the Approval section');
    check('Manisha', 'New listing is created as Pending', L.approvalStatus === 'Pending', L.approvalStatus);
    const queue = await http('GET', '/crm/property-listings/twobigha/approval-queue/pending?page=1&limit=20', admin.token);
    const qIds = (queue.json?.data || []).map((r) => r?.property?.id);
    check('Manisha', 'Approval queue (Pending) lists the new property', qIds.includes(listingId), `HTTP ${queue.status} ids=${JSON.stringify(qIds.slice(0, 5))}`);
    const qRow = (queue.json?.data || []).find((r) => r?.property?.id === listingId);
    check('Manisha', 'Queue row carries the boundary + Agricultural type', qRow?.property?.propertyType === 'AGRICULTURAL' && Array.isArray(qRow?.property?.boundary), JSON.stringify({ t: qRow?.property?.propertyType, b: !!qRow?.property?.boundary }));
    const approve = await http('POST', '/crm/property-listings/approval-decision', admin.token, { id: listingId, status: 'Approved', message: 'e2e' });
    check('Manisha', 'Admin can approve it from the queue', approve.status === 201 || approve.status === 200, `HTTP ${approve.status} ${approve.text.slice(0, 200)}`);
    const queueAfter = await http('GET', '/crm/property-listings/twobigha/approval-queue/approved?page=1&limit=20', admin.token);
    check('Manisha', 'After approval it moves to the Approved bucket', (queueAfter.json?.data || []).some((r) => r?.property?.id === listingId), `HTTP ${queueAfter.status}`);

    // ════════════════ Manisha — My Properties ════════════════
    console.log('\nManisha · My Properties');
    const mine = await http('GET', '/crm/property-listings?mine=1&pageSize=50', agentA.token);
    const mineTitles = (mine.json?.data || []).map((d) => d.title);
    check('Manisha', 'My Properties returns the agent\'s own listings', (mine.json?.data || []).some((d) => d._id === listingId), `HTTP ${mine.status} ${JSON.stringify(mineTitles)}`);
    check('Manisha', 'My Properties excludes other users\' listings', !mineTitles.includes(`${TAG} legacy grant`), JSON.stringify(mineTitles));
    const mineL = await http('GET', '/crm/property-listings?mine=1&pageSize=50', agentL.token);
    check('Manisha', 'Each user sees only their own (legacy agent sees 1)', (mineL.json?.data || []).length === 1, `rows=${(mineL.json?.data || []).length}`);

    // ════════════════ Lucky — search ════════════════
    console.log('\nLucky · New listing appears in property search (Baradari, Patiala, Punjab)');
    // a listing that is Pending/unsynced, like the reported one
    const bar = await http('POST', '/crm/property-listings', agentA.token, listingBody({ title: `${TAG} Land in Patiala, Patiala`, landType: undefined, propertyType: 'Plot' }));
    for (const term of ['Baradari', 'Patiala', 'Punjab']) {
      const s = await http('GET', `/crm/property-listings/twobigha/properties?page=1&limit=20&searchTerm=${encodeURIComponent(term)}`, admin.token);
      const ids = (s.json?.data || []).map((r) => r?.property?.id);
      check('Lucky', `Search "${term}" finds the new listing`, ids.includes(bar.json?._id), `HTTP ${s.status} ids=${JSON.stringify(ids.slice(0, 5))}`);
    }

    // ════════════════ Lucky — delete ════════════════
    console.log('\nLucky · Delete listing from the 3-dot menu');
    const del = await http('DELETE', `/crm/property-listings/${bar.json?._id}`, admin.token);
    check('Lucky', 'DELETE /crm/property-listings/:id succeeds', del.status === 200 && del.json?.success === true, `HTTP ${del.status} ${del.text.slice(0, 200)}`);
    const afterDel = await http('GET', `/crm/property-listings/${bar.json?._id}`, admin.token);
    check('Lucky', 'Deleted listing is gone (404)', afterDel.status === 404, `HTTP ${afterDel.status}`);
    const sAfter = await http('GET', '/crm/property-listings/twobigha/properties?page=1&limit=20&searchTerm=Baradari', admin.token);
    check('Lucky', 'Deleted listing no longer in search', !(sAfter.json?.data || []).some((r) => r?.property?.id === bar.json?._id), '');
    const delUnknown = await http('DELETE', '/crm/property-listings/no-such-slug-e2e', admin.token);
    check('Lucky', 'Unknown id → 404 with a message (not a silent success)', delUnknown.status === 404, `HTTP ${delUnknown.status}`);

    // ════════════════ Lucky — agent filter ════════════════
    console.log('\nLucky · Agent filter on Agent Performance');
    const all = await http('GET', '/crm/reports/agents?window=this_month', admin.token);
    const allIds = (all.json?.agents || []).map((a) => a.agentId);
    check('Lucky', 'Unfiltered report includes both admin and agentA activity', allIds.includes(agentA.id) && allIds.includes(admin.id), JSON.stringify(allIds.length));
    const onlyA = await http('GET', `/crm/reports/agents?window=this_month&agents=${agentA.id}`, admin.token);
    const aRows = onlyA.json?.agents || [];
    check('Lucky', 'agents=<agentA> returns only agentA', aRows.length === 1 && aRows[0].agentId === agentA.id, JSON.stringify(aRows.map((r) => [r.agentId, r.name])));
    check('Lucky', 'agentA lead count = what agentA created (153 = 1 manual + 152 imported)', aRows[0]?.leadsCreated === 153, `leadsCreated=${aRows[0]?.leadsCreated}`);
    const idle = await http('GET', `/crm/reports/agents?window=this_month&agents=${agentB.id}`, admin.token);
    check('Lucky', 'Selected idle agent still gets a zero row', (idle.json?.agents || []).length === 1 && idle.json.agents[0].leadsCreated === 0, JSON.stringify(idle.json?.agents));
    const two = await http('GET', `/crm/reports/agents?window=this_month&agents=${agentA.id},${agentB.id}`, admin.token);
    check('Lucky', 'Multi-select (2 agents) returns exactly those 2', (two.json?.agents || []).length === 2, JSON.stringify((two.json?.agents || []).map((a) => a.name)));
    const trend = await http('GET', `/crm/reports/agents/trend?window=this_month&agents=${agentA.id}`, admin.token);
    check('Lucky', 'Trend endpoint accepts the agent filter', trend.status === 200, `HTTP ${trend.status}`);

    // ════════════════ Disha — client properties ════════════════
    console.log('\nDisha · Client property tab shows only that client\'s properties');
    const client = await db.collection('clients').insertOne({ name: 'E2E Unlinked Client', email: 'client.e2e-oct1@e2e-oct1.test', createdAt: new Date(), updatedAt: new Date() });
    const cp = await http('GET', `/crm/clients/${client.insertedId}/twobigha-properties?page=1&limit=10`, admin.token);
    check('Disha', 'Client not linked to 2bigha → empty list (was: every platform property)', cp.status === 200 && Array.isArray(cp.json?.result) && cp.json.result.length === 0 && cp.json.totalCount === 0, `HTTP ${cp.status} ${cp.text.slice(0, 200)}`);
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('E2E crashed:', e);
  process.exit(2);
});

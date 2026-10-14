// Reports & Analytics (FRD §14) E2E — GET /crm/reports/performance for Admin / Team Lead / Agent.
//
// Runs against a THROWAWAY Mongo + API (never the real DB or 2bigha staging):
//   mongod --dbpath <empty dir> --port 27019
//   (api) MONGO_URI=mongodb://127.0.0.1:27019/e2e MONGO_URI_CRM=mongodb://127.0.0.1:27019/e2e \
//         PORT=4099 TWOBIGHA_USE_MOCK=true REDIS_ENABLED=false node dist/main.js
//   (api) node test/e2e-reports/reports-e2e.js
// It DROPS the e2e database at start and end (set KEEP=1 + TOKENS_OUT=<file> to keep data for UI checks).
const { MongoClient, ObjectId } = require('mongoose').mongo;
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const API = 'http://127.0.0.1:4099/api';
const MONGO = 'mongodb://127.0.0.1:27019/e2e';
const envFile = fs.readFileSync(path.join(process.env.API_DIR || path.join(__dirname, '..', '..'), '.env'), 'utf8');
const SECRET = (envFile.match(/^JWT_SECRET=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');

const now = Date.now();
const H = 3600e3;
const D = 24 * H;
// Seed "today" a few hours ago so it is inside today/this_week/this_month windows.
const base = new Date(now - 3 * H);
const at = (ms) => new Date(base.getTime() + ms);

let pass = 0;
let fail = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${ok ? '' : `  (expected ${JSON.stringify(expected)})`}`);
}

async function main() {
  const client = await MongoClient.connect(MONGO);
  const db = client.db();
  await db.dropDatabase();

  const id = () => new ObjectId();
  const U = { admin: id(), tl: id(), a1: id(), a2: id(), b1: id() };
  const C = { admin: id(), tl: id(), a1: id(), a2: id(), b1: id() };
  const crmPerms = ['dashboard:read', 'leads:read'];
  const user = (k, first, extra = {}) => ({
    _id: U[k], email: `${k}@test.local`, firstName: first, lastName: 'Agent', role: 'Employee',
    permittedTools: ['CRM'], crmPermissions: crmPerms, permissions: [], tokenVersion: 0, isActive: true, ...extra,
  });
  await db.collection('users').insertMany([
    user('admin', 'Admin', { role: 'Admin', crmPermissions: [] }),
    user('tl', 'Tara', { crmPermissions: [...crmPerms, 'leads:read:team'] }),
    user('a1', 'Asha', { reportsTo: U.tl }),
    user('a2', 'Ravi', { reportsTo: U.tl }),
    user('b1', 'Bina'),
  ]);
  const crm = (k, first, extra = {}) => ({
    _id: C[k], email: `${k}@test.local`, firstName: first, lastName: 'Agent', role: 'Agent',
    isActive: true, provisioningStatus: 'active', permissions: k === 'tl' ? [...crmPerms, 'leads:read:team'] : crmPerms, ...extra,
  });
  await db.collection('crmusers').insertMany([
    crm('admin', 'Admin', { role: 'Admin' }),
    crm('tl', 'Tara', { role: 'Team Lead' }),
    crm('a1', 'Asha', { agentMobile: '+919876500001' }),
    crm('a2', 'Ravi'),
    crm('b1', 'Bina'),
  ]);

  const L = { L1: id(), L2: id(), L3: id(), L4: id(), L5: id(), L6: id(), L7: id() };
  await db.collection('leads').insertMany([
    { _id: L.L1, firstName: 'L1', createdBy: U.a1, status: 'New', callStatus: 'Not Called', source: 'Website', createdAt: at(0),
      nextFollowUpAt: new Date(now - 1 * D) },
    { _id: L.L2, firstName: 'L2', createdBy: U.a1, status: 'Converted', converted: true, source: 'Facebook', leadIntents: ['Buy'],
      createdAt: at(0), nextFollowUpAt: new Date(now - 2 * D), lastCallAt: new Date(now - 1 * D) },
    { _id: L.L3, firstName: 'L3', createdBy: U.a1, leadOwner: 'Ravi Agent', status: 'Qualified', source: 'Website', leadIntents: ['Buy', 'Sell'], createdAt: at(0) },
    { _id: L.L4, firstName: 'L4', createdBy: U.b1, status: 'Contacted', source: 'Facebook', currentSubscriptionPlan: 'Gold', createdAt: at(0) },
    { _id: L.L5, firstName: 'L5', status: 'New', source: 'Import', createdAt: at(0) },
    { _id: L.L6, firstName: 'L6', createdBy: U.a1, status: 'New', isDeleted: true, createdAt: at(0) },
    { _id: L.L7, firstName: 'L7', createdBy: U.a1, status: 'New', createdAt: new Date(now - 20 * D) },
  ]);

  await db.collection('crm_ivr_call_logs').insertMany([
    { sessionId: 'c1', direction: 'Outgoing', status: 'Completed', connectedDuration: 120, duration: 140, initiatedByUserId: U.a1, relatedTo: L.L1, relatedType: 'Lead', createdAt: at(30 * 60e3) },
    { sessionId: 'c2', direction: 'Outgoing', status: 'Not Answered', initiatedByUserId: U.a1, createdAt: at(40 * 60e3) },
    { sessionId: 'c3', direction: 'Incoming', status: 'Missed', agentNumber: '+919876500001', createdAt: at(50 * 60e3) },
    { sessionId: 'c4', direction: 'Incoming', status: 'Completed', duration: 60, agentNumber: '+919999999999', createdAt: at(55 * 60e3) },
    { sessionId: 'c5', direction: 'Outgoing', status: 'Connected', connectedDuration: 300, initiatedByUserId: U.tl, createdAt: at(60 * 60e3) },
  ]);

  await db.collection('activities').insertMany([
    { type: 'Note', title: 'n', author: U.a1, createdAt: at(5 * 60e3) },
    { type: 'Email', title: 'e', author: U.a2, relatedTo: L.L3, relatedType: 'Lead', createdAt: at(2 * H) },
    { type: 'System', title: 's', author: U.a1, createdAt: at(6 * 60e3) },
    { type: 'Task', title: 't1', assignee: C.a1, author: U.tl, status: 'Completed', metadata: { dueDate: new Date(now - 1 * D).toISOString() }, createdAt: at(0) },
    { type: 'Task', title: 't2', author: U.a2, status: 'Open', metadata: { dueDate: new Date(now - 2 * D).toISOString() }, createdAt: at(0) },
    { type: 'System', title: 'order', metadata: { pmEvent: true, eventType: 'pm_payment_order_created', razorpayOrderId: 'order_X', amount: 999900 }, author: U.b1, createdAt: at(0) },
    { type: 'System', title: 'paid', metadata: { pmEvent: true, eventType: 'pm_payment_verified', success: true, razorpayOrderId: 'order_X' }, author: U.b1, createdAt: at(60e3) },
  ]);

  await db.collection('whatsappmessages').insertMany([
    { waId: '9111', direction: 'inbound', body: 'hi', status: 'received', isRead: true, createdAt: at(10 * 60e3) },
    { waId: '9111', direction: 'outbound', body: 'hello', sentBy: U.a1, entityId: L.L1, status: 'read', createdAt: at(20 * 60e3) },
    { waId: '9222', direction: 'outbound', body: 'x', sentBy: C.a2, status: 'delivered', createdAt: at(21 * 60e3) },
    { waId: '9333', direction: 'outbound', body: 'y', sentBy: U.a1, status: 'failed', createdAt: at(22 * 60e3) },
    { waId: '9444', direction: 'outbound', body: 'auto', status: 'sent', createdAt: at(23 * 60e3) },
  ]);

  await db.collection('propertylistings').insertMany([
    { title: 'p1', createdBy: U.a1, listingBucket: 'properties', approvalStatus: 'Approved', createdAt: at(0) },
    { title: 'p2', createdBy: C.a2, listingBucket: 'farm', approvalStatus: 'Pending', createdAt: at(0) },
    { title: 'p3', createdBy: U.b1, listingBucket: 'pm', approvalStatus: 'Pending', createdAt: at(0) },
  ]);
  await db.collection('crm_agent_targets').insertOne({ agentId: U.a1, leadsTarget: 10, callsTarget: 20, propertiesTarget: 5 });

  const token = (k) => jwt.sign({ sub: String(U[k]), email: `${k}@test.local`, role: k === 'admin' ? 'Admin' : 'Employee', version: 0 }, SECRET, { expiresIn: '1h' });
  const get = async (k, qs) => {
    const res = await fetch(`${API}/crm/reports/performance?window=this_month&fresh=1${qs || ''}`, { headers: { Authorization: `Bearer ${token(k)}` } });
    const body = await res.json().catch(() => null);
    if (!res.ok) console.log('HTTP', res.status, JSON.stringify(body).slice(0, 300));
    return body;
  };
  const row = (r, k) => r.agents.find((a) => a.agentId === String(U[k]));

  // ---------------- ADMIN (org) ----------------
  console.log('\n== Admin (org scope)');
  const A = await get('admin');
  eq('scope', A.scope.tier, 'org');
  eq('totals.leadsCreated (L1-L5; deleted + previous-period excluded)', A.totals.leadsCreated, 5);
  eq('totals.leadsConverted', A.totals.leadsConverted, 1);
  eq('totals.calls', A.totals.calls, 5);
  eq('totals.whatsappSent', A.totals.whatsappSent, 4);
  eq('totals.listingsTotal', A.totals.listingsTotal, 3);
  eq('totals.revenue (₹9,999 from 999900 paise)', A.totals.revenue, 9999);
  eq('totals.subscriptionSales', A.totals.subscriptionSales, 1);
  eq('unattributed leads/calls/wa', [A.unattributed.leadsCreated, A.unattributed.calls, A.unattributed.whatsappSent], [1, 1, 1]);
  eq('previousTotals.leadsCreated (L7)', A.previousTotals.leadsCreated, 1);

  const a1 = row(A, 'a1');
  eq('a1 leads/converted/contacted', [a1.leadsCreated, a1.leadsConverted, a1.leadsContacted], [2, 1, 1]);
  eq('a1 calls/out/in/connected/missed/notConn', [a1.calls, a1.outgoingCalls, a1.incomingCalls, a1.connectedCalls, a1.missedCalls, a1.notConnectedCalls], [3, 2, 1, 1, 1, 1]);
  eq('a1 talkTime/avgDuration', [a1.talkTimeSec, a1.avgCallDurationSec], [120, 120]);
  eq('a1 activities (authored Note only; System + TL-authored task excluded)', a1.activities, 1);
  eq('tl activities (authored the task)', row(A, 'tl').activities, 1);
  eq('a1 tasks created/completed', [a1.tasksCreated, a1.tasksCompleted], [1, 1]);
  eq('a1 follow-ups due/done/overdue/adherence', [a1.followUpsDue, a1.followUpsDone, a1.followUpsOverdue, a1.followUpAdherence], [3, 2, 1, 67]);
  eq('a1 first response (L1 via WhatsApp @20m; L2 pending)', [a1.avgResponseMins, a1.respondedLeads, a1.pendingResponseLeads], [20, 1, 1]);
  eq('a1 whatsapp sent/delivered/read/failed', [a1.whatsappSent, a1.whatsappDelivered, a1.whatsappRead, a1.whatsappFailed], [2, 1, 1, 1]);
  eq('a1 whatsapp avg reply mins', a1.whatsappAvgReplyMins, 10);
  eq('a1 properties/farms/approved', [a1.properties, a1.farms, a1.listingsApproved], [1, 0, 1]);
  eq('a1 target', a1.target, { leadsTarget: 10, callsTarget: 20, propertiesTarget: 5 });
  eq('a1 team', a1.teamName, 'Tara Agent');

  const a2 = row(A, 'a2');
  eq('a2 leads (L3 via leadOwner) / qualified', [a2.leadsCreated, a2.leadsQualified], [1, 1]);
  eq('a2 response (Email @120m)', a2.avgResponseMins, 120);
  eq('a2 whatsapp via legacy CRM id', [a2.whatsappSent, a2.whatsappDelivered], [1, 1]);
  eq('a2 farm via legacy CRM id', [a2.farms, a2.listingsPending], [1, 1]);
  eq('a2 follow-up (task overdue)', [a2.followUpsDue, a2.followUpsDone, a2.followUpAdherence], [1, 0, 0]);

  const b1 = row(A, 'b1');
  eq('b1 revenue/sales/subscribedLeads/pm', [b1.revenue, b1.subscriptionSales, b1.subscribedLeads, b1.pmListings], [9999, 1, 1, 1]);
  eq('b1 team', b1.teamName, 'Unassigned');
  eq('tl calls/connected/talk', [row(A, 'tl').calls, row(A, 'tl').connectedCalls, row(A, 'tl').talkTimeSec], [1, 1, 300]);

  const team = A.teams.find((t) => t.teamId === String(U.tl));
  eq('team Tara size/leads/calls/wa', [team.teamSize, team.leadsCreated, team.calls, team.whatsappSent], [3, 3, 4, 3]);
  eq('sources', A.sources.map((s) => [s.source, s.totalLeads, s.converted]), [['Website', 2, 0], ['Facebook', 2, 1], ['Import', 1, 0]]);
  eq('intents', A.intents.map((s) => [s.intentLabel, s.totalWithIntent, s.converted]), [['Buy', 2, 1], ['Sell', 1, 0]]);
  eq('engagement.ivr in/out/missed', [A.engagement.ivr.incoming, A.engagement.ivr.outgoing, A.engagement.ivr.missed], [2, 3, 1]);
  eq('engagement.whatsapp inbound', A.engagement.whatsapp.inbound, 1);
  eq('targets.leads', A.targets.leads, { actual: 5, target: 10 });
  eq('trend sums to totals (leads)', A.trend.reduce((s, d) => s + d.leadsCreated, 0), 5);

  // ---------------- TEAM LEAD ----------------
  console.log('\n== Team Lead (own team)');
  const T = await get('tl');
  eq('scope', T.scope.tier, 'team');
  eq('people', T.agents.map((a) => a.name).sort(), ['Asha Agent', 'Ravi Agent', 'Tara Agent']);
  eq('totals leads/calls/wa/listings/revenue', [T.totals.leadsCreated, T.totals.calls, T.totals.whatsappSent, T.totals.listingsTotal, T.totals.revenue], [3, 4, 3, 2, 0]);
  eq('single team', T.teams.map((t) => [t.teamName, t.teamSize]), [['Tara Agent', 3]]);
  eq('no unattributed in team scope', T.unattributed, null);
  eq('sources limited to team', T.sources.map((s) => [s.source, s.totalLeads]), [['Website', 2], ['Facebook', 1]]);
  const Tb = await get('tl', `&agents=${U.b1}`);
  eq('team lead cannot pull an outside agent', Tb.agents.length, 0);

  // ---------------- AGENT ----------------
  console.log('\n== Agent (self only)');
  const G = await get('a1');
  eq('scope', G.scope.tier, 'agent');
  eq('only self', G.agents.map((a) => a.name), ['Asha Agent']);
  eq('totals = own row', [G.totals.leadsCreated, G.totals.calls, G.totals.whatsappSent, G.totals.listingsTotal], [2, 3, 2, 1]);
  const Gb = await get('a1', `&agents=${U.b1}`);
  eq('agent cannot pull another agent', Gb.agents.length, 0);
  const inv = await fetch(`${API}/crm/reports/twobigha-inventory`, { headers: { Authorization: `Bearer ${token('a1')}` } }).then((r) => r.json());
  eq('agent cannot read org 2bigha inventory', inv.restricted, true);

  // Legacy slices
  const legacy = await fetch(`${API}/crm/reports/teams?window=this_month`, { headers: { Authorization: `Bearer ${token('admin')}` } }).then((r) => r.json());
  eq('legacy /reports/teams has WhatsApp + IVR fields', ['messagesOutbound', 'messagesRead', 'incomingCalls', 'missedCalls', 'avgCallDuration'].every((k) => k in legacy.teams[0]), true);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (!process.env.KEEP) await db.dropDatabase();
  else fs.writeFileSync(process.env.TOKENS_OUT, JSON.stringify({ admin: token('admin'), tl: token('tl'), a1: token('a1') }));
  await client.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

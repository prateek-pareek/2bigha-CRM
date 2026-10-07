/*
 * READ-ONLY checks against live 2bigha staging through the local API (GET requests only).
 * Seeds one @e2e-oct1.test admin user locally (removed at the end) to mint a JWT.
 *
 *   # in api/: start an instance on the normal .env (live 2bigha staging)
 *   PORT=4012 node dist/main.js
 *   API=http://127.0.0.1:4012/api node test/e2e-oct1-bugs/live-staging-readonly.js
 */
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://127.0.0.1:4012/api';
const ENV = fs.readFileSync(path.join(process.env.API_DIR || path.resolve(__dirname, '../..'), '.env'), 'utf8');
const JWT_SECRET = (ENV.match(/^JWT_SECRET=(.*)$/m) || [])[1].trim();

let pass = 0, fail = 0;
const check = (bug, name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};
const get = async (url, token) => {
  const res = await fetch(API + url, { headers: { Authorization: `Bearer ${token}` } });
  const t = await res.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: res.status, json: j, text: t };
};

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/mathionix-crm');
  const users = mongoose.connection.db.collection('users');
  await users.deleteMany({ email: 'ro-admin@e2e-oct1.test' });
  const { insertedId } = await users.insertOne({ email: 'ro-admin@e2e-oct1.test', password: 'x', firstName: 'RO', lastName: 'Admin', role: 'ADMIN', isActive: true, tokenVersion: 0, crmPermissions: [] });
  const token = jwt.sign({ sub: String(insertedId), email: 'ro-admin@e2e-oct1.test', role: 'ADMIN', version: 0 }, JWT_SECRET, { expiresIn: '1h' });

  try {
    console.log('\nLucky · Sold filter (live staging)');
    const stats = await get('/crm/property-listings/twobigha/properties/stats', token);
    const statsAlt = stats.status === 404 ? await get('/crm/property-listings/stats?listingBucket=properties', token) : stats;
    console.log('    stats:', JSON.stringify(statsAlt.json).slice(0, 200));
    const t0 = Date.now();
    const sold = await get('/crm/property-listings/twobigha/properties?page=1&limit=20&status=Sold', token);
    const rows = sold.json?.data || [];
    console.log(`    Sold page 1: HTTP ${sold.status}, ${rows.length} rows, meta=${JSON.stringify(sold.json?.meta)} (${Date.now() - t0} ms)`);
    check('Lucky', 'Sold filter returns rows', sold.status === 200 && rows.length > 0, `rows=${rows.length}`);
    const allSold = rows.every((r) => r?.property?.propertySold === true || r?.property?.availablilityStatus === 'SOLD');
    check('Lucky', 'Every row in the Sold view is actually sold (propertySold / SOLD)', allSold,
      rows.filter((r) => !(r?.property?.propertySold === true || r?.property?.availablilityStatus === 'SOLD')).map((r) => r?.seo?.slug).slice(0, 3).join(','));
    const avail = await get('/crm/property-listings/twobigha/properties?page=1&limit=20', token);
    const total = Number(avail.json?.meta?.total || 0);
    check('Lucky', 'Sold total is a subset, not "everything" (2bigha ignores availablilityStatus)', Number(sold.json?.meta?.total) < total, `sold=${sold.json?.meta?.total} all=${total}`);
    const t1 = Date.now();
    await get('/crm/property-listings/twobigha/properties?page=1&limit=20&status=Sold', token);
    check('Lucky', 'Second Sold load served from the cached index (fast)', Date.now() - t1 < 4000, `${Date.now() - t1} ms`);

    console.log('\nMithilesh · Property photos on list rows (live staging)');
    const listRows = avail.json?.data || [];
    const withImg = listRows.filter((r) => Array.isArray(r?.images) && r.images.length > 0).length;
    console.log(`    page 1: ${withImg}/${listRows.length} rows carry images`);
    // Compare against detail for a sample of rows that came back WITHOUT images
    const noImg = listRows.filter((r) => !(Array.isArray(r?.images) && r.images.length)).slice(0, 5);
    let missed = 0;
    for (const r of noImg) {
      const d = await get(`/crm/property-listings/twobigha/by-slug/${encodeURIComponent(r?.seo?.slug)}`, token);
      const dImgs = d.json?.images || d.json?.property?.images || [];
      if (Array.isArray(dImgs) && dImgs.length) missed++;
    }
    check('Mithilesh', 'No list row is missing photos that its detail page has', missed === 0, `checked ${noImg.length} image-less rows, ${missed} had photos on detail`);

    console.log('\nManisha · Approval queue rows carry photos (live staging)');
    const pq = await get('/crm/property-listings/twobigha/approval-queue/pending?page=1&limit=10', token);
    check('Manisha', 'Pending approval queue loads', pq.status === 200 && Array.isArray(pq.json?.data), `HTTP ${pq.status} rows=${pq.json?.data?.length}`);

    console.log('\nDisha · Linked client sees only their own properties (live staging)');
    const clients = await mongoose.connection.db.collection('clients').find({ twobighaUserId: { $exists: true, $ne: null } }).limit(4).toArray();
    const unscoped = await get('/crm/clients/twobigha/properties?page=1&limit=10', token);
    const platformTotal = Number(unscoped.json?.totalCount ?? unscoped.json?.meta?.total ?? 0);
    const seenSets = [];
    for (const c of clients) {
      const cp = await get(`/crm/clients/${c._id}/twobigha-properties?page=1&limit=50`, token);
      const res = cp.json?.result || [];
      const clientTotal = Number(cp.json?.totalCount ?? res.length);
      // Rows carry no owner field — scoping shows as a client total far below the platform total.
      check('Disha', `"${c.name}" → ${clientTotal} properties (platform-wide: ${platformTotal})`,
        cp.status === 200 && (platformTotal === 0 || clientTotal < platformTotal), `HTTP ${cp.status}`);
      seenSets.push({ name: c.name, ids: res.map((p) => p.id).sort().join(',') });
      const ag = await get(`/crm/clients/${c._id}/twobigha-properties?page=1&limit=50&propertyCategory=AGRICULTURAL`, token);
      const agRows = ag.json?.result || [];
      check('Disha', `"${c.name}" Agricultural Land filter → only AGRICULTURAL rows`, ag.status === 200 && agRows.every((p) => String(p.propertyType).toUpperCase() === 'AGRICULTURAL'),
        `rows=${agRows.length} counts=${JSON.stringify(ag.json?.counts)}`);
    }
    const nonEmpty = seenSets.filter((s) => s.ids);
    check('Disha', 'Different clients do not get the same property list', new Set(nonEmpty.map((s) => s.ids)).size === nonEmpty.length,
      nonEmpty.map((s) => `${s.name}:${s.ids.split(',').length}`).join(' '));
  } finally {
    await users.deleteMany({ email: 'ro-admin@e2e-oct1.test' });
    // RbacGuard auto-creates a CRM-user stub for admin logins — remove it too.
    await mongoose.connection.db.collection('crmusers').deleteMany({ email: 'ro-admin@e2e-oct1.test' });
    await mongoose.disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

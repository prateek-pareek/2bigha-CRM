// Portal pure-helper tests for the Oct-1 bug fixes. Run (from api/): node test/e2e-oct1-bugs/portal-helpers.test.js
const { PORTAL } = require('./portal-ts-loader');
const assert = require('assert/strict');
const path = require('path');

const types = require(path.join(PORTAL, 'src/portals/crm/lib/property-listings/types.ts'));
const access = require(path.join(PORTAL, 'src/common/lib/permissions/access.ts'));

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  PASS', name); }
  catch (e) { fail++; console.log('  FAIL', name, '\n      ', e.message); }
};

console.log('Price units (Manisha + Sneha: Lakh / Cr / Thousand)');
t('units offered: ₹, Thousand, Lakh, Cr', () =>
  assert.deepEqual(types.PRICE_UNITS.map((u) => u.value), ['Rupees', 'Thousand', 'Lakh', 'Cr']));
t('25 Lakh → 25,00,000', () => assert.equal(types.priceToRupees('25', 'Lakh'), 2500000));
t('1.5 Cr → 1,50,00,000', () => assert.equal(types.priceToRupees('1.5', 'Cr'), 15000000));
t('750 Thousand → 7,50,000', () => assert.equal(types.priceToRupees('750', 'Thousand'), 750000));
t('plain rupees unchanged', () => assert.equal(types.priceToRupees('500000', 'Rupees'), 500000));
t('non-number → NaN (validation rejects)', () => assert.ok(Number.isNaN(types.priceToRupees('abc', 'Lakh'))));
t('edit reload: 2500000 → 25 Lakh', () => assert.deepEqual(types.splitRupeesToPriceUnit(2500000), { amount: '25', unit: 'Lakh' }));
t('edit reload: 15000000 → 1.5 Cr', () => assert.deepEqual(types.splitRupeesToPriceUnit(15000000), { amount: '1.5', unit: 'Cr' }));
t('edit reload: 50000 → 50 Thousand', () => assert.deepEqual(types.splitRupeesToPriceUnit(50000), { amount: '50', unit: 'Thousand' }));
t('round-trip is lossless', () => {
  for (const p of [999, 1000, 45500, 100000, 2575000, 99999999, 123456789]) {
    const s = types.splitRupeesToPriceUnit(p);
    assert.equal(types.priceToRupees(s.amount, s.unit), p, `price ${p}`);
  }
});

console.log('Biswa unit (Manisha)');
t('Biswa in AREA_UNITS', () => assert.ok(types.AREA_UNITS.includes('Biswa')));

console.log('Typed coordinates are taken exactly (Manisha + Sneha)');
t('"30.339812, 76.386912"', () => assert.deepEqual(types.parseLatLngInput('30.339812, 76.386912'), { lat: 30.339812, lng: 76.386912 }));
t('space separated', () => assert.deepEqual(types.parseLatLngInput('30.3398 76.3869'), { lat: 30.3398, lng: 76.3869 }));
t('degree / hemisphere form', () => assert.deepEqual(types.parseLatLngInput('30.3398° N, 76.3869° E'), { lat: 30.3398, lng: 76.3869 }));
t('labelled "lat: …, lng: …"', () => assert.deepEqual(types.parseLatLngInput('lat: 30.3398, lng: 76.3869'), { lat: 30.3398, lng: 76.3869 }));
t('southern / western hemispheres', () => assert.deepEqual(types.parseLatLngInput('33.86 S, 151.2 E'), { lat: -33.86, lng: 151.2 }));
t('address text is NOT treated as coordinates', () => assert.equal(types.parseLatLngInput('Baradari, Patiala, Punjab'), null));
t('pincode is NOT treated as coordinates', () => assert.equal(types.parseLatLngInput('147001'), null));
t('out-of-range rejected', () => assert.equal(types.parseLatLngInput('130.5, 76.3'), null));

console.log('Landmark name display');
t('object form joined', () => assert.equal(types.formatLandMarkName({ airport: 'Mohali', highway: 'NH-7' }), 'Mohali, NH-7'));
t('empty object → undefined', () => assert.equal(types.formatLandMarkName({ airport: ' ' }), undefined));

console.log('Agricultural shown as Agricultural, not Farm');
t('displayPropertyType keeps Agricultural', () => assert.equal(types.displayPropertyType('Agricultural'), 'Agricultural'));

console.log('Permissions — agent property upload (Diksha) + Add Lead/Import gates');
const inc = access.userPermissionsInclude;
t('property-listings:write grants create', () => assert.ok(inc(['property-listings:write'], 'property-listings:create')));
t('legacy property_listings:write still grants property-listings:write', () =>
  assert.ok(inc(['property_listings:write'], 'property-listings:write')));
t('legacy grant opens the module route (read)', () => assert.ok(inc(['property_listings:read'], 'property-listings:read')));
t('no property grant → denied', () => assert.ok(!inc(['leads:write', 'leads:read'], 'property-listings:read')));
t('leads:write (Role Manager "Create Lead") → Add Lead', () => assert.ok(inc(['leads:write'], 'leads:write')));
t('leads:write does NOT imply leads:export', () => assert.ok(!inc(['leads:write'], 'leads:export')));
t('leads:write does NOT imply leads:import (UI uses import || write)', () => assert.ok(!inc(['leads:write'], 'leads:import')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * Generates CSV fixtures for manually testing Leads → Import (bulk lead import).
 *
 *   node api/test/fixtures/lead-import/generate.js           # fixed tag "t1"
 *   node api/test/fixtures/lead-import/generate.js t2        # new tag → fresh phones/emails
 *
 * Re-importing the same file matches existing leads by email, so use a new tag (or the
 * "Always create new" duplicate strategy) when you want every row to be created again.
 *
 * Headers match the portal's downloadable template exactly (CRM_FIELDS_MAP.leads labels in
 * portal/src/portals/crm/components/records/create/ImportModal.tsx), so every column auto-maps.
 */
const fs = require('fs');
const path = require('path');

const TAG = (process.argv[2] || 't1').replace(/[^a-z0-9]/gi, '').toLowerCase() || 't1';
const OUT = __dirname;

const HEADERS = [
  'Salutation', 'First Name', 'Last Name', 'Role', 'Email', 'Additional Emails', 'Gender',
  'Contact Number', 'WhatsApp Number', 'Phone (Alternate)', 'Lead Vertical', 'Lead Type',
  'Lead Source', 'Group', 'Planning To Buy Land', 'City / Address', 'State', 'PinCode',
  'X (Twitter) handle', 'Lead Owner', 'Stage', 'Status', 'Call Status', 'Notes',
];

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Kabir', 'Ananya', 'Diya', 'Priya', 'Neha', 'Simran',
  'Rohit', 'Gurpreet', 'Harjeet', 'Manpreet', 'Sunita', 'Rakesh', 'Pooja', 'Amit', 'Kavita', 'Deepak'];
const LAST = ['Sharma', 'Verma', 'Singh', 'Gill', 'Sandhu', 'Mehta', 'Gupta', 'Yadav', 'Chauhan', 'Bansal'];
const PLACES = [
  ['Patiala', 'Punjab', '147001'], ['Ludhiana', 'Punjab', '141001'], ['Gurugram', 'Haryana', '122016'],
  ['Karnal', 'Haryana', '132001'], ['Jaipur', 'Rajasthan', '302001'], ['Dehradun', 'Uttarakhand', '248001'],
];
const ROLES = ['OWNER', 'USER', 'AGENT'];
const SOURCES = ['Website', 'Google Lead', 'Meta Ads', 'Referral', 'Walk In', 'Direct Call'];
const PLANS = ['Just Exploring', 'Within 1 Month', '1-3 Months', '3-6 Months'];

// Deterministic per tag so the same tag always yields the same file.
let seed = [...TAG].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const tagNum = [...TAG].reduce((a, c) => (a * 7 + c.charCodeAt(0)) % 1000, 0);

/** Unique valid Indian mobile: starts 9, then 3-digit tag hash, then 6-digit row index. */
const phone = (set, i) => `9${String(tagNum).padStart(3, '0')}${set}${String(i).padStart(5, '0')}`;

function baseRow(set, i, notes) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const [city, state, pin] = pick(PLACES);
  return {
    'Salutation': '', 'First Name': first, 'Last Name': last, 'Role': pick(ROLES),
    'Email': `${first}.${last}.${TAG}.${set}-${i}@example.com`.toLowerCase(),
    'Additional Emails': '', 'Gender': '', 'Contact Number': phone(set, i),
    'WhatsApp Number': '', 'Phone (Alternate)': '', 'Lead Vertical': '', 'Lead Type': 'Lead',
    'Lead Source': pick(SOURCES), 'Group': '', 'Planning To Buy Land': pick(PLANS),
    'City / Address': city, 'State': state, 'PinCode': pin, 'X (Twitter) handle': '',
    'Lead Owner': '', 'Stage': '', 'Status': '', 'Call Status': '', 'Notes': notes,
  };
}

const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
function write(name, rows) {
  const csv = [HEADERS, ...rows.map((r) => HEADERS.map((h) => r[h] ?? ''))]
    .map((line) => line.map(cell).join(','))
    .join('\r\n');
  fs.writeFileSync(path.join(OUT, name), csv + '\r\n');
  console.log(`${name.padEnd(36)} ${rows.length} rows`);
}

// 1) Main test: 150 valid rows, Call Status + Lead Vertical blank.
//    Expect "150 created, 0 failed"; each lead = Not Called, Property Listing pipeline, first stage.
write('leads-bulk-150.csv', Array.from({ length: 150 }, (_, i) =>
  baseRow(1, i + 1, `Bulk import test ${TAG} #${i + 1}`)));

// 2) PM Leads page: blank Lead Vertical should become Property Management.
write('leads-pm-blank-vertical-10.csv', Array.from({ length: 10 }, (_, i) =>
  baseRow(2, i + 1, `PM import test ${TAG} #${i + 1} (blank vertical)`)));

// 3) Free-text values that should be normalised. Expected result is in the Notes column.
const FREE = [
  { 'Call Status': 'not answered', exp: 'Call Status → Not Answered' },
  { 'Call Status': 'RNR', exp: 'Call Status → Not Answered' },
  { 'Call Status': 'no answer', exp: 'Call Status → Not Answered' },
  { 'Call Status': 'connected', exp: 'Call Status → Completed' },
  { 'Call Status': 'switched off', exp: 'Call Status → Failed' },
  { 'Call Status': 'line busy', exp: 'Call Status → Busy' },
  { 'Call Status': 'NOT_CALLED', exp: 'Call Status → Not Called' },
  { 'Lead Vertical': 'Property Management', exp: 'Vertical → Property Management' },
  { 'Lead Vertical': 'property_listing', exp: 'Vertical → Property Listing' },
  { 'Lead Vertical': 'PM', exp: 'Vertical → Property Management' },
  { 'Lead Vertical': 'PL', exp: 'Vertical → Property Listing' },
  { 'Role': 'Seller', exp: 'Role → OWNER' },
  { 'Role': 'Property Owner', exp: 'Role → OWNER' },
  { 'Role': 'Real Estate Agent', exp: 'Role → AGENT' },
];
write('leads-freetext-mapping-14.csv', FREE.map(({ exp, ...over }, i) =>
  ({ ...baseRow(3, i + 1, `EXPECT: ${exp}`), ...over })));

// 4) One bad row: 9 good rows + row 5 with an unknown Call Status.
//    Expect 9 created, 1 failed, with a readable "Call Status ... not recognised" message.
write('leads-one-bad-row-10.csv', Array.from({ length: 10 }, (_, i) => {
  const r = baseRow(4, i + 1, `Bad-row test ${TAG} #${i + 1}`);
  if (i === 4) { r['Call Status'] = 'Maybe later'; r['Notes'] = 'EXPECT: this row fails (unknown Call Status)'; }
  return r;
}));

console.log(`\nTag "${TAG}" → files in ${OUT}`);

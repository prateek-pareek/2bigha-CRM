/**
 * Seeds login users (Admin / Team Lead / Agent) plus genuine-looking CRM
 * records so role dashboards show live numbers from MongoDB.
 *
 * Idempotent — tagged with SEED_TAG and replaced on re-run.
 *
 * Usage (from api/):
 *   npm run seed:demo
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { seedCrmRoles } from '../src/seed-crm-roles';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI =
  process.env.MONGO_URI_CRM || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mathionix-crm';

const SEED_TAG = '2bigha-demo-v1';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@mathionix.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
const TEAM_LEAD_PASSWORD = process.env.SEED_TEAMLEAD_PASSWORD || 'TeamLead@123';
const AGENT_PASSWORD = process.env.SEED_AGENT_PASSWORD || 'Agent@123';

type DemoRole = 'Admin' | 'Team Lead' | 'Agent';

type DemoUserSpec = {
  key: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: DemoRole;
  reportsToKey?: string;
  mobile: string;
  department: string;
  designation: string;
  availability?: 'available' | 'unavailable_today';
  attendance?: string;
};

const DEMO_USERS: DemoUserSpec[] = [
  {
    key: 'admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    firstName: 'System',
    lastName: 'Admin',
    role: 'Admin',
    mobile: '+919811000001',
    department: 'Leadership',
    designation: 'CRM Administrator',
  },
  {
    key: 'priya',
    email: 'priya.sharma@2bigha.com',
    password: TEAM_LEAD_PASSWORD,
    firstName: 'Priya',
    lastName: 'Sharma',
    role: 'Team Lead',
    mobile: '+919811223344',
    department: 'Sales — North',
    designation: 'Team Lead, NCR',
  },
  {
    key: 'rahul',
    email: 'rahul.mehta@2bigha.com',
    password: AGENT_PASSWORD,
    firstName: 'Rahul',
    lastName: 'Mehta',
    role: 'Agent',
    reportsToKey: 'priya',
    mobile: '+919812334455',
    department: 'Sales — North',
    designation: 'Calling Agent',
  },
  {
    key: 'ananya',
    email: 'ananya.iyer@2bigha.com',
    password: AGENT_PASSWORD,
    firstName: 'Ananya',
    lastName: 'Iyer',
    role: 'Agent',
    reportsToKey: 'priya',
    mobile: '+919813445566',
    department: 'Sales — North',
    designation: 'Calling Agent',
  },
  {
    key: 'vikram',
    email: 'vikram.singh@2bigha.com',
    password: AGENT_PASSWORD,
    firstName: 'Vikram',
    lastName: 'Singh',
    role: 'Agent',
    reportsToKey: 'priya',
    mobile: '+919814556677',
    department: 'Sales — North',
    designation: 'Field Agent',
    availability: 'unavailable_today',
    attendance: 'On Leave',
  },
  {
    key: 'arjun',
    email: 'arjun.kapoor@2bigha.com',
    password: TEAM_LEAD_PASSWORD,
    firstName: 'Arjun',
    lastName: 'Kapoor',
    role: 'Team Lead',
    mobile: '+919822667788',
    department: 'Sales — West',
    designation: 'Team Lead, West India',
  },
  {
    key: 'neha',
    email: 'neha.patel@2bigha.com',
    password: AGENT_PASSWORD,
    firstName: 'Neha',
    lastName: 'Patel',
    role: 'Agent',
    reportsToKey: 'arjun',
    mobile: '+919823778899',
    department: 'Sales — West',
    designation: 'Calling Agent',
  },
  {
    key: 'sid',
    email: 'siddharth.rao@2bigha.com',
    password: AGENT_PASSWORD,
    firstName: 'Siddharth',
    lastName: 'Rao',
    role: 'Agent',
    reportsToKey: 'arjun',
    mobile: '+919824889900',
    department: 'Sales — West',
    designation: 'Calling Agent',
  },
];

type SeededUser = DemoUserSpec & {
  platformId: mongoose.Types.ObjectId;
  crmId: mongoose.Types.ObjectId;
  displayName: string;
};

const LEAD_PEOPLE: Array<{
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  organization: string;
  city: string;
  jobTitle: string;
  category: string;
  group: string;
  status: string;
  stage: string;
  notes: string;
  intents: string[];
}> = [
  {
    firstName: 'Kavita',
    lastName: 'Agarwal',
    email: 'kavita.agarwal@agarwalholdings.in',
    mobile: '+919810112233',
    organization: 'Agarwal Holdings',
    city: 'Gurugram',
    jobTitle: 'Director',
    category: 'Buyer lead',
    group: 'Buyer',
    status: 'New',
    stage: 'New',
    notes: 'Looking for a 4BHK in DLF Camellias / Golf Course Road. Budget 8–12 Cr.',
    intents: ['Buy residential', 'Subscription'],
  },
  {
    firstName: 'Rohit',
    lastName: 'Malhotra',
    email: 'rohit.malhotra@malhotragroup.com',
    mobile: '+919820223344',
    organization: 'Malhotra Group',
    city: 'New Delhi',
    jobTitle: 'Managing Partner',
    category: 'Investor',
    group: 'Investor',
    status: 'Contacted',
    stage: 'Contact Made',
    notes: 'Wants a farmhouse plot near Chattarpur for weekend home + agri use.',
    intents: ['Buy farm', 'List property'],
  },
  {
    firstName: 'Sneha',
    lastName: 'Reddy',
    email: 'sneha.reddy@hydtech.in',
    mobile: '+919849334455',
    organization: 'Hyderabad Tech Parks',
    city: 'Hyderabad',
    jobTitle: 'VP Real Estate',
    category: 'Buyer lead',
    group: 'Buyer',
    status: 'Qualified',
    stage: 'Qualified',
    notes: 'Corporate lease for 18,000 sqft Grade-A office in HITEC City.',
    intents: ['Buy commercial'],
  },
  {
    firstName: 'Amit',
    lastName: 'Joshi',
    email: 'amit.joshi@puneinfra.co',
    mobile: '+919881445566',
    organization: 'Pune Infra Co',
    city: 'Pune',
    jobTitle: 'Founder',
    category: 'Seller',
    group: 'Seller',
    status: 'Proposal',
    stage: 'Proposal Presented',
    notes: 'Listing a 3-acre agri plot on Pune-Satara road. Wants 2Bigha farm listing.',
    intents: ['List farm', 'Sell land'],
  },
  {
    firstName: 'Meera',
    lastName: 'Nair',
    email: 'meera.nair@kochispices.com',
    mobile: '+919846556677',
    organization: 'Kochi Spices Pvt Ltd',
    city: 'Bengaluru',
    jobTitle: 'CFO',
    category: 'Buyer lead',
    group: 'Buyer',
    status: 'Negotiation',
    stage: 'Negotiation',
    notes: 'Villa in Whitefield, 5BHK, pool. Family relocating from Kochi.',
    intents: ['Buy residential'],
  },
  {
    firstName: 'Farhan',
    lastName: 'Qureshi',
    email: 'farhan.qureshi@lucknowestates.in',
    mobile: '+919415667788',
    organization: 'Lucknow Estates',
    city: 'Noida',
    jobTitle: 'Principal',
    category: 'Investor',
    group: 'Investor',
    status: 'Converted',
    stage: 'Closed Won',
    notes: 'Closed two plots in Sector 150. Asking about subscription renewal.',
    intents: ['Subscription', 'Buy land'],
  },
  {
    firstName: 'Pooja',
    lastName: 'Deshmukh',
    email: 'pooja.deshmukh@deshmukhfarms.in',
    mobile: '+919822778899',
    organization: 'Deshmukh Farms',
    city: 'Nashik',
    jobTitle: 'Owner',
    category: 'Seller',
    group: 'Seller',
    status: 'Contacted',
    stage: 'Contact Made',
    notes: '12-acre vineyard + farmhouse. Interested in 2Bigha farm marketplace.',
    intents: ['List farm'],
  },
  {
    firstName: 'Nikhil',
    lastName: 'Bansal',
    email: 'nikhil.bansal@jaipurbricks.com',
    mobile: '+919414889900',
    organization: 'Jaipur Bricks',
    city: 'Jaipur',
    jobTitle: 'Director Sales',
    category: 'Buyer lead',
    group: 'Buyer',
    status: 'New',
    stage: 'New',
    notes: 'Wants a 2BHK for son near Mansarovar. Budget 65–80 L.',
    intents: ['Buy residential'],
  },
  {
    firstName: 'Aisha',
    lastName: 'Khan',
    email: 'aisha.khan@mumbaiworks.in',
    mobile: '+919820990011',
    organization: 'Mumbai Works',
    city: 'Mumbai',
    jobTitle: 'Head of Ops',
    category: 'Buyer lead',
    group: 'Buyer',
    status: 'Qualified',
    stage: 'Qualified',
    notes: 'Sea-facing 3BHK in Worli. Site visit scheduled.',
    intents: ['Buy residential'],
  },
  {
    firstName: 'Gaurav',
    lastName: 'Sethi',
    email: 'gaurav.sethi@sethicapital.in',
    mobile: '+919811001122',
    organization: 'Sethi Capital',
    city: 'Gurugram',
    jobTitle: 'Partner',
    category: 'Investor',
    group: 'Investor',
    status: 'Lost',
    stage: 'Closed Lost',
    notes: 'Went with another broker on Golf Course Extn warehouse deal.',
    intents: ['Buy commercial'],
  },
  {
    firstName: 'Lakshmi',
    lastName: 'Menon',
    email: 'lakshmi.menon@chennaiports.in',
    mobile: '+919840112233',
    organization: 'Chennai Ports Logistics',
    city: 'Chennai',
    jobTitle: 'GM',
    category: 'Buyer lead',
    group: 'Buyer',
    status: 'Contacted',
    stage: 'Contact Made',
    notes: 'Warehouse near Sriperumbudur, 40,000 sqft. Timeline 90 days.',
    intents: ['Buy commercial'],
  },
  {
    firstName: 'Harsh',
    lastName: 'Vardhan',
    email: 'harsh.vardhan@vardhanagri.in',
    mobile: '+919414223344',
    organization: 'Vardhan Agri Lands',
    city: 'Jaipur',
    jobTitle: 'Promoter',
    category: 'Seller',
    group: 'Seller',
    status: 'New',
    stage: 'New',
    notes: '48 bigha agricultural land on Jaipur-Ajmer highway. Clear title.',
    intents: ['List farm', 'Sell land'],
  },
  {
    firstName: 'Divya',
    lastName: 'Kapoor',
    email: 'divya.kapoor@kapoorhomes.in',
    mobile: '+919811334455',
    organization: 'Kapoor Homes',
    city: 'Noida',
    jobTitle: 'Director',
    category: 'Seller',
    group: 'Seller',
    status: 'Proposal',
    stage: 'Proposal Presented',
    notes: 'Inventory of 11 builder floors in Sector 50. Wants listing + lead routing.',
    intents: ['List property'],
  },
  {
    firstName: 'Sanjay',
    lastName: 'Pillai',
    email: 'sanjay.pillai@goavillas.in',
    mobile: '+919822445566',
    organization: 'Goa Villas',
    city: 'North Goa',
    jobTitle: 'Owner',
    category: 'Seller',
    group: 'Seller',
    status: 'Qualified',
    stage: 'Qualified',
    notes: 'Portuguese villa in Assagao, 5BHK, pool. NRI buyer interest.',
    intents: ['List property', 'Sell residential'],
  },
  {
    firstName: 'Ritu',
    lastName: 'Saxena',
    email: 'ritu.saxena@indoresteel.com',
    mobile: '+919826556677',
    organization: 'Indore Steel Traders',
    city: 'Indore',
    jobTitle: 'Proprietor',
    category: 'Buyer lead',
    group: 'Buyer',
    status: 'New',
    stage: 'New',
    notes: 'Plot for factory expansion, 2 acres, Dewas bypass.',
    intents: ['Buy industrial'],
  },
  {
    firstName: 'Yusuf',
    lastName: 'Ali',
    email: 'yusuf.ali@hydestates.in',
    mobile: '+919849667788',
    organization: 'Hyderabad Estates',
    city: 'Hyderabad',
    jobTitle: 'Broker partner',
    category: 'Reference',
    group: 'Buyer',
    status: 'Contacted',
    stage: 'Contact Made',
    notes: 'Sends 4–5 Jubilee Hills / Banjara Hills buyer refs a month.',
    intents: ['Buy residential'],
  },
];

const PROPERTY_SPECS: Array<{
  title: string;
  address: string;
  city: string;
  state: string;
  price: number;
  propertyType: string;
  listingBucket: 'properties' | 'farm';
  listedFor: 'Sale' | 'Rent';
  bedrooms?: number;
  bathrooms?: number;
  areaSqft?: number;
  approvalStatus: 'Pending' | 'Approved' | 'Rejected';
  status: 'Available' | 'Under Offer' | 'Sold';
  description: string;
  ownerKey: string;
  daysAgo: number;
}> = [
  {
    title: '4BHK Duplex — DLF Camellias, Golf Course Road',
    address: 'Tower C, DLF Camellias, Sector 42',
    city: 'Gurugram',
    state: 'Haryana',
    price: 112500000,
    propertyType: 'Apartment',
    listingBucket: 'properties',
    listedFor: 'Sale',
    bedrooms: 4,
    bathrooms: 5,
    areaSqft: 4200,
    approvalStatus: 'Approved',
    status: 'Available',
    description: 'Corner duplex with club access. Seeded demo listing.',
    ownerKey: 'rahul',
    daysAgo: 0,
  },
  {
    title: '3BHK High-floor — Godrej Woods, Sector 43',
    address: 'Godrej Woods, Sector 43',
    city: 'Noida',
    state: 'Uttar Pradesh',
    price: 28500000,
    propertyType: 'Apartment',
    listingBucket: 'properties',
    listedFor: 'Sale',
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1850,
    approvalStatus: 'Pending',
    status: 'Available',
    description: 'Park-facing, ready to move. Seeded demo listing.',
    ownerKey: 'ananya',
    daysAgo: 1,
  },
  {
    title: 'Farmhouse — 2.4 acres, Chattarpur',
    address: 'Chattarpur Mandir Road',
    city: 'New Delhi',
    state: 'Delhi',
    price: 185000000,
    propertyType: 'Farmhouse',
    listingBucket: 'farm',
    listedFor: 'Sale',
    bedrooms: 6,
    bathrooms: 7,
    areaSqft: 18000,
    approvalStatus: 'Approved',
    status: 'Under Offer',
    description: 'Orchard + guest cottages. Seeded demo listing.',
    ownerKey: 'vikram',
    daysAgo: 4,
  },
  {
    title: 'Agricultural land — 12 acre vineyard, Nashik',
    address: 'Gangapur Road, Nashik',
    city: 'Nashik',
    state: 'Maharashtra',
    price: 42000000,
    propertyType: 'Farmland',
    listingBucket: 'farm',
    listedFor: 'Sale',
    areaSqft: 522720,
    approvalStatus: 'Approved',
    status: 'Available',
    description: 'Drip irrigation, farmhouse, cellar. Seeded demo listing.',
    ownerKey: 'neha',
    daysAgo: 2,
  },
  {
    title: 'Sea-facing 3BHK — Worli Sea Face',
    address: 'Worli Sea Face',
    city: 'Mumbai',
    state: 'Maharashtra',
    price: 97500000,
    propertyType: 'Apartment',
    listingBucket: 'properties',
    listedFor: 'Sale',
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 2100,
    approvalStatus: 'Approved',
    status: 'Available',
    description: 'Refurbished, car park x2. Seeded demo listing.',
    ownerKey: 'sid',
    daysAgo: 0,
  },
  {
    title: 'Independent villa — Whitefield, Bengaluru',
    address: 'Hope Farm Junction, Whitefield',
    city: 'Bengaluru',
    state: 'Karnataka',
    price: 54000000,
    propertyType: 'Villa',
    listingBucket: 'properties',
    listedFor: 'Sale',
    bedrooms: 5,
    bathrooms: 5,
    areaSqft: 4800,
    approvalStatus: 'Pending',
    status: 'Available',
    description: 'Private pool, servant quarter. Seeded demo listing.',
    ownerKey: 'ananya',
    daysAgo: 8,
  },
  {
    title: 'Grade-A office — HITEC City, 18,200 sqft',
    address: 'Cyber Towers precinct, HITEC City',
    city: 'Hyderabad',
    state: 'Telangana',
    price: 162000000,
    propertyType: 'Office',
    listingBucket: 'properties',
    listedFor: 'Rent',
    areaSqft: 18200,
    approvalStatus: 'Approved',
    status: 'Available',
    description: 'IT/ITES fitted. Seeded demo listing.',
    ownerKey: 'rahul',
    daysAgo: 12,
  },
  {
    title: 'Portuguese villa — Assagao, North Goa',
    address: 'Assagao village',
    city: 'North Goa',
    state: 'Goa',
    price: 68000000,
    propertyType: 'Villa',
    listingBucket: 'properties',
    listedFor: 'Sale',
    bedrooms: 5,
    bathrooms: 5,
    areaSqft: 6200,
    approvalStatus: 'Rejected',
    status: 'Available',
    description: 'Docs pending mutation. Seeded demo listing.',
    ownerKey: 'sid',
    daysAgo: 18,
  },
  {
    title: 'Builder floor inventory — Sector 50, Noida (unit 7)',
    address: 'Sector 50',
    city: 'Noida',
    state: 'Uttar Pradesh',
    price: 19500000,
    propertyType: 'Independent House',
    listingBucket: 'properties',
    listedFor: 'Sale',
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1650,
    approvalStatus: 'Approved',
    status: 'Sold',
    description: 'Closed last month. Seeded demo listing.',
    ownerKey: 'neha',
    daysAgo: 35,
  },
  {
    title: 'Agri land — 48 bigha, Jaipur–Ajmer highway',
    address: 'NH-48, Kishangarh side',
    city: 'Jaipur',
    state: 'Rajasthan',
    price: 31000000,
    propertyType: 'Agricultural',
    listingBucket: 'farm',
    listedFor: 'Sale',
    areaSqft: 1306800,
    approvalStatus: 'Pending',
    status: 'Available',
    description: 'Clear title, canal water. Seeded demo listing.',
    ownerKey: 'vikram',
    daysAgo: 3,
  },
  {
    title: '2BHK — Mansarovar, Jaipur',
    address: 'Shipra Path, Mansarovar',
    city: 'Jaipur',
    state: 'Rajasthan',
    price: 7200000,
    propertyType: 'Apartment',
    listingBucket: 'properties',
    listedFor: 'Sale',
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 1050,
    approvalStatus: 'Approved',
    status: 'Available',
    description: 'Ready possession. Seeded demo listing.',
    ownerKey: 'rahul',
    daysAgo: 6,
  },
  {
    title: 'Warehouse — 40,000 sqft, Sriperumbudur',
    address: 'Oragadam industrial corridor',
    city: 'Chennai',
    state: 'Tamil Nadu',
    price: 88000000,
    propertyType: 'Warehouse',
    listingBucket: 'properties',
    listedFor: 'Rent',
    areaSqft: 40000,
    approvalStatus: 'Approved',
    status: 'Available',
    description: '12m height, dock levellers. Seeded demo listing.',
    ownerKey: 'ananya',
    daysAgo: 21,
  },
];

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

function daysAgoAt(days: number, hour = 11, minute = 15): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function monthsAgoAt(months: number, day = 14, hour = 12): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months, day);
  d.setHours(hour, (day * 3) % 60, 0, 0);
  return d;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function freeModel(conn: mongoose.Connection, name: string, collection: string) {
  return conn.model(
    name,
    new mongoose.Schema({}, { strict: false, timestamps: false, collection }),
    collection,
  );
}

async function main() {
  console.log('1/5  Ensuring CRM roles + permissions...');
  await seedCrmRoles();

  console.log(`\n2/5  Connecting to ${MONGO_URI} ...`);
  const conn = mongoose.createConnection(MONGO_URI);
  await conn.asPromise();

  try {
    const Role = freeModel(conn, 'Role', 'roles');
    const Permission = freeModel(conn, 'Permission', 'permissions');
    const User = freeModel(conn, 'User', 'users');
    const CRMUser = freeModel(conn, 'CRMUser', 'crmusers');
    const UserRole = freeModel(conn, 'UserRole', 'userroles');
    const Pipeline = freeModel(conn, 'Pipeline', 'pipelines');
    const Lead = freeModel(conn, 'Lead', 'leads');
    const Client = freeModel(conn, 'Client', 'clients');
    const Activity = freeModel(conn, 'Activity', 'activities');
    const CallLog = freeModel(conn, 'CallLog', 'crm_ivr_call_logs');
    const Property = freeModel(conn, 'PropertyListing', 'propertylistings');
    const WhatsApp = freeModel(conn, 'WhatsAppMessage', 'whatsappmessages');
    const AgentTarget = freeModel(conn, 'AgentTarget', 'crm_agent_targets');

    const crmRoles = await Role.find({ name: { $in: ['Admin', 'Team Lead', 'Agent'] } }).lean();
    const crmRoleByName = new Map(crmRoles.map((r: any) => [r.name, r]));
    if (!crmRoleByName.get('Admin') || !crmRoleByName.get('Team Lead') || !crmRoleByName.get('Agent')) {
      throw new Error('CRM roles Admin / Team Lead / Agent missing after role seed.');
    }

    const permDocs = await Permission.find({
      name: { $in: ['workspace-admin:read', 'workspace-team:read', 'workspace-agent:read', 'dashboard:read'] },
    }).lean();
    const permNames = new Set(permDocs.map((p: any) => p.name));
    console.log(
      `   Role dashboard keys present: ${['workspace-admin:read', 'workspace-team:read', 'workspace-agent:read']
        .filter((n) => permNames.has(n))
        .join(', ')}`,
    );

    const hrmsRoleSpecs: Record<DemoRole, { crmPermissions: string[]; description: string }> = {
      Admin: {
        description: 'Org-wide CRM admin dashboard',
        crmPermissions: ['admin:manage', 'settings:admin', 'dashboard:read', 'workspace-admin:read'],
      },
      'Team Lead': {
        description: 'Team dashboard — own reports only',
        crmPermissions: ['workspace-team:read', 'leads:read:team'],
      },
      Agent: {
        description: 'Agent dashboard — own records only',
        crmPermissions: ['workspace-agent:read', 'leads:read', 'leads:write'],
      },
    };

    const hrmsRoleIds = new Map<DemoRole, mongoose.Types.ObjectId>();
    for (const [name, spec] of Object.entries(hrmsRoleSpecs) as Array<[DemoRole, (typeof hrmsRoleSpecs)[DemoRole]]>) {
      const doc = await UserRole.findOneAndUpdate(
        { name },
        {
          $set: {
            name,
            description: spec.description,
            isActive: true,
            permissions: [],
            crmPermissions: spec.crmPermissions,
            pmPermissions: [],
            permittedTools: ['CRM'],
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      hrmsRoleIds.set(name, doc._id as mongoose.Types.ObjectId);
    }

    console.log('\n3/5  Upserting login users...');
    const passwordHashByPlain = new Map<string, string>();
    for (const u of DEMO_USERS) {
      if (!passwordHashByPlain.has(u.password)) {
        passwordHashByPlain.set(u.password, await bcrypt.hash(u.password, 10));
      }
    }

    const seeded = new Map<string, SeededUser>();
    const today = ymd(new Date());

    for (const spec of DEMO_USERS) {
      const hash = passwordHashByPlain.get(spec.password)!;
      const existingSuite = await User.findOne({ email: spec.email }).lean();
      const existingCrm = await CRMUser.findOne({ email: spec.email }).lean();
      const platformId = (existingSuite?._id as mongoose.Types.ObjectId) || new mongoose.Types.ObjectId();
      const crmId = (existingCrm?._id as mongoose.Types.ObjectId) || new mongoose.Types.ObjectId();
      const displayName = `${spec.firstName} ${spec.lastName}`;
      const hrmsRoleId = hrmsRoleIds.get(spec.role);
      const crmRole = crmRoleByName.get(spec.role) as any;
      const crmPerms = hrmsRoleSpecs[spec.role].crmPermissions;

      await User.findOneAndUpdate(
        { email: spec.email },
        {
          $set: {
            email: spec.email,
            password: hash,
            firstName: spec.firstName,
            lastName: spec.lastName,
            role: spec.role,
            roleId: hrmsRoleId,
            useRoleOverrides: true,
            permissions: spec.role === 'Admin' ? ['all', 'admin:manage'] : [],
            crmPermissions: crmPerms,
            permittedTools: ['CRM'],
            is_archived: false,
            tokenVersion: existingSuite?.tokenVersion || 0,
            accessVersion: 1,
          },
          $setOnInsert: { _id: platformId, createdAt: new Date() },
        },
        { upsert: true },
      );

      await CRMUser.findOneAndUpdate(
        { email: spec.email },
        {
          $set: {
            email: spec.email,
            password: hash,
            firstName: spec.firstName,
            lastName: spec.lastName,
            role: spec.role === 'Admin' ? 'Admin' : spec.role,
            roleId: crmRole._id,
            permissions: crmPerms,
            isActive: true,
            provisioningStatus: spec.role === 'Admin' ? 'manual' : 'active',
            agentMobile: spec.mobile,
            department: spec.department,
            designation: spec.designation,
            availabilityStatus: spec.availability || 'available',
            availabilityDate: today,
            availabilityAttendanceStatus: spec.attendance || 'Present',
            availabilitySource: 'demo-seed',
          },
          $setOnInsert: { _id: crmId, createdAt: new Date() },
        },
        { upsert: true },
      );

      seeded.set(spec.key, { ...spec, platformId, crmId, displayName });
      console.log(`   ✓ ${displayName.padEnd(18)}  ${spec.email.padEnd(28)}  ${spec.role}`);
    }

    for (const spec of DEMO_USERS) {
      if (!spec.reportsToKey) continue;
      const agent = seeded.get(spec.key)!;
      const lead = seeded.get(spec.reportsToKey)!;
      await User.updateOne({ _id: agent.platformId }, { $set: { reportsTo: lead.platformId } });
    }

    const agents = [...seeded.values()].filter((u) => u.role === 'Agent');
    const byKey = (k: string) => seeded.get(k)!;

    console.log('\n4/5  Replacing tagged demo operational data...');
    await Promise.all([
      Lead.deleteMany({ 'customFields.seedTag': SEED_TAG }),
      Client.deleteMany({ 'customFields.seedTag': SEED_TAG }),
      Activity.deleteMany({ 'metadata.seedTag': SEED_TAG }),
      CallLog.deleteMany({ sessionId: { $regex: `^${SEED_TAG}` } }),
      Property.deleteMany({ seedTag: SEED_TAG }),
      WhatsApp.deleteMany({ messageId: { $regex: `^${SEED_TAG}` } }),
    ]);

    let pipeline = await Pipeline.findOne({ name: '2Bigha Property Listing' });
    if (!pipeline) {
      pipeline = await Pipeline.create({
        name: '2Bigha Property Listing',
        type: 'leads',
        leadVertical: 'property_listing',
        isDefault: true,
        isActive: true,
        stages: [
          { name: 'New', probability: 10, order: 1, isDefault: true },
          { name: 'Contact Made', probability: 25, order: 2, isDefault: false },
          { name: 'Qualified', probability: 45, order: 3, isDefault: false },
          { name: 'Proposal Presented', probability: 60, order: 4, isDefault: false },
          { name: 'Negotiation', probability: 80, order: 5, isDefault: false },
          { name: 'Closed Won', probability: 100, order: 6, isDefault: false },
          { name: 'Closed Lost', probability: 0, order: 7, isDefault: false },
        ],
      });
      console.log('   Created pipeline: 2Bigha Property Listing');
    }

    const createdAtSlots: Date[] = [
      hoursAgo(1),
      hoursAgo(3),
      hoursAgo(5),
      hoursAgo(8),
      daysAgoAt(1, 10, 20),
      daysAgoAt(1, 16, 5),
      daysAgoAt(2, 11, 40),
      daysAgoAt(3, 9, 10),
      daysAgoAt(4, 14, 55),
      daysAgoAt(5, 12, 0),
      daysAgoAt(8, 11, 30),
      daysAgoAt(12, 15, 10),
      daysAgoAt(18, 10, 45),
      daysAgoAt(22, 13, 20),
      monthsAgoAt(1, 6),
      monthsAgoAt(1, 21),
      monthsAgoAt(2, 9),
      monthsAgoAt(2, 27),
      monthsAgoAt(3, 4),
      monthsAgoAt(3, 19),
      monthsAgoAt(4, 11),
      monthsAgoAt(4, 25),
      monthsAgoAt(5, 8),
      monthsAgoAt(5, 22),
    ];

    const leadDocs: any[] = [];
    const clientDocs: any[] = [];
    const expandedPeople = [...LEAD_PEOPLE, ...LEAD_PEOPLE.slice(0, 8)];

    for (let i = 0; i < expandedPeople.length; i++) {
      const person = expandedPeople[i];
      const agent = agents[i % agents.length];
      const createdAt = createdAtSlots[i % createdAtSlots.length];
      const clientId = new mongoose.Types.ObjectId();
      const leadId = new mongoose.Types.ObjectId();
      const followOffset = i % 5;
      const nextFollowUpAt =
        followOffset === 0
          ? hoursAgo(-6)
          : followOffset === 1
            ? daysAgoAt(0, 17, 30)
            : followOffset === 2
              ? daysAgoAt(-2, 11, 0)
              : followOffset === 3
                ? daysAgoAt(3, 10, 0)
                : null;

      clientDocs.push({
        _id: clientId,
        name: `${person.firstName} ${person.lastName}`,
        email: i < LEAD_PEOPLE.length ? person.email : `demo.${i}.${person.email}`,
        phone: person.mobile,
        whatsappNumber: person.mobile,
        address: person.city,
        role: person.group === 'Seller' ? 'OWNER' : 'USER',
        status: person.status === 'Converted' ? 'active' : 'prospective',
        assignedTo: [agent.platformId],
        associatedLeads: [leadId],
        additionalEmails: [],
        invalidEmails: [],
        associatedOrganizations: [],
        associatedContacts: [],
        isDeleted: false,
        customFields: { seedTag: SEED_TAG, city: person.city },
        createdAt,
        updatedAt: createdAt,
      });

      leadDocs.push({
        _id: leadId,
        module: '2Bigha',
        firstName: person.firstName,
        lastName: person.lastName,
        email: i < LEAD_PEOPLE.length ? person.email : `demo.${i}.${person.email}`,
        mobileNo: person.mobile,
        organization: person.organization,
        jobTitle: person.jobTitle,
        territory: person.city,
        status: person.status,
        stage: person.stage,
        callStatus: person.status === 'New' ? 'Not Called' : person.status === 'Lost' ? 'Missed' : 'Completed',
        leadOwner: agent.displayName,
        createdBy: agent.platformId,
        createdByName: agent.displayName,
        pipeline: pipeline._id,
        converted: /convert|won/i.test(person.status),
        leadType: 'standard',
        leadVertical: 'property_listing',
        leadCategory: person.category,
        group: person.group,
        notes: person.notes,
        leadIntents: person.intents,
        nextFollowUpAt,
        clientId,
        additionalEmails: [],
        invalidEmails: [],
        associatedOrganizations: [],
        associatedLeads: [],
        associatedContacts: [],
        associatedLegalCases: [],
        sharedWith: [],
        isDeleted: false,
        twobighaSyncStatus: 'skipped',
        customFields: { seedTag: SEED_TAG, city: person.city },
        createdAt,
        updatedAt: createdAt,
      });
    }

    await Client.insertMany(clientDocs);
    await Lead.insertMany(leadDocs);
    console.log(`   ${clientDocs.length} clients, ${leadDocs.length} leads`);

    const activityDocs: any[] = [];
    const callDocs: any[] = [];
    const taskStatuses = ['Open', 'In Progress', 'Completed', 'Open'];
    const callOutcomes: Array<{ status: string; duration: number }> = [
      { status: 'Connected', duration: 185 },
      { status: 'Completed', duration: 240 },
      { status: 'Missed', duration: 0 },
      { status: 'Not Answered', duration: 0 },
      { status: 'Connected', duration: 92 },
      { status: 'Completed', duration: 310 },
    ];

    leadDocs.forEach((lead, i) => {
      const agent = agents[i % agents.length];
      const at = new Date(lead.createdAt.getTime() + 45 * 60_000);
      activityDocs.push({
        type: i % 4 === 0 ? 'Call' : i % 4 === 1 ? 'Note' : i % 4 === 2 ? 'Meeting' : 'Email',
        title:
          i % 4 === 0
            ? `Call with ${lead.firstName} ${lead.lastName}`
            : i % 4 === 1
              ? `Site notes — ${lead.territory}`
              : i % 4 === 2
                ? `Property walkthrough — ${lead.territory}`
                : `Follow-up email to ${lead.firstName}`,
        content:
          i % 4 === 0
            ? `Discussed ${lead.notes}`
            : i % 4 === 1
              ? `Buyer brief captured for ${lead.organization}.`
              : i % 4 === 2
                ? `Walked the listing with ${lead.firstName}. Next step: share comparables.`
                : `Sent brochure and 2Bigha listing link.`,
        relatedTo: lead._id,
        relatedType: 'Lead',
        author: agent.platformId,
        involvedEntities: [{ id: lead._id, type: 'Lead' }],
        isDeleted: false,
        metadata: { seedTag: SEED_TAG },
        createdAt: at,
        updatedAt: at,
      });

      if (i % 2 === 0) {
        const due = daysAgoAt(i % 3 === 0 ? -1 : i % 5, 18, 0);
        activityDocs.push({
          type: 'Task',
          title: `Follow up ${lead.firstName} ${lead.lastName}`,
          content: `Confirm site visit and share updated inventory for ${lead.territory}.`,
          relatedTo: lead._id,
          relatedType: 'Lead',
          author: agent.platformId,
          assignee: agent.crmId,
          status: taskStatuses[i % taskStatuses.length],
          involvedEntities: [{ id: lead._id, type: 'Lead' }],
          isDeleted: false,
          metadata: { seedTag: SEED_TAG, dueDate: due },
          createdAt: at,
          updatedAt: at,
        });
      }

      const outcome = callOutcomes[i % callOutcomes.length];
      const callAt = i < 6 ? hoursAgo(i + 1) : new Date(at);
      callDocs.push({
        sessionId: `${SEED_TAG}-call-${i}`,
        direction: i % 5 === 0 ? 'Incoming' : 'Outgoing',
        agentName: agent.displayName,
        agentNumber: agent.mobile,
        customerName: `${lead.firstName} ${lead.lastName}`,
        customerNumber: lead.mobileNo,
        duration: outcome.duration,
        connectedDuration: outcome.duration,
        ringingDuration: outcome.duration ? 12 : 28,
        status: outcome.status,
        notes: `Demo seed call — ${lead.notes.slice(0, 80)}`,
        loggedManually: true,
        callDate: callAt,
        initiatedByUserId: agent.platformId,
        relatedTo: lead._id,
        relatedType: 'Lead',
        createdAt: callAt,
        updatedAt: callAt,
      });
    });

    // Extra "today" calls so agent/team glance cards are non-zero on the Today window.
    agents.forEach((agent, ai) => {
      for (let n = 0; n < 3; n++) {
        const when = hoursAgo(ai + n + 1);
        callDocs.push({
          sessionId: `${SEED_TAG}-today-${agent.key}-${n}`,
          direction: 'Outgoing',
          agentName: agent.displayName,
          agentNumber: agent.mobile,
          customerName: LEAD_PEOPLE[n].firstName + ' ' + LEAD_PEOPLE[n].lastName,
          customerNumber: LEAD_PEOPLE[n].mobile,
          duration: n === 2 ? 0 : 140 + ai * 10,
          connectedDuration: n === 2 ? 0 : 140 + ai * 10,
          ringingDuration: 8,
          status: n === 2 ? 'Missed' : 'Connected',
          notes: 'Same-day follow-up (demo seed)',
          loggedManually: true,
          callDate: when,
          initiatedByUserId: agent.platformId,
          createdAt: when,
          updatedAt: when,
        });
      }
    });

    await Activity.insertMany(activityDocs);
    await CallLog.insertMany(callDocs);
    console.log(`   ${activityDocs.length} activities, ${callDocs.length} call logs`);

    const propertyDocs = PROPERTY_SPECS.map((p) => {
      const owner = byKey(p.ownerKey);
      const createdAt = daysAgoAt(p.daysAgo, 10, 30);
      return {
        module: 'PROPERTY_MGMT',
        title: p.title,
        address: p.address,
        city: p.city,
        state: p.state,
        country: 'India',
        price: p.price,
        currency: 'INR',
        propertyType: p.propertyType,
        listingBucket: p.listingBucket,
        listedFor: p.listedFor,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        areaSqft: p.areaSqft,
        status: p.status,
        approvalStatus: p.approvalStatus,
        description: p.description,
        images: [],
        amenities: [],
        listedDate: createdAt,
        contactName: owner.displayName,
        contactPhone: owner.mobile,
        createdBy: owner.crmId,
        isDeleted: false,
        seedTag: SEED_TAG,
        createdAt,
        updatedAt: createdAt,
      };
    });
    await Property.insertMany(propertyDocs);
    console.log(`   ${propertyDocs.length} property listings`);

    const waThreads = [
      { waId: '919810112233', name: 'Kavita Agarwal', agentKey: 'rahul' },
      { waId: '919820223344', name: 'Rohit Malhotra', agentKey: 'ananya' },
      { waId: '919822778899', name: 'Pooja Deshmukh', agentKey: 'neha' },
      { waId: '919820990011', name: 'Aisha Khan', agentKey: 'sid' },
      { waId: '919811334455', name: 'Divya Kapoor', agentKey: 'vikram' },
    ];
    const waDocs: any[] = [];
    waThreads.forEach((t, ti) => {
      const agent = byKey(t.agentKey);
      const inboundAt = hoursAgo(ti + 2);
      const outboundAt = hoursAgo(ti + 1);
      waDocs.push({
        waId: t.waId,
        direction: 'inbound',
        body: `Hi, I saw the ${t.name.split(' ')[0] === 'Kavita' ? 'Camellias' : 'listing'} on 2Bigha. Is it still available?`,
        messageId: `${SEED_TAG}-in-${ti}`,
        customerName: t.name,
        status: 'read',
        isRead: ti > 2,
        createdAt: inboundAt,
        updatedAt: inboundAt,
      });
      waDocs.push({
        waId: t.waId,
        direction: 'outbound',
        body: `Hello ${t.name.split(' ')[0]}, yes — I can share the brochure and arrange a site visit this week.`,
        messageId: `${SEED_TAG}-out-${ti}`,
        customerName: t.name,
        sentBy: agent.crmId,
        status: 'read',
        isRead: true,
        createdAt: outboundAt,
        updatedAt: outboundAt,
      });
    });
    await WhatsApp.insertMany(waDocs);
    console.log(`   ${waDocs.length} WhatsApp messages`);

    for (const agent of agents) {
      await AgentTarget.findOneAndUpdate(
        { agentId: agent.platformId },
        {
          $set: {
            agentId: agent.platformId,
            window: 'monthly',
            leadsTarget: 20,
            callsTarget: 80,
            propertiesTarget: 6,
          },
        },
        { upsert: true },
      );
    }
    console.log(`   ${agents.length} agent targets`);

    console.log('\n5/5  Done.\n');
    console.log('============================================================');
    console.log('  2Bigha CRM — demo login credentials');
    console.log('============================================================');
    console.log('');
    console.log('  ADMIN (org dashboard)');
    console.log(`    ${ADMIN_EMAIL}`);
    console.log(`    ${ADMIN_PASSWORD}`);
    console.log('');
    console.log('  TEAM LEAD — North (Priya Sharma, NCR)');
    console.log('    priya.sharma@2bigha.com');
    console.log(`    ${TEAM_LEAD_PASSWORD}`);
    console.log('    Direct reports: Rahul, Ananya, Vikram');
    console.log('');
    console.log('  TEAM LEAD — West (Arjun Kapoor)');
    console.log('    arjun.kapoor@2bigha.com');
    console.log(`    ${TEAM_LEAD_PASSWORD}`);
    console.log('    Direct reports: Neha, Siddharth');
    console.log('');
    console.log('  AGENTS  (password for all: ' + AGENT_PASSWORD + ')');
    console.log('    rahul.mehta@2bigha.com       North · Rahul Mehta');
    console.log('    ananya.iyer@2bigha.com       North · Ananya Iyer');
    console.log('    vikram.singh@2bigha.com      North · Vikram Singh (on leave today)');
    console.log('    neha.patel@2bigha.com        West  · Neha Patel');
    console.log('    siddharth.rao@2bigha.com     West  · Siddharth Rao');
    console.log('');
    console.log('  Dashboards read leads, calls, listings, WhatsApp and');
    console.log('  tasks from Mongo — reopen /crm/workspace after login.');
    console.log('============================================================');
  } finally {
    await conn.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Demo seed failed:', err);
    process.exit(1);
  });

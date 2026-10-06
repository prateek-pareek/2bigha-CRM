import * as dotenv from 'dotenv';
import * as path from 'path';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const HOST = process.env.TWOBIGHA_API_HOST || 'https://admin-staging.2bigha.net';
const KEY = process.env.TWOBIGHA_API_KEY || '0ab4fe164b5f92b7118e78ddb8fabb921cbdc32bb4fc6994';
const SECRET = process.env.TWOBIGHA_API_SECRET || '95a31ad47521a1d7f6963cd662a4d869864f61dfce2104f269e6d7831f70db33';
const MONGO_URI = process.env.MONGO_URI_CRM || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mathionix-crm';

async function graphql(query: string, variables: Record<string, any> = {}) {
  const url = `${HOST.replace(/\/$/, '')}/graphql`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': KEY,
      'X-API-Secret': SECRET,
      'x-api-key': KEY,
      'x-api-secret': SECRET,
      'x-key': KEY,
      'x-secret': SECRET,
      'x-role': 'super_admin',
      'apollo-require-preflight': 'true',
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function run() {
  console.log('--- 1. Querying 2Bigha for live properties and client/owner records ---');

  // Let's get sample properties from getPropertiesByClientId
  const propRes = await graphql(`
    query {
      getPropertiesByClientId(page: 1, limit: 30) {
        result {
          id
          title
          clientName
          clientPhone
          createdByName
          createdByUserName
        }
      }
    }
  `);

  console.log('Sample properties found:', propRes?.data?.getPropertiesByClientId?.result?.length);

  // Also query getAllLead from the handbook
  const leadsRes = await graphql(`
    query GetAllLead($page: Int, $limit: Int) {
      getAllLead(page: $page, limit: $limit) {
        result {
          Id
          clientName
          phone
          email
          leadSource
        }
        totalCount
      }
    }
  `, { page: 1, limit: 20 });
  console.log('Sample leads found:', JSON.stringify(leadsRes?.data?.getAllLead?.result?.slice(0, 5), null, 2));

  // Connect to MongoDB
  console.log(`\nConnecting to Mongo at ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection;
  const clientsColl = db.collection('clients');

  // Let's collect candidates to seed
  const candidates: Array<{
    name: string;
    email: string;
    phone: string;
    role: string;
    twobighaUserId: string;
  }> = [];

  // If leads returned result
  if (leadsRes?.data?.getAllLead?.result) {
    for (const l of leadsRes.data.getAllLead.result) {
      if (l.clientName || l.phone || l.email) {
        candidates.push({
          name: l.clientName || '2Bigha Client',
          email: l.email || `client_${l.Id || Math.floor(Math.random()*10000)}@2bigha.com`,
          phone: l.phone || '9876543210',
          role: 'OWNER',
          twobighaUserId: String(l.Id || '1'),
        });
      }
    }
  }

  // Also add clients discovered from getPropertiesByClientId
  if (propRes?.data?.getPropertiesByClientId?.result) {
    for (const p of propRes.data.getPropertiesByClientId.result) {
      const name = p.clientName || p.createdByUserName || p.createdByName;
      if (name && name.trim()) {
        candidates.push({
          name: name.trim(),
          email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@2bigha.client.in`,
          phone: p.clientPhone || '9876543210',
          role: 'OWNER',
          twobighaUserId: p.id, // Property or user link
        });
      }
    }
  }

  // Add 3 rich test clients with known 2Bigha IDs (including sample test ID 1, Don Chota, Surender Singh, etc.)
  candidates.unshift(
    {
      name: 'Don Chota',
      email: 'don.chota@2bigha.com',
      phone: '8897163105',
      role: 'OWNER',
      twobighaUserId: 'ce98d8ed-ab14-4490-ad99-f55e3cda32bc',
    },
    {
      name: 'Surender Singh',
      email: 'surender.singh@2bigha.com',
      phone: '9416410971',
      role: 'OWNER',
      twobighaUserId: 'c9991381-67b6-41da-837d-babb67598895',
    },
    {
      name: 'Dharmi Chand',
      email: 'dharmi.chand@2bigha.com',
      phone: '9876500001',
      role: 'OWNER',
      twobighaUserId: 'a6da32ba-5825-4f53-9fca-c760207378d1',
    },
    {
      name: 'Global 2Bigha Master Client',
      email: 'master.client@2bigha.net',
      phone: '9123456789',
      role: 'OWNER',
      twobighaUserId: '1',
    }
  );

  console.log(`Seeding/updating ${candidates.length} clients in CRM database...`);
  for (const c of candidates) {
    const existing = await clientsColl.findOne({ email: c.email });
    if (existing) {
      await clientsColl.updateOne(
        { _id: existing._id },
        {
          $set: {
            twobighaUserId: c.twobighaUserId,
            twobighaSyncStatus: 'synced',
            twobighaSyncedAt: new Date(),
            phone: c.phone,
            role: c.role,
          },
        }
      );
      console.log(`Updated existing client ${c.name} (${c.email}) -> 2bighaUserId: ${c.twobighaUserId}`);
    } else {
      await clientsColl.insertOne({
        name: c.name,
        email: c.email,
        phone: c.phone,
        role: c.role,
        status: 'active',
        twobighaUserId: c.twobighaUserId,
        twobighaSyncStatus: 'synced',
        twobighaSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`Created new synced client ${c.name} (${c.email}) -> 2bighaUserId: ${c.twobighaUserId}`);
    }
  }

  console.log('\nSeeding completed successfully!');
  await mongoose.disconnect();
}

run().catch(console.error);

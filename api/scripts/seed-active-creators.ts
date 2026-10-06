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
  console.log('Finding all creators and users with non-zero properties...');

  // Query admins from getAllAdmins
  const adminsRes = await graphql(`
    query {
      getAllAdmins(limit: 50) {
        admins {
          id
          email
          firstName
          lastName
          phone
        }
      }
    }
  `);

  const admins = adminsRes?.data?.getAllAdmins?.admins || [];
  console.log(`Checking ${admins.length} admins/creators for properties...`);

  await mongoose.connect(MONGO_URI);
  const clientsColl = mongoose.connection.collection('clients');

  const activeCreators: any[] = [];

  for (const a of admins) {
    const res = await graphql(`
      query($createdBy: ID) {
        getPropertiesByClientId(createdBy: $createdBy) {
          totalCount
          counts {
            all
            approved
            pending
            rejected
            flagged
          }
        }
      }
    `, { createdBy: a.id });

    const total = res?.data?.getPropertiesByClientId?.totalCount || 0;
    const counts = res?.data?.getPropertiesByClientId?.counts;

    if (total > 0) {
      console.log(`FOUND ACTIVE CREATOR: ${a.firstName} ${a.lastName} (${a.email}) -> ID: ${a.id}, Total Properties: ${total}`, counts);
      activeCreators.push({
        ...a,
        total,
        counts,
      });

      // Save/update as a special synced client in CRM
      const name = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email;
      await clientsColl.updateOne(
        { email: a.email },
        {
          $set: {
            name: `${name} (Active 2Bigha Creator - ${total} Properties)`,
            email: a.email,
            phone: a.phone || '+919876543210',
            role: 'AGENT',
            status: 'active',
            twobighaUserId: a.id,
            twobighaSyncStatus: 'synced',
            twobighaSyncedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }

  console.log(`\nSeeded ${activeCreators.length} active creators with properties into CRM.`);
  await mongoose.disconnect();
}

run().catch(console.error);

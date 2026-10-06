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
  console.log('--- 1. Creating Real Platform Users on 2Bigha via adminCreateUser ---');
  
  const testClients = [
    {
      email: `rajesh.patel.${Date.now()}@2bigha.test`,
      firstName: 'Rajesh',
      lastName: 'Patel',
      role: 'OWNER',
      phone: '+919876500111',
      city: 'Gurgaon',
      state: 'Haryana',
    },
    {
      email: `vikram.mehta.${Date.now()}@2bigha.test`,
      firstName: 'Vikram',
      lastName: 'Mehta',
      role: 'OWNER',
      phone: '+919876500222',
      city: 'Dehradun',
      state: 'Uttarakhand',
    },
    {
      email: `ananya.deshmukh.${Date.now()}@2bigha.test`,
      firstName: 'Ananya',
      lastName: 'Deshmukh',
      role: 'OWNER',
      phone: '+919876500333',
      city: 'Mathura',
      state: 'Uttar Pradesh',
    },
  ];

  await mongoose.connect(MONGO_URI);
  const clientsColl = mongoose.connection.collection('clients');

  for (const tc of testClients) {
    console.log(`\nCalling adminCreateUser for ${tc.firstName} ${tc.lastName} (${tc.email})...`);
    const createRes = await graphql(`
      mutation AdminCreateUser($input: PlatformUserInput!) {
        adminCreateUser(input: $input) {
          success
          message
          user {
            id
            email
            firstName
            lastName
            role
          }
        }
      }
    `, {
      input: {
        email: tc.email,
        firstName: tc.firstName,
        lastName: tc.lastName,
        role: tc.role,
        profile: {
          phone: tc.phone,
          address: `${tc.city}, ${tc.state}`,
        }
      }
    });

    console.log('Create result:', JSON.stringify(createRes, null, 2));
    const realTwobighaUserId = createRes?.data?.adminCreateUser?.user?.id;

    if (realTwobighaUserId) {
      console.log(`Verifying getUser(${realTwobighaUserId})...`);
      const getRes = await graphql(`
        query GetUser($id: ID!) {
          getUser(id: $id) {
            id
            email
            firstName
            lastName
            role
            profile {
              phone
              city
              state
            }
          }
        }
      `, { id: realTwobighaUserId });
      console.log('getUser result:', JSON.stringify(getRes, null, 2));

      console.log(`Verifying getClientMetaData(${realTwobighaUserId})...`);
      const metaRes = await graphql(`
        query GetClientMetaData($clientId: ID!) {
          getClientMetaData(clientId: $clientId) {
            client {
              id
              name
              email
            }
            property {
              total
              approved
              pending
            }
            farm {
              total
              approved
            }
            subscription {
              planName
              status
            }
          }
        }
      `, { clientId: realTwobighaUserId });
      console.log('getClientMetaData result:', JSON.stringify(metaRes, null, 2));

      // Save into Mongo as CRM Client
      const doc = {
        name: `${tc.firstName} ${tc.lastName}`,
        email: tc.email,
        phone: tc.phone,
        role: tc.role,
        status: 'active',
        address: `${tc.city}, ${tc.state}`,
        twobighaUserId: String(realTwobighaUserId),
        twobighaSyncStatus: 'synced',
        twobighaSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await clientsColl.insertOne(doc);
      console.log(`Saved client ${doc.name} into MongoDB with twobighaUserId: ${realTwobighaUserId}`);
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);

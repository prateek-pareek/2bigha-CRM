const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017/crm');
  try {
    await client.connect();
    const db = client.db('crm');
    
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`Collection: ${col.name}, Count: ${count}`);
      if (col.name.startsWith('workflow') && count > 0) {
        const docs = await db.collection(col.name).find({}).toArray();
        console.log(`Docs for ${col.name}:`, JSON.stringify(docs, null, 2));
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run();

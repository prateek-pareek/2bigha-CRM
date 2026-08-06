const mongoose = require('mongoose');

async function test() {
  const uri = 'mongodb://127.0.0.1:27017/hrms';
  console.log('Connecting to:', uri);
  await mongoose.connect(uri);
  console.log('Connected!');
  
  const conn = mongoose.connection;
  const collections = await conn.db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));
  
  const uploads = await conn.db.collection('uploads').find().toArray();
  console.log('Uploads count:', uploads.length);
  for (const upload of uploads) {
    console.log('Upload:', {
      filename: upload.filename,
      originalName: upload.originalName,
      mimeType: upload.mimeType,
      size: upload.size,
      dataType: typeof upload.data,
      hasBuffer: !!upload.data?.buffer,
    });
  }
  
  await mongoose.disconnect();
}

test().catch(console.error);

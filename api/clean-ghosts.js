const mongoose = require('mongoose');

async function cleanGhosts() {
  const pmConn = await mongoose.createConnection('mongodb://admin:admin@localhost:27017/mathionix_pm?authSource=admin');
  
  // Find users in PM
  const pmUsers = await pmConn.collection('users').find({}).toArray();
  
  // Find users in HRMS
  await mongoose.connect('mongodb://admin:admin@localhost:27017/mathionix_hrms?authSource=admin');
  const hrmsUsers = await mongoose.connection.collection('users').find({}).toArray();
  const hrmsEmails = new Set(hrmsUsers.map(u => u.email.toLowerCase()));
  
  // Delete PM users not in HRMS
  let deletedCount = 0;
  for (const pmUser of pmUsers) {
    if (pmUser.email !== 'admin@mathionix.com' && pmUser.email !== 'manager@mathionix.com' && pmUser.email !== 'employee@mathionix.com') {
       if (!hrmsEmails.has(pmUser.email.toLowerCase())) {
          console.log(`Deleting ghost PM user: ${pmUser.email} (Name: ${pmUser.fullName})`);
          await pmConn.collection('users').deleteOne({ _id: pmUser._id });
          deletedCount++;
       }
    }
  }
  
  const crmConn = await mongoose.createConnection('mongodb://admin:admin@localhost:27017/mathionix_crm?authSource=admin');
  const crmUsers = await crmConn.collection('users').find({}).toArray();
  for (const crmUser of crmUsers) {
    if (crmUser.email !== 'admin@mathionix.com' && crmUser.email !== 'manager@mathionix.com' && crmUser.email !== 'employee@mathionix.com') {
       if (!hrmsEmails.has(crmUser.email.toLowerCase())) {
          console.log(`Deleting ghost CRM user: ${crmUser.email}`);
          await crmConn.collection('users').deleteOne({ _id: crmUser._id });
       }
    }
  }

  console.log(`Deleted ${deletedCount} ghost users from satellite DBs.`);
  process.exit(0);
}
cleanGhosts();

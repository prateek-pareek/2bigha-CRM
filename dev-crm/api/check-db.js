const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb://admin:admin@localhost:27017/mathionix_hrms?authSource=admin');
  
  const hrmsUsers = await mongoose.connection.collection('users').find({}).toArray();
  console.log("HRMS Users:");
  hrmsUsers.forEach(u => console.log(u.email, u.firstName, u.lastName, u.role));

  const employees = await mongoose.connection.collection('employees').find({}).toArray();
  console.log("\nEmployees:");
  employees.forEach(e => console.log(e.employeeId, e.firstName, e.lastName, e.email));

  const pmConn = await mongoose.createConnection('mongodb://admin:admin@localhost:27017/mathionix_pm?authSource=admin');
  const pmUsers = await pmConn.collection('users').find({}).toArray();
  console.log("\nPM Users:");
  pmUsers.forEach(u => console.log(u.email, u.fullName, u.role, u._id));

  process.exit(0);
}
check();

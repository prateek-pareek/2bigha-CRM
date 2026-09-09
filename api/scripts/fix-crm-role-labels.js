const roles = db.roles.find({}, { name: 1 }).toArray();
const byId = {};
roles.forEach((r) => {
  byId[String(r._id)] = r.name;
});

let n = 0;
db.crmusers.find({ roleId: { $ne: null } }).forEach((u) => {
  const name = byId[String(u.roleId)];
  if (!name) {
    print('no role doc for ' + u.email + ' roleId=' + u.roleId);
    return;
  }
  if (u.role !== name || u.provisioningStatus === 'pending_access') {
    db.crmusers.updateOne(
      { _id: u._id },
      {
        $set: {
          role: name,
          provisioningStatus:
            u.provisioningStatus === 'pending_access' || !u.provisioningStatus
              ? 'active'
              : u.provisioningStatus,
          isActive: true,
        },
      },
    );
    print('fixed ' + u.email + ' -> ' + name);
    n++;
  } else {
    print('ok ' + u.email + ' = ' + name);
  }
});

print('updated=' + n);
print('--- still Unassigned ---');
db.crmusers
  .find({ role: 'Unassigned' }, { email: 1, roleId: 1, provisioningStatus: 1 })
  .forEach((u) =>
    print(
      u.email +
        ' roleId=' +
        u.roleId +
        ' prov=' +
        u.provisioningStatus,
    ),
  );
